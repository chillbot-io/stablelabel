"""Tests for app.worker.deferred_classify — unit tests with mocked dependencies."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from app.models.document import JobStatus, LabelJobResult
from app.services.policy_engine import ClassificationResult, EntityMatch

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

TENANT_ID = "tid-aaa"
CUSTOMER_TENANT_ID = str(uuid.UUID("00000000-0000-0000-0000-000000000002"))
MSP_TENANT_ID = str(uuid.UUID("00000000-0000-0000-0000-000000000001"))
JOB_ID = str(uuid.uuid4())
DRIVE_ID = "drive-1"
ITEM_ID = "item-1"
FILENAME = "report.docx"
TEXT = "John Doe SSN 123-45-6789"
SCAN_RESULT_ID = str(uuid.uuid4())
LABEL_ID = "label-abc"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

MODULE = "app.worker.deferred_classify"


def _entity(entity_type: str = "US_SSN", confidence: float = 0.95) -> EntityMatch:
    return EntityMatch(entity_type=entity_type, confidence=confidence, start=0, end=10)


def _classification(entities=None, error="", filename=FILENAME) -> ClassificationResult:
    return ClassificationResult(
        filename=filename,
        entities=entities or [],
        error=error,
        text_content=TEXT,
    )


@dataclass
class _PolicyMatch:
    policy_name: str
    target_label_id: str


def _base_kwargs(**overrides) -> dict:
    """Return the standard keyword arguments for classify_and_label_file."""
    defaults = dict(
        tenant_id=TENANT_ID,
        customer_tenant_id=CUSTOMER_TENANT_ID,
        msp_tenant_id=MSP_TENANT_ID,
        job_id=JOB_ID,
        drive_id=DRIVE_ID,
        item_id=ITEM_ID,
        filename=FILENAME,
        text=TEXT,
        scan_result_id=SCAN_RESULT_ID,
    )
    defaults.update(overrides)
    return defaults


class _FakeSession:
    """Lightweight async-compatible DB session stand-in."""

    def __init__(self):
        self.added: list = []
        self.executed: list = []
        self.committed = 0

    def add(self, obj):
        self.added.append(obj)

    async def execute(self, stmt):
        self.executed.append(stmt)
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        return result

    async def commit(self):
        self.committed += 1


async def _mock_get_session(fake_db):
    """Return an async generator that yields *fake_db* once."""

    async def _gen():
        yield fake_db

    return _gen


# ---------------------------------------------------------------------------
# Tests for helper functions
# ---------------------------------------------------------------------------


class TestTopClassification:
    def test_with_entities(self):
        from app.worker.deferred_classify import _top_classification

        cr = _classification(entities=[_entity("EMAIL", 0.7), _entity("US_SSN", 0.95)])
        etype, conf = _top_classification(cr)
        assert etype == "US_SSN"
        assert conf == 0.95

    def test_without_entities(self):
        from app.worker.deferred_classify import _top_classification

        cr = _classification(entities=[])
        etype, conf = _top_classification(cr)
        assert etype is None
        assert conf is None

    def test_single_entity(self):
        from app.worker.deferred_classify import _top_classification

        cr = _classification(entities=[_entity("CREDIT_CARD", 0.8)])
        etype, conf = _top_classification(cr)
        assert etype == "CREDIT_CARD"
        assert conf == 0.8


class TestUpdateScanResult:
    async def test_outcome_only(self):
        from app.worker.deferred_classify import _update_scan_result

        db = _FakeSession()
        await _update_scan_result(
            db,
            SCAN_RESULT_ID,
            outcome="failed",
            classification=None,
            confidence=None,
        )
        assert db.committed == 1
        assert len(db.executed) == 1

    async def test_with_all_fields(self):
        from app.worker.deferred_classify import _update_scan_result

        db = _FakeSession()
        await _update_scan_result(
            db,
            SCAN_RESULT_ID,
            outcome="labelled",
            classification="US_SSN",
            confidence=0.95,
            label_applied=LABEL_ID,
        )
        assert db.committed == 1


class TestIncrementJobCounter:
    async def test_labelled(self):
        from app.worker.deferred_classify import _increment_job_counter

        db = _FakeSession()
        await _increment_job_counter(db, uuid.UUID(JOB_ID), "labelled")
        assert db.committed == 1
        assert len(db.executed) == 1

    async def test_skipped(self):
        from app.worker.deferred_classify import _increment_job_counter

        db = _FakeSession()
        await _increment_job_counter(db, uuid.UUID(JOB_ID), "skipped")
        assert db.committed == 1

    async def test_failed(self):
        from app.worker.deferred_classify import _increment_job_counter

        db = _FakeSession()
        await _increment_job_counter(db, uuid.UUID(JOB_ID), "failed")
        assert db.committed == 1


# ---------------------------------------------------------------------------
# Tests for the main function — classify_and_label_file
# ---------------------------------------------------------------------------


def _patch_all(
    classification=None,
    policy_match=None,
    policy_rules=None,
    apply_result=None,
    fake_db=None,
):
    """Return a dict of patches for classify_and_label_file dependencies."""
    if fake_db is None:
        fake_db = _FakeSession()
    if classification is None:
        classification = _classification()

    async def _session_gen():
        yield fake_db

    patches = {
        "get_session": patch(f"{MODULE}.get_session", return_value=_session_gen()),
        "classify": patch(
            f"{MODULE}.classify_content_chunked",
            new_callable=AsyncMock,
            return_value=classification,
        ),
        "evaluate": patch(
            f"{MODULE}.evaluate_policies",
            return_value=policy_match,
        ),
        "policies_from_db": patch(
            f"{MODULE}.policies_from_db",
            return_value=policy_rules or [],
        ),
        "doc_service": patch(f"{MODULE}.get_document_service"),
    }
    return patches, fake_db


class TestClassifyAndLabelFile:
    """Tests for the main classify_and_label_file function."""

    async def test_classification_error_marks_failed(self):
        cr = _classification(error="Engine unavailable")
        patches, fake_db = _patch_all(classification=cr)

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"],
        ):
            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file({}, **_base_kwargs())

        # Should have updated scan result as "failed"
        assert fake_db.committed >= 1

    async def test_no_entities_no_policy_skipped(self):
        """No entities detected -> no policy match -> skipped."""
        cr = _classification(entities=[])
        patches, fake_db = _patch_all(classification=cr, policy_rules=["rule1"])

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"] as mock_eval,
            patches["policies_from_db"],
            patches["doc_service"],
        ):
            mock_eval.return_value = None
            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file({}, **_base_kwargs())

        # Should be skipped because evaluate_policies returned None
        assert fake_db.committed >= 1

    async def test_policy_match_label_applied_completed(self):
        """Policy match -> apply label -> COMPLETED -> labelled."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        pm = _PolicyMatch(policy_name="SSN Policy", target_label_id=LABEL_ID)
        apply_result = LabelJobResult(
            drive_id=DRIVE_ID,
            item_id=ITEM_ID,
            filename=FILENAME,
            status=JobStatus.COMPLETED,
        )
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=pm,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_svc.apply_label.return_value = apply_result
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file({}, **_base_kwargs())

        mock_svc.apply_label.assert_awaited_once()
        assert fake_db.committed >= 1

    async def test_completed_with_msp_creates_audit_event(self):
        """COMPLETED with msp_tenant_id -> AuditEvent added."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        pm = _PolicyMatch(policy_name="SSN Policy", target_label_id=LABEL_ID)
        apply_result = LabelJobResult(
            drive_id=DRIVE_ID,
            item_id=ITEM_ID,
            filename=FILENAME,
            status=JobStatus.COMPLETED,
        )
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=pm,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_svc.apply_label.return_value = apply_result
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file(
                {}, **_base_kwargs(msp_tenant_id=MSP_TENANT_ID)
            )

        # Audit event should have been added
        audit_events = [
            o for o in fake_db.added if type(o).__name__ == "AuditEvent"
        ]
        assert len(audit_events) >= 1
        assert audit_events[-1].event_type == "file.labelled"

    async def test_completed_without_msp_no_audit_event(self):
        """COMPLETED with msp_tenant_id=None -> no AuditEvent."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        pm = _PolicyMatch(policy_name="SSN Policy", target_label_id=LABEL_ID)
        apply_result = LabelJobResult(
            drive_id=DRIVE_ID,
            item_id=ITEM_ID,
            filename=FILENAME,
            status=JobStatus.COMPLETED,
        )
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=pm,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_svc.apply_label.return_value = apply_result
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file(
                {}, **_base_kwargs(msp_tenant_id=None)
            )

        audit_events = [
            o for o in fake_db.added if type(o).__name__ == "AuditEvent"
        ]
        assert len(audit_events) == 0

    async def test_failed_unsupported_marks_skipped(self):
        """FAILED with 'Unsupported' in error -> outcome='skipped'."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        pm = _PolicyMatch(policy_name="SSN Policy", target_label_id=LABEL_ID)
        apply_result = LabelJobResult(
            drive_id=DRIVE_ID,
            item_id=ITEM_ID,
            filename=FILENAME,
            status=JobStatus.FAILED,
            error="Unsupported file format",
        )
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=pm,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_svc.apply_label.return_value = apply_result
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file(
                {}, **_base_kwargs(msp_tenant_id=None)
            )

        # Should not create audit event for skipped unsupported
        assert fake_db.committed >= 1

    async def test_failed_other_error_marks_failed(self):
        """FAILED with non-Unsupported error -> outcome='failed'."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        pm = _PolicyMatch(policy_name="SSN Policy", target_label_id=LABEL_ID)
        apply_result = LabelJobResult(
            drive_id=DRIVE_ID,
            item_id=ITEM_ID,
            filename=FILENAME,
            status=JobStatus.FAILED,
            error="Graph API 500",
        )
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=pm,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_svc.apply_label.return_value = apply_result
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file(
                {}, **_base_kwargs(msp_tenant_id=MSP_TENANT_ID)
            )

        # Should create audit event for failed labelling with MSP
        audit_events = [
            o for o in fake_db.added if type(o).__name__ == "AuditEvent"
        ]
        assert any(e.event_type == "file.label_failed" for e in audit_events)

    async def test_failed_other_error_no_msp_no_audit(self):
        """FAILED with msp_tenant_id=None -> no AuditEvent even on failure."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        pm = _PolicyMatch(policy_name="SSN Policy", target_label_id=LABEL_ID)
        apply_result = LabelJobResult(
            drive_id=DRIVE_ID,
            item_id=ITEM_ID,
            filename=FILENAME,
            status=JobStatus.FAILED,
            error="Graph API 500",
        )
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=pm,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_svc.apply_label.return_value = apply_result
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file(
                {}, **_base_kwargs(msp_tenant_id=None)
            )

        audit_events = [
            o for o in fake_db.added if type(o).__name__ == "AuditEvent"
        ]
        assert len(audit_events) == 0

    async def test_other_status_marks_failed(self):
        """Unexpected status (e.g. TIMEOUT) -> outcome='failed'."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        pm = _PolicyMatch(policy_name="SSN Policy", target_label_id=LABEL_ID)
        apply_result = LabelJobResult(
            drive_id=DRIVE_ID,
            item_id=ITEM_ID,
            filename=FILENAME,
            status=JobStatus.TIMEOUT,
        )
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=pm,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_svc.apply_label.return_value = apply_result
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file({}, **_base_kwargs())

        assert fake_db.committed >= 1

    async def test_dry_run_does_not_apply_label(self):
        """dry_run=True -> outcome='labelled' but no apply_label call."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        pm = _PolicyMatch(policy_name="SSN Policy", target_label_id=LABEL_ID)
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=pm,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file(
                {}, **_base_kwargs(dry_run=True)
            )

        mock_svc.apply_label.assert_not_awaited()
        assert fake_db.committed >= 1

    async def test_static_label_no_policies(self):
        """use_policies=False with static_label_id -> uses static label."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        apply_result = LabelJobResult(
            drive_id=DRIVE_ID,
            item_id=ITEM_ID,
            filename=FILENAME,
            status=JobStatus.COMPLETED,
        )
        patches, fake_db = _patch_all(
            classification=cr,
            policy_rules=[],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"] as mock_eval,
            patches["policies_from_db"],
            patches["doc_service"] as mock_doc_svc_fn,
        ):
            mock_svc = AsyncMock()
            mock_svc.apply_label.return_value = apply_result
            mock_doc_svc_fn.return_value = mock_svc

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file(
                {},
                **_base_kwargs(
                    use_policies=False,
                    static_label_id=LABEL_ID,
                ),
            )

        # evaluate_policies should NOT be called
        mock_eval.assert_not_called()
        mock_svc.apply_label.assert_awaited_once()

    async def test_static_label_empty_skipped(self):
        """use_policies=False with empty static_label_id -> skipped."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        patches, fake_db = _patch_all(classification=cr)

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"],
        ):
            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file(
                {},
                **_base_kwargs(
                    use_policies=False,
                    static_label_id="",
                ),
            )

        assert fake_db.committed >= 1

    async def test_no_policy_match_skipped(self):
        """Policies loaded but none match -> skipped."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=None,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"],
        ):
            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file({}, **_base_kwargs())

        assert fake_db.committed >= 1

    async def test_exception_during_processing_marks_failed(self):
        """Unexpected exception -> outcome='failed'."""
        patches, fake_db = _patch_all()

        with (
            patches["get_session"],
            patches["classify"] as mock_classify,
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"],
        ):
            mock_classify.side_effect = RuntimeError("boom")

            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file({}, **_base_kwargs())

        # Should still update scan result as failed
        assert fake_db.committed >= 1

    async def test_classification_events_persisted(self):
        """Entities are grouped and persisted as ClassificationEvent records."""
        entities = [
            _entity("US_SSN", 0.95),
            _entity("US_SSN", 0.80),
            _entity("EMAIL", 0.70),
        ]
        cr = _classification(entities=entities)
        patches, fake_db = _patch_all(
            classification=cr,
            policy_match=None,
            policy_rules=["rule1"],
        )

        with (
            patches["get_session"],
            patches["classify"],
            patches["evaluate"],
            patches["policies_from_db"],
            patches["doc_service"],
        ):
            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file({}, **_base_kwargs())

        # Two entity types: US_SSN and EMAIL
        classification_events = [
            o for o in fake_db.added if type(o).__name__ == "ClassificationEvent"
        ]
        assert len(classification_events) == 2
        types = {e.entity_type for e in classification_events}
        assert types == {"US_SSN", "EMAIL"}

    async def test_no_policies_loaded_skipped(self):
        """use_policies=True but no policies in DB -> no match -> skipped."""
        entities = [_entity("US_SSN", 0.95)]
        cr = _classification(entities=entities)
        fake_db = _FakeSession()

        async def _session_gen():
            yield fake_db

        with (
            patch(f"{MODULE}.get_session", return_value=_session_gen()),
            patch(
                f"{MODULE}.classify_content_chunked",
                new_callable=AsyncMock,
                return_value=cr,
            ),
            patch(f"{MODULE}.evaluate_policies") as mock_eval,
            patch(f"{MODULE}.policies_from_db", return_value=[]),
            patch(f"{MODULE}.get_document_service"),
        ):
            # policies_from_db returns [] -> policy_rules is falsy
            # so evaluate_policies should NOT be called
            from app.worker.deferred_classify import classify_and_label_file

            await classify_and_label_file({}, **_base_kwargs())

        mock_eval.assert_not_called()
        assert fake_db.committed >= 1


class TestLoadTenantPolicies:
    async def test_calls_db_and_converts(self):
        from app.worker.deferred_classify import _load_tenant_policies

        fake_db = _FakeSession()
        ct_uuid = uuid.UUID(CUSTOMER_TENANT_ID)

        with patch(f"{MODULE}.policies_from_db", return_value=["rule1"]) as mock_pfdb:
            result = await _load_tenant_policies(fake_db, ct_uuid)

        assert result == ["rule1"]
        mock_pfdb.assert_called_once()
