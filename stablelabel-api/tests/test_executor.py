"""Tests for the job executor signal handling and failure logic."""

import io
import uuid
import zipfile
from dataclasses import dataclass, field
from unittest.mock import AsyncMock, MagicMock, call, patch

import pytest

from app.core.redis import JobSignal
from app.worker.executor import (
    JobExecutor,
    _extract_text_from_bytes,
    _extract_docx,
    _extract_xlsx,
    _extract_pptx,
    _extract_pdf,
    _validate_zip_safety,
    _ZipBombError,
    _top_classification,
    _LABELLING_BATCH_SIZE,
    _MAX_FILE_SIZE,
    _STREAM_THRESHOLD,
    _ZIP_MAX_ENTRIES,
    _ZIP_MAX_UNCOMPRESSED,
    _ZIP_MAX_RATIO,
    _ZIP_MAX_SINGLE_FILE,
)
from app.services.policy_engine import ClassificationResult, EntityMatch


class TestExecutorSignalHandling:
    """Test that the executor properly handles pause/cancel signals."""

    @pytest.fixture
    def executor(self):
        from app.worker.executor import JobExecutor

        ex = JobExecutor(
            db=AsyncMock(),
            graph=AsyncMock(),
            doc_service=AsyncMock(),
            redis=AsyncMock(),
        )
        # session.add() is sync — use MagicMock to avoid coroutine warnings
        ex._db.add = MagicMock()
        ex._redis.delete = AsyncMock()
        return ex

    @pytest.mark.asyncio
    async def test_handle_pause_signal_sets_paused(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"

        await executor._handle_signal(
            job, JobSignal.PAUSE, "labelling",
            {"phase": "labelling", "files_processed_index": 50},
            batch_number=5,
        )

        assert job.status == "paused"

    @pytest.mark.asyncio
    async def test_handle_cancel_signal_sets_failed(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"

        await executor._handle_signal(
            job, JobSignal.CANCEL, "labelling",
            {"phase": "labelling", "files_processed_index": 50},
            batch_number=5,
        )

        assert job.status == "failed"

    @pytest.mark.asyncio
    async def test_handle_signal_writes_checkpoint_and_commits(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()

        await executor._handle_signal(
            job, JobSignal.PAUSE, "enumeration",
            {"phase": "enumeration", "sites_completed": ["s1"]},
            batch_number=3,
        )

        # Should write checkpoint + commit
        assert executor._db.add.called
        executor._db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_handle_signal_acks_signal_via_redis_delete(self, executor) -> None:
        job = MagicMock()
        job.id = uuid.uuid4()

        await executor._handle_signal(
            job, JobSignal.PAUSE, "labelling", {}, batch_number=0,
        )

        # Verify signal was acknowledged (deleted from redis)
        executor._redis.delete.assert_awaited()

    @pytest.mark.asyncio
    async def test_pause_preserves_scope_cursor_data(self, executor) -> None:
        """Verify the checkpoint captures the cursor data passed in."""
        job = MagicMock()
        job.id = uuid.uuid4()
        executor._db.add = MagicMock()

        cursor = {"phase": "labelling", "files_processed_index": 42, "files_labelled": 40}
        await executor._handle_signal(job, JobSignal.PAUSE, "labelling", cursor, batch_number=7)

        # Extract the checkpoint that was added to the session
        added_obj = executor._db.add.call_args_list[0][0][0]
        assert added_obj.scope_cursor == cursor
        assert added_obj.batch_number == 7
        assert added_obj.checkpoint_type == "labelling"


class TestFailJob:
    @pytest.mark.asyncio
    async def test_fail_job_sets_status_and_error(self) -> None:
        from app.worker.executor import JobExecutor

        executor = JobExecutor(
            db=AsyncMock(), graph=AsyncMock(),
            doc_service=AsyncMock(), redis=AsyncMock(),
        )

        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"
        job.config = {"target_label_id": "abc"}

        await executor._fail_job(job, "Something went wrong")

        assert job.status == "failed"
        assert job.config["error"] == "Something went wrong"
        executor._db.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_fail_job_stores_error_in_config(self) -> None:
        from app.worker.executor import JobExecutor

        executor = JobExecutor(
            db=AsyncMock(), graph=AsyncMock(),
            doc_service=AsyncMock(), redis=AsyncMock(),
        )

        job = MagicMock()
        job.id = uuid.uuid4()
        job.status = "running"
        job.config = {"target_label_id": "keep-this"}

        await executor._fail_job(job, "disk full")

        # Error is stored alongside existing config (not replacing it)
        assert job.config["error"] == "disk full"
        assert job.config["target_label_id"] == "keep-this"


class TestBatchSize:
    def test_batch_size_within_bounds(self) -> None:
        from app.worker.executor import _LABELLING_BATCH_SIZE
        assert 10 <= _LABELLING_BATCH_SIZE <= 500


# ── Text extraction tests ──────────────────────────────────────


def _make_docx(text="Hello World"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        xml = (
            '<?xml version="1.0"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body></w:document>"
        )
        zf.writestr("word/document.xml", xml)
    return buf.getvalue()


def _make_xlsx(shared_texts=None, cell_values=None):
    buf = io.BytesIO()
    ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    with zipfile.ZipFile(buf, "w") as zf:
        if shared_texts:
            entries = "".join(f"<si><t>{t}</t></si>" for t in shared_texts)
            zf.writestr(
                "xl/sharedStrings.xml",
                f'<?xml version="1.0"?><sst xmlns="{ns}">{entries}</sst>',
            )
        cells = ""
        if cell_values:
            cells = "".join(f"<c><v>{v}</v></c>" for v in cell_values)
        zf.writestr(
            "xl/worksheets/sheet1.xml",
            f'<?xml version="1.0"?><worksheet xmlns="{ns}"><sheetData><row>{cells}</row></sheetData></worksheet>',
        )
    return buf.getvalue()


def _make_pptx(text="Slide text"):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        xml = (
            '<?xml version="1.0"?>'
            '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
            ' xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
            f"<p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>{text}</a:t></a:r></a:p>"
            "</p:txBody></p:sp></p:spTree></p:cSld></p:sld>"
        )
        zf.writestr("ppt/slides/slide1.xml", xml)
    return buf.getvalue()


class TestExtractTextFromBytes:
    def test_plain_text(self):
        assert _extract_text_from_bytes(b"hello world", "test.txt") == "hello world"

    def test_csv(self):
        assert "a,b" in _extract_text_from_bytes(b"a,b\n1,2", "data.csv")

    def test_json(self):
        assert "key" in _extract_text_from_bytes(b'{"key":"val"}', "data.json")

    def test_docx(self):
        content = _make_docx("Test Document")
        result = _extract_text_from_bytes(content, "test.docx")
        assert "Test Document" in result

    def test_docm(self):
        content = _make_docx("Macro doc")
        result = _extract_text_from_bytes(content, "test.docm")
        assert "Macro doc" in result

    def test_xlsx(self):
        content = _make_xlsx(shared_texts=["SSN 123-45-6789"])
        result = _extract_text_from_bytes(content, "data.xlsx")
        assert "SSN 123-45-6789" in result

    def test_xlsm(self):
        content = _make_xlsx(shared_texts=["data"])
        result = _extract_text_from_bytes(content, "data.xlsm")
        assert "data" in result

    def test_pptx(self):
        content = _make_pptx("Presentation")
        result = _extract_text_from_bytes(content, "slides.pptx")
        assert "Presentation" in result

    def test_pptm(self):
        content = _make_pptx("Macro slides")
        result = _extract_text_from_bytes(content, "slides.pptm")
        assert "Macro slides" in result

    def test_pdf_fallback(self):
        # PDF extraction may fail without pdfminer, should not crash
        result = _extract_text_from_bytes(b"%PDF-1.4 fake", "test.pdf")
        assert isinstance(result, str)

    def test_unknown_extension_utf8(self):
        result = _extract_text_from_bytes(b"some data", "file.xyz")
        assert result == "some data"

    def test_no_extension(self):
        result = _extract_text_from_bytes(b"content", "README")
        assert result == "content"

    def test_binary_fallback(self):
        result = _extract_text_from_bytes(b"\xff\xfe\x00\x01", "binary.bin")
        assert isinstance(result, str)


class TestExtractDocx:
    def test_valid_docx(self):
        result = _extract_docx(_make_docx("Hello"))
        assert "Hello" in result

    def test_missing_document_xml(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("other.xml", "<root/>")
        assert _extract_docx(buf.getvalue()) == ""

    def test_bad_zip(self):
        assert _extract_docx(b"not a zip") == ""

    def test_zip_bomb_detected(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            # Create too many entries
            for i in range(_ZIP_MAX_ENTRIES + 1):
                zf.writestr(f"file{i}.txt", "x")
            zf.writestr("word/document.xml", "<w:document xmlns:w='http://schemas.openxmlformats.org/wordprocessingml/2006/main'/>")
        assert _extract_docx(buf.getvalue()) == ""


class TestExtractXlsx:
    def test_shared_strings(self):
        content = _make_xlsx(shared_texts=["Alice", "Bob"])
        result = _extract_xlsx(content)
        assert "Alice" in result
        assert "Bob" in result

    def test_cell_values(self):
        content = _make_xlsx(cell_values=["123", "456"])
        result = _extract_xlsx(content)
        assert "123" in result
        assert "456" in result

    def test_bad_zip(self):
        assert _extract_xlsx(b"not a zip") == ""

    def test_empty_xlsx(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("xl/worksheets/sheet1.xml",
                '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>')
        result = _extract_xlsx(buf.getvalue())
        assert result == ""


class TestExtractPptx:
    def test_valid_pptx(self):
        result = _extract_pptx(_make_pptx("Hello Slides"))
        assert "Hello Slides" in result

    def test_bad_zip(self):
        assert _extract_pptx(b"not a zip") == ""

    def test_no_slides(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("other.xml", "<root/>")
        assert _extract_pptx(buf.getvalue()) == ""


class TestExtractPdf:
    def test_invalid_pdf_returns_empty(self):
        assert _extract_pdf(b"not a pdf") == ""


class TestValidateZipSafety:
    def test_safe_zip_passes(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("file.txt", "hello")
        buf.seek(0)
        with zipfile.ZipFile(buf) as zf:
            _validate_zip_safety(zf, "test.zip")  # should not raise

    def test_too_many_entries(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            for i in range(_ZIP_MAX_ENTRIES + 1):
                zf.writestr(f"f{i}.txt", "x")
        buf.seek(0)
        with zipfile.ZipFile(buf) as zf:
            with pytest.raises(_ZipBombError, match="entries"):
                _validate_zip_safety(zf, "bomb.zip")

    def test_single_file_too_large(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("huge.txt", "x" * (_ZIP_MAX_SINGLE_FILE + 1))
        buf.seek(0)
        with zipfile.ZipFile(buf) as zf:
            with pytest.raises(_ZipBombError, match="uncompressed"):
                _validate_zip_safety(zf, "big.zip")

    def test_total_uncompressed_too_large(self):
        buf = io.BytesIO()
        chunk_size = _ZIP_MAX_SINGLE_FILE  # just under single limit
        num_files = (_ZIP_MAX_UNCOMPRESSED // chunk_size) + 2
        with zipfile.ZipFile(buf, "w") as zf:
            for i in range(num_files):
                zf.writestr(f"f{i}.txt", "x" * chunk_size)
        buf.seek(0)
        with zipfile.ZipFile(buf) as zf:
            with pytest.raises(_ZipBombError):
                _validate_zip_safety(zf, "total.zip")


class TestTopClassification:
    def test_no_classification(self):
        assert _top_classification(None) == (None, None)

    def test_empty_entities(self):
        cr = ClassificationResult(filename="test.txt")
        assert _top_classification(cr) == (None, None)

    def test_single_entity(self):
        cr = ClassificationResult(
            filename="test.txt",
            entities=[EntityMatch(entity_type="US_SSN", start=0, end=11, confidence=0.9)],
        )
        assert _top_classification(cr) == ("US_SSN", 0.9)

    def test_multiple_entities_picks_highest(self):
        cr = ClassificationResult(
            filename="test.txt",
            entities=[
                EntityMatch(entity_type="EMAIL", start=0, end=10, confidence=0.7),
                EntityMatch(entity_type="US_SSN", start=20, end=31, confidence=0.95),
            ],
        )
        assert _top_classification(cr) == ("US_SSN", 0.95)


# ── JobExecutor method tests ──────────────────────────────────


def _make_executor(**kwargs):
    ex = JobExecutor(
        db=AsyncMock(),
        graph=AsyncMock(),
        doc_service=AsyncMock(),
        redis=AsyncMock(),
        arq_pool=kwargs.get("arq_pool", AsyncMock()),
    )
    ex._db.add = MagicMock()
    return ex


def _make_job(**overrides):
    from datetime import datetime, UTC
    defaults = dict(
        id=uuid.uuid4(),
        name="Test Job",
        status="enumerating",
        config={"target_label_id": "label-1"},
        customer_tenant_id=uuid.uuid4(),
        created_by=uuid.uuid4(),
        total_files=0,
        processed_files=0,
        failed_files=0,
        skipped_files=0,
        schedule_cron=None,
        source_job_id=None,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        started_at=datetime.now(UTC),
        completed_at=None,
    )
    defaults.update(overrides)
    job = MagicMock()
    for k, v in defaults.items():
        setattr(job, k, v)
    return job


class TestJobExecutorRun:
    @pytest.mark.asyncio
    async def test_job_not_found_returns_early(self):
        ex = _make_executor()
        ex._load_job = AsyncMock(return_value=None)
        await ex.run("some-id")
        ex._load_job.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_tenant_not_found_fails_job(self):
        ex = _make_executor()
        job = _make_job()
        ex._load_job = AsyncMock(return_value=job)
        ex._get_tenant_info = AsyncMock(return_value=None)
        ex._fail_job = AsyncMock()
        await ex.run(str(job.id))
        ex._fail_job.assert_awaited_once()
        assert "Tenant not found" in ex._fail_job.call_args[0][1]

    @pytest.mark.asyncio
    async def test_enumerating_then_running_completes(self):
        ex = _make_executor()
        job = _make_job(status="enumerating")
        tenant_id = "t-123"
        msp_id = uuid.uuid4()
        ex._load_job = AsyncMock(return_value=job)
        ex._get_tenant_info = AsyncMock(return_value=(tenant_id, msp_id))
        ex._enumerate = AsyncMock()
        ex._label = AsyncMock()

        # After _enumerate, refresh returns the job. Simulate status transition.
        async def fake_refresh(obj):
            if obj.status == "enumerating":
                obj.status = "running"
        ex._db.refresh = AsyncMock(side_effect=fake_refresh)

        await ex.run(str(job.id))
        ex._enumerate.assert_awaited_once()
        ex._label.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_running_job_labels_and_completes(self):
        ex = _make_executor()
        job = _make_job(status="running")
        ex._load_job = AsyncMock(return_value=job)
        ex._get_tenant_info = AsyncMock(return_value=("t1", uuid.uuid4()))
        ex._label = AsyncMock()
        # After _label, refresh keeps status as running → gets set to completed
        ex._db.refresh = AsyncMock()
        await ex.run(str(job.id))
        ex._label.assert_awaited_once()
        assert job.status == "completed"

    @pytest.mark.asyncio
    async def test_exception_fails_job(self):
        ex = _make_executor()
        job = _make_job(status="enumerating")
        ex._load_job = AsyncMock(return_value=job)
        ex._get_tenant_info = AsyncMock(return_value=("t1", uuid.uuid4()))
        ex._enumerate = AsyncMock(side_effect=RuntimeError("boom"))
        ex._fail_job = AsyncMock()
        ex._db.refresh = AsyncMock()
        await ex.run(str(job.id))
        ex._fail_job.assert_awaited_once()


class TestJobExecutorRunRollback:
    @pytest.mark.asyncio
    async def test_job_not_found(self):
        ex = _make_executor()
        ex._load_job = AsyncMock(return_value=None)
        await ex.run_rollback("fake-id")

    @pytest.mark.asyncio
    async def test_tenant_not_found(self):
        ex = _make_executor()
        job = _make_job(status="rolling_back")
        ex._load_job = AsyncMock(return_value=job)
        ex._get_tenant_info = AsyncMock(return_value=None)
        ex._fail_job = AsyncMock()
        await ex.run_rollback(str(job.id))
        ex._fail_job.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_rollback_completes(self):
        ex = _make_executor()
        job = _make_job(status="rolling_back")
        ex._load_job = AsyncMock(return_value=job)
        ex._get_tenant_info = AsyncMock(return_value=("t1", uuid.uuid4()))
        ex._rollback = AsyncMock()
        ex._db.refresh = AsyncMock()
        await ex.run_rollback(str(job.id))
        assert job.status == "rolled_back"

    @pytest.mark.asyncio
    async def test_rollback_exception(self):
        ex = _make_executor()
        job = _make_job(status="rolling_back")
        ex._load_job = AsyncMock(return_value=job)
        ex._get_tenant_info = AsyncMock(return_value=("t1", uuid.uuid4()))
        ex._rollback = AsyncMock(side_effect=RuntimeError("fail"))
        ex._fail_job = AsyncMock()
        ex._db.refresh = AsyncMock()
        await ex.run_rollback(str(job.id))
        ex._fail_job.assert_awaited_once()


class TestDBHelpers:
    @pytest.mark.asyncio
    async def test_load_job_found(self):
        ex = _make_executor()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = _make_job()
        ex._db.execute = AsyncMock(return_value=mock_result)
        job = await ex._load_job(str(uuid.uuid4()))
        assert job is not None

    @pytest.mark.asyncio
    async def test_load_job_not_found(self):
        ex = _make_executor()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        ex._db.execute = AsyncMock(return_value=mock_result)
        assert await ex._load_job(str(uuid.uuid4())) is None

    @pytest.mark.asyncio
    async def test_get_tenant_info_found(self):
        ex = _make_executor()
        ct = MagicMock()
        ct.entra_tenant_id = "entra-123"
        ct.msp_tenant_id = uuid.uuid4()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = ct
        ex._db.execute = AsyncMock(return_value=mock_result)
        result = await ex._get_tenant_info(_make_job())
        assert result == ("entra-123", ct.msp_tenant_id)

    @pytest.mark.asyncio
    async def test_get_tenant_info_not_found(self):
        ex = _make_executor()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        ex._db.execute = AsyncMock(return_value=mock_result)
        assert await ex._get_tenant_info(_make_job()) is None

    @pytest.mark.asyncio
    async def test_get_latest_checkpoint(self):
        ex = _make_executor()
        cp = MagicMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = cp
        ex._db.execute = AsyncMock(return_value=mock_result)
        result = await ex._get_latest_checkpoint(uuid.uuid4(), "enumeration")
        assert result is cp

    @pytest.mark.asyncio
    async def test_collect_enumerated_files(self):
        ex = _make_executor()
        cp1 = MagicMock()
        cp1.scope_cursor = {"files_in_site": [{"name": "a.docx"}, {"name": "b.docx"}]}
        cp2 = MagicMock()
        cp2.scope_cursor = {"files_in_site": [{"name": "c.docx"}]}
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [cp1, cp2]
        ex._db.execute = AsyncMock(return_value=mock_result)
        files = await ex._collect_enumerated_files(uuid.uuid4())
        assert len(files) == 3


class TestClassifyFile:
    @pytest.mark.asyncio
    async def test_no_text_returns_empty(self):
        ex = _make_executor()
        ex._download_and_extract_text = AsyncMock(return_value=None)
        result = await ex._classify_file("t1", "d1", "i1", "test.docx")
        assert result.filename == "test.docx"
        assert not result.entities

    @pytest.mark.asyncio
    async def test_large_text_returns_deferred(self):
        ex = _make_executor()
        large_text = "x" * 600_000  # > 500KB
        ex._download_and_extract_text = AsyncMock(return_value=large_text)
        result = await ex._classify_file("t1", "d1", "i1", "big.docx")
        assert result.error == "deferred"
        assert result.text_content == large_text

    @pytest.mark.asyncio
    async def test_small_text_classifies(self):
        ex = _make_executor()
        ex._download_and_extract_text = AsyncMock(return_value="SSN 123-45-6789")
        cr = ClassificationResult(
            filename="test.docx",
            entities=[EntityMatch(entity_type="US_SSN", start=4, end=15, confidence=0.9)],
        )
        with patch("app.worker.executor.classify_content_async", new_callable=AsyncMock, return_value=cr):
            result = await ex._classify_file("t1", "d1", "i1", "test.docx")
        assert len(result.entities) == 1

    @pytest.mark.asyncio
    async def test_exception_returns_error(self):
        ex = _make_executor()
        ex._download_and_extract_text = AsyncMock(side_effect=RuntimeError("download failed"))
        result = await ex._classify_file("t1", "d1", "i1", "test.docx")
        assert "download failed" in result.error


class TestEnqueueDeferredClassification:
    @pytest.mark.asyncio
    async def test_no_arq_pool_returns_false(self):
        ex = _make_executor(arq_pool=None)
        ex._arq_pool = None
        result = await ex._enqueue_deferred_classification(
            job=_make_job(), tenant_id="t1", msp_tenant_id=uuid.uuid4(),
            drive_id="d1", item_id="i1", filename="big.docx", text="x" * 600000,
            use_policies=True, static_label_id="", assignment_method="standard",
            justification_text="", confirm_encryption=False, dry_run=False,
        )
        assert result is False

    @pytest.mark.asyncio
    async def test_success_returns_true(self):
        arq_pool = AsyncMock()
        ex = _make_executor(arq_pool=arq_pool)
        ex._db.flush = AsyncMock()
        result = await ex._enqueue_deferred_classification(
            job=_make_job(), tenant_id="t1", msp_tenant_id=uuid.uuid4(),
            drive_id="d1", item_id="i1", filename="big.docx", text="x" * 600000,
            use_policies=True, static_label_id="", assignment_method="standard",
            justification_text="", confirm_encryption=False, dry_run=False,
        )
        assert result is True
        arq_pool.enqueue_job.assert_awaited_once()


class TestResolveLabelViaPolicy:
    @pytest.mark.asyncio
    async def test_deferred_passthrough(self):
        ex = _make_executor()
        deferred = ClassificationResult(filename="big.docx", text_content="x" * 600000, error="deferred")
        ex._classify_file = AsyncMock(return_value=deferred)
        label_id, cr = await ex._resolve_label_via_policy("t1", "d1", "i1", "big.docx", [])
        assert label_id is None
        assert cr.error == "deferred"

    @pytest.mark.asyncio
    async def test_no_match_returns_none(self):
        ex = _make_executor()
        cr = ClassificationResult(filename="test.docx")
        ex._classify_file = AsyncMock(return_value=cr)
        with patch("app.worker.executor.evaluate_policies", return_value=None):
            label_id, result = await ex._resolve_label_via_policy("t1", "d1", "i1", "test.docx", [])
        assert label_id is None

    @pytest.mark.asyncio
    async def test_match_returns_label_id(self):
        ex = _make_executor()
        cr = ClassificationResult(
            filename="test.docx",
            entities=[EntityMatch(entity_type="US_SSN", start=0, end=11, confidence=0.9)],
        )
        ex._classify_file = AsyncMock(return_value=cr)
        match = MagicMock()
        match.policy_name = "HIPAA"
        match.target_label_id = "label-conf"
        with patch("app.worker.executor.evaluate_policies", return_value=match):
            label_id, result = await ex._resolve_label_via_policy(
                "t1", "d1", "i1", "test.docx", [], job=_make_job(),
            )
        assert label_id == "label-conf"


class TestDownloadAndExtractText:
    @pytest.mark.asyncio
    async def test_classifier_disabled_returns_none(self):
        ex = _make_executor()
        mock_settings = MagicMock()
        mock_settings.classifier_enabled = False
        with patch("app.dependencies.get_settings", return_value=mock_settings):
            result = await ex._download_and_extract_text("t1", "d1", "i1", "test.docx")
        assert result is None

    @pytest.mark.asyncio
    async def test_file_too_large_returns_none(self):
        ex = _make_executor()
        mock_settings = MagicMock()
        mock_settings.classifier_enabled = True
        ex._graph.get = AsyncMock(return_value={"size": _MAX_FILE_SIZE + 1})
        with patch("app.dependencies.get_settings", return_value=mock_settings):
            result = await ex._download_and_extract_text("t1", "d1", "i1", "test.docx")
        assert result is None

    @pytest.mark.asyncio
    async def test_no_download_url_returns_none(self):
        ex = _make_executor()
        mock_settings = MagicMock()
        mock_settings.classifier_enabled = True
        ex._graph.get = AsyncMock(return_value={"size": 100, "@microsoft.graph.downloadUrl": ""})
        with patch("app.dependencies.get_settings", return_value=mock_settings):
            result = await ex._download_and_extract_text("t1", "d1", "i1", "test.docx")
        assert result is None

    @pytest.mark.asyncio
    async def test_small_file_extracts_text(self):
        ex = _make_executor()
        mock_settings = MagicMock()
        mock_settings.classifier_enabled = True
        ex._graph.get = AsyncMock(return_value={
            "size": 100,
            "@microsoft.graph.downloadUrl": "https://example.com/file",
        })
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = b"Hello World"
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.get = AsyncMock(return_value=mock_resp)
        with patch("app.dependencies.get_settings", return_value=mock_settings):
            with patch("httpx.AsyncClient", return_value=mock_client):
                result = await ex._download_and_extract_text("t1", "d1", "i1", "test.txt")
        assert result == "Hello World"


class TestLoadTenantPolicies:
    @pytest.mark.asyncio
    async def test_loads_and_converts(self):
        ex = _make_executor()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        ex._db.execute = AsyncMock(return_value=mock_result)
        with patch("app.worker.shared.policies_from_db", return_value=[]) as mock_convert:
            result = await ex._load_tenant_policies(uuid.uuid4())
        mock_convert.assert_called_once()
        assert result == []


# ── Enumerate / Label / Rollback tests ─────────────────────────

import httpx
from app.core.exceptions import StableLabelError
from app.models.document import JobStatus, LabelJobResult
from app.services.policy_engine import ClassificationResult


class TestEnumerate:
    """Tests for the _enumerate method."""

    def _sites(self):
        return [
            {"id": "site-1", "displayName": "Site One"},
            {"id": "site-2", "displayName": "Site Two"},
        ]

    def _drives(self, site_id):
        return [{"id": f"drive-{site_id}"}]

    def _items(self, drive_id):
        return [
            {"id": f"file-{drive_id}-1", "name": f"doc-{drive_id}-1.docx", "file": {}},
            {"id": f"folder-{drive_id}", "name": "SomeFolder", "folder": {}},
        ]

    def _graph_side_effect(self, sites=None, drives_fn=None, items_fn=None):
        _sites = sites or self._sites()
        _drives_fn = drives_fn or self._drives
        _items_fn = items_fn or self._items

        async def _get_all_pages(tenant_id, url):
            if "/sites" in url and "drives" not in url:
                return _sites
            if "/drives" in url and "search" not in url:
                site_id = url.split("/sites/")[1].split("/drives")[0]
                return _drives_fn(site_id)
            if "search" in url:
                drive_id = url.split("/drives/")[1].split("/root")[0]
                return _items_fn(drive_id)
            return []
        return _get_all_pages

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_enumerate_walks_sites_and_creates_checkpoints(self, mock_signal):
        ex = _make_executor()
        job = _make_job(status="enumerating", config={})
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._graph.get_all_pages = AsyncMock(side_effect=self._graph_side_effect())

        await ex._enumerate(job, "tenant-1")

        # 2 sites, each with 1 file (folder is filtered out) → 2 checkpoints
        add_calls = ex._db.add.call_args_list
        checkpoint_calls = [c for c in add_calls if hasattr(c[0][0], "checkpoint_type") and c[0][0].checkpoint_type == "enumeration"]
        assert len(checkpoint_calls) == 2
        assert job.total_files == 2
        assert ex._db.commit.await_count >= 2

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_enumerate_skips_completed_sites(self, mock_signal):
        ex = _make_executor()
        job = _make_job(status="enumerating", config={})

        last_cp = MagicMock()
        last_cp.scope_cursor = {"sites_completed": ["site-1"], "total_files_found": 1}
        last_cp.batch_number = 0
        ex._get_latest_checkpoint = AsyncMock(return_value=last_cp)
        ex._graph.get_all_pages = AsyncMock(side_effect=self._graph_side_effect())

        await ex._enumerate(job, "tenant-1")

        # Only site-2 should be processed → 1 checkpoint added
        add_calls = ex._db.add.call_args_list
        checkpoint_calls = [c for c in add_calls if hasattr(c[0][0], "checkpoint_type") and c[0][0].checkpoint_type == "enumeration"]
        assert len(checkpoint_calls) == 1
        added_cp = checkpoint_calls[0][0][0]
        assert added_cp.scope_cursor["current_site"] == "site-2"

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_enumerate_respects_site_scope(self, mock_signal):
        ex = _make_executor()
        job = _make_job(status="enumerating", config={"site_ids": ["site-1"]})
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._graph.get_all_pages = AsyncMock(side_effect=self._graph_side_effect())

        await ex._enumerate(job, "tenant-1")

        add_calls = ex._db.add.call_args_list
        checkpoint_calls = [c for c in add_calls if hasattr(c[0][0], "checkpoint_type") and c[0][0].checkpoint_type == "enumeration"]
        assert len(checkpoint_calls) == 1
        assert checkpoint_calls[0][0][0].scope_cursor["current_site"] == "site-1"

    @pytest.mark.asyncio
    async def test_enumerate_handles_signal(self):
        ex = _make_executor()
        job = _make_job(status="enumerating", config={})
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._graph.get_all_pages = AsyncMock(side_effect=self._graph_side_effect())
        ex._handle_signal = AsyncMock()

        with patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=JobSignal.PAUSE):
            await ex._enumerate(job, "tenant-1")

        ex._handle_signal.assert_awaited_once()
        # Should return after first signal — no checkpoints written for sites
        add_calls = ex._db.add.call_args_list
        checkpoint_calls = [c for c in add_calls if hasattr(c[0][0], "checkpoint_type")]
        assert len(checkpoint_calls) == 0

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_enumerate_skips_failed_drives(self, mock_signal):
        ex = _make_executor()
        job = _make_job(status="enumerating", config={})
        ex._get_latest_checkpoint = AsyncMock(return_value=None)

        call_count = 0

        async def _get_all_pages(tenant_id, url):
            nonlocal call_count
            if "/sites" in url and "drives" not in url:
                return [{"id": "site-1"}]
            if "/drives" in url and "search" not in url:
                return [{"id": "drive-ok"}, {"id": "drive-bad"}]
            if "search" in url:
                drive_id = url.split("/drives/")[1].split("/root")[0]
                if drive_id == "drive-bad":
                    raise StableLabelError("drive access denied")
                return [{"id": "file-1", "name": "doc.docx", "file": {}}]
            return []

        ex._graph.get_all_pages = AsyncMock(side_effect=_get_all_pages)

        await ex._enumerate(job, "tenant-1")

        # Should still create checkpoint with the file from drive-ok
        assert job.total_files == 1

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_enumerate_skips_failed_sites(self, mock_signal):
        ex = _make_executor()
        job = _make_job(status="enumerating", config={})
        ex._get_latest_checkpoint = AsyncMock(return_value=None)

        async def _get_all_pages(tenant_id, url):
            if "/sites" in url and "drives" not in url:
                return [{"id": "site-bad"}, {"id": "site-ok"}]
            if "/sites/site-bad/drives" in url:
                raise httpx.HTTPError("forbidden")
            if "/sites/site-ok/drives" in url:
                return [{"id": "drive-ok"}]
            if "search" in url:
                return [{"id": "file-1", "name": "doc.docx", "file": {}}]
            return []

        ex._graph.get_all_pages = AsyncMock(side_effect=_get_all_pages)

        await ex._enumerate(job, "tenant-1")

        # site-bad was skipped, site-ok produced 1 file
        assert job.total_files == 1


class TestLabel:
    """Tests for the _label method."""

    def _make_files(self, count=3):
        return [
            {"drive_id": f"d{i}", "item_id": f"item-{i}", "name": f"file-{i}.docx"}
            for i in range(count)
        ]

    def _completed_result(self):
        r = MagicMock()
        r.status = JobStatus.COMPLETED
        r.error = ""
        return r

    def _failed_result(self, error="some error"):
        r = MagicMock()
        r.status = JobStatus.FAILED
        r.error = error
        return r

    def _silent_failure_result(self):
        r = MagicMock()
        r.status = JobStatus.SILENT_FAILURE
        r.error = "no response"
        return r

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_static_mode(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"target_label_id": "label-1"})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(3))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._docs.apply_label = AsyncMock(return_value=self._completed_result())

        await ex._label(job, "tenant-1")

        assert ex._docs.apply_label.await_count == 3
        assert job.processed_files == 3
        assert job.failed_files == 0

    @pytest.mark.asyncio
    async def test_label_static_no_label_id_fails(self):
        ex = _make_executor()
        job = _make_job(config={"use_policies": False})
        ex._fail_job = AsyncMock()

        await ex._label(job, "tenant-1")

        ex._fail_job.assert_awaited_once()
        assert "target_label_id" in ex._fail_job.call_args[0][1]

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_policy_mode(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"use_policies": True})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(2))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._load_tenant_policies = AsyncMock(return_value=[MagicMock()])
        ex._resolve_label_via_policy = AsyncMock(return_value=("policy-label-1", None))
        ex._docs.apply_label = AsyncMock(return_value=self._completed_result())

        await ex._label(job, "tenant-1")

        assert ex._docs.apply_label.await_count == 2
        # Verify the label from policy was used in the assignment
        first_call = ex._docs.apply_label.call_args_list[0]
        assignment = first_call[0][1]
        assert assignment.sensitivity_label_id == "policy-label-1"

    @pytest.mark.asyncio
    async def test_label_policy_no_policies_fails(self):
        ex = _make_executor()
        job = _make_job(config={"use_policies": True})
        ex._load_tenant_policies = AsyncMock(return_value=[])
        ex._fail_job = AsyncMock()

        await ex._label(job, "tenant-1")

        ex._fail_job.assert_awaited_once()
        assert "policies" in ex._fail_job.call_args[0][1].lower()

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_dry_run_no_apply(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"target_label_id": "label-1", "dry_run": True})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(2))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)

        await ex._label(job, "tenant-1")

        ex._docs.apply_label.assert_not_awaited()
        # ScanResults should still be created
        add_calls = ex._db.add.call_args_list
        scan_results = [c for c in add_calls if hasattr(c[0][0], "outcome") and c[0][0].outcome == "labelled"]
        assert len(scan_results) == 2

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_handles_failed_apply(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"target_label_id": "label-1"})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(1))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._docs.apply_label = AsyncMock(return_value=self._failed_result("generic error"))

        await ex._label(job, "tenant-1")

        assert job.failed_files == 1
        add_calls = ex._db.add.call_args_list
        scan_results = [c for c in add_calls if hasattr(c[0][0], "outcome") and c[0][0].outcome == "failed"]
        assert len(scan_results) == 1

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_handles_unsupported_file_skip(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"target_label_id": "label-1"})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(1))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._docs.apply_label = AsyncMock(return_value=self._failed_result("Unsupported file type"))

        await ex._label(job, "tenant-1")

        assert job.skipped_files == 1
        assert job.failed_files == 0

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_handles_silent_failure(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"target_label_id": "label-1"})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(1))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._docs.apply_label = AsyncMock(return_value=self._silent_failure_result())

        await ex._label(job, "tenant-1")

        assert job.failed_files == 1
        add_calls = ex._db.add.call_args_list
        scan_results = [c for c in add_calls if hasattr(c[0][0], "outcome") and c[0][0].outcome == "failed"]
        assert len(scan_results) == 1

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_creates_audit_events_with_msp(self, mock_signal):
        ex = _make_executor()
        msp_id = uuid.uuid4()
        job = _make_job(config={"target_label_id": "label-1"})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(2))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._docs.apply_label = AsyncMock(return_value=self._completed_result())

        await ex._label(job, "tenant-1", msp_tenant_id=msp_id)

        add_calls = ex._db.add.call_args_list
        audit_events = [c for c in add_calls if hasattr(c[0][0], "event_type") and c[0][0].event_type == "file.labelled"]
        assert len(audit_events) == 2

    @pytest.mark.asyncio
    async def test_label_handles_signal_between_batches(self):
        ex = _make_executor()
        job = _make_job(config={"target_label_id": "label-1"})
        # More files than batch size
        files = self._make_files(_LABELLING_BATCH_SIZE + 10)
        ex._collect_enumerated_files = AsyncMock(return_value=files)
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._docs.apply_label = AsyncMock(return_value=self._completed_result())
        ex._handle_signal = AsyncMock()

        signal_calls = 0

        async def _signal_side_effect(*args, **kwargs):
            nonlocal signal_calls
            signal_calls += 1
            if signal_calls == 1:
                return None  # First batch proceeds
            return JobSignal.PAUSE  # Signal before second batch

        with patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, side_effect=_signal_side_effect):
            await ex._label(job, "tenant-1")

        ex._handle_signal.assert_awaited_once()
        # Only first batch should have been processed
        assert ex._docs.apply_label.await_count == _LABELLING_BATCH_SIZE

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_resumes_from_checkpoint(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"target_label_id": "label-1"})
        files = self._make_files(5)
        ex._collect_enumerated_files = AsyncMock(return_value=files)

        last_cp = MagicMock()
        last_cp.scope_cursor = {
            "files_processed_index": 2,
            "files_labelled": 2,
            "files_skipped": 0,
            "files_failed": 0,
        }
        last_cp.batch_number = 0
        ex._get_latest_checkpoint = AsyncMock(return_value=last_cp)
        ex._docs.apply_label = AsyncMock(return_value=self._completed_result())

        await ex._label(job, "tenant-1")

        # Only 3 remaining files should be processed
        assert ex._docs.apply_label.await_count == 3

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_policy_deferred_enqueued(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"use_policies": True})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(1))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._load_tenant_policies = AsyncMock(return_value=[MagicMock()])

        deferred_cr = ClassificationResult(filename="big.docx", text_content="x" * 600000, error="deferred")
        ex._resolve_label_via_policy = AsyncMock(return_value=(None, deferred_cr))
        ex._enqueue_deferred_classification = AsyncMock(return_value=True)

        await ex._label(job, "tenant-1")

        ex._enqueue_deferred_classification.assert_awaited_once()
        ex._docs.apply_label.assert_not_awaited()
        # Deferred file should NOT be counted in processed totals
        assert job.processed_files == 0

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_policy_skip_no_match(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"use_policies": True})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(1))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._load_tenant_policies = AsyncMock(return_value=[MagicMock()])

        cr = ClassificationResult(filename="test.docx")
        ex._resolve_label_via_policy = AsyncMock(return_value=(None, cr))

        await ex._label(job, "tenant-1")

        ex._docs.apply_label.assert_not_awaited()
        assert job.skipped_files == 1
        add_calls = ex._db.add.call_args_list
        scan_results = [c for c in add_calls if hasattr(c[0][0], "outcome") and c[0][0].outcome == "skipped"]
        assert len(scan_results) == 1

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_label_writes_metrics_and_checkpoint(self, mock_signal):
        ex = _make_executor()
        job = _make_job(config={"target_label_id": "label-1"})
        ex._collect_enumerated_files = AsyncMock(return_value=self._make_files(3))
        ex._get_latest_checkpoint = AsyncMock(return_value=None)
        ex._docs.apply_label = AsyncMock(return_value=self._completed_result())

        await ex._label(job, "tenant-1")

        add_calls = ex._db.add.call_args_list
        metrics = [c for c in add_calls if hasattr(c[0][0], "files_per_second")]
        checkpoints = [c for c in add_calls if hasattr(c[0][0], "checkpoint_type") and c[0][0].checkpoint_type == "labelling"]
        assert len(metrics) >= 1
        assert len(checkpoints) >= 1


class TestRollback:
    """Tests for the _rollback method."""

    def _make_labelling_checkpoints(self, applied_labels):
        """Create mock labelling checkpoints with given applied_labels."""
        cp = MagicMock()
        cp.scope_cursor = {"applied_labels": applied_labels}
        return [cp]

    def _setup_rollback_executor(self, applied_labels, rollback_cp=None):
        ex = _make_executor()
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = self._make_labelling_checkpoints(applied_labels)
        ex._db.execute = AsyncMock(return_value=mock_result)
        ex._get_latest_checkpoint = AsyncMock(return_value=rollback_cp)
        return ex

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_rollback_restores_previous_labels(self, mock_signal):
        labels = [
            {"drive_id": "d1", "item_id": "i1", "label_id": "new-label", "previous_label_id": "old-label"},
        ]
        ex = self._setup_rollback_executor(labels)
        ex._docs.apply_label = AsyncMock()

        job = _make_job(status="rolling_back")
        await ex._rollback(job, "tenant-1")

        ex._docs.apply_label.assert_awaited_once()
        assignment = ex._docs.apply_label.call_args[0][1]
        assert assignment.sensitivity_label_id == "old-label"

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_rollback_deletes_label_when_no_previous(self, mock_signal):
        labels = [
            {"drive_id": "d1", "item_id": "i1", "label_id": "new-label", "previous_label_id": ""},
        ]
        ex = self._setup_rollback_executor(labels)
        ex._graph.post = AsyncMock()

        job = _make_job(status="rolling_back")
        await ex._rollback(job, "tenant-1")

        ex._graph.post.assert_awaited_once()
        call_url = ex._graph.post.call_args[0][1]
        assert "deleteSensitivityLabel" in call_url
        assert "d1" in call_url
        assert "i1" in call_url

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_rollback_nothing_to_rollback(self, mock_signal):
        ex = self._setup_rollback_executor([])

        job = _make_job(status="rolling_back")
        await ex._rollback(job, "tenant-1")

        ex._docs.apply_label.assert_not_awaited()
        ex._graph.post.assert_not_awaited()

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_rollback_handles_failed_items(self, mock_signal):
        labels = [
            {"drive_id": "d1", "item_id": "i1", "label_id": "lbl", "previous_label_id": "old"},
            {"drive_id": "d2", "item_id": "i2", "label_id": "lbl", "previous_label_id": "old2"},
        ]
        ex = self._setup_rollback_executor(labels)
        # First call fails, second succeeds
        ex._docs.apply_label = AsyncMock(side_effect=[StableLabelError("nope"), MagicMock()])

        job = _make_job(status="rolling_back")
        await ex._rollback(job, "tenant-1")

        # Checkpoint should still be written
        add_calls = ex._db.add.call_args_list
        checkpoints = [c for c in add_calls if hasattr(c[0][0], "checkpoint_type") and c[0][0].checkpoint_type == "rollback"]
        assert len(checkpoints) == 1
        cp = checkpoints[0][0][0]
        assert cp.items_failed == 1

    @pytest.mark.asyncio
    async def test_rollback_handles_signal(self):
        # Create enough items to span multiple batches
        labels = [
            {"drive_id": f"d{i}", "item_id": f"i{i}", "label_id": "lbl", "previous_label_id": ""}
            for i in range(_LABELLING_BATCH_SIZE + 10)
        ]
        ex = self._setup_rollback_executor(labels)
        ex._graph.post = AsyncMock()
        ex._handle_signal = AsyncMock()

        call_count = 0

        async def _signal_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return None  # First batch proceeds
            return JobSignal.PAUSE

        with patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, side_effect=_signal_side_effect):
            job = _make_job(status="rolling_back")
            await ex._rollback(job, "tenant-1")

        ex._handle_signal.assert_awaited_once()
        # Only first batch processed
        assert ex._graph.post.await_count == _LABELLING_BATCH_SIZE

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_rollback_creates_audit_events(self, mock_signal):
        labels = [
            {"drive_id": "d1", "item_id": "i1", "label_id": "lbl", "previous_label_id": "old"},
            {"drive_id": "d2", "item_id": "i2", "label_id": "lbl", "previous_label_id": ""},
        ]
        msp_id = uuid.uuid4()
        ex = self._setup_rollback_executor(labels)
        ex._docs.apply_label = AsyncMock()
        ex._graph.post = AsyncMock()

        job = _make_job(status="rolling_back")
        await ex._rollback(job, "tenant-1", msp_tenant_id=msp_id)

        add_calls = ex._db.add.call_args_list
        audit_events = [c for c in add_calls if hasattr(c[0][0], "event_type") and c[0][0].event_type == "file.rolled_back"]
        assert len(audit_events) == 2

    @pytest.mark.asyncio
    @patch("app.worker.executor.check_job_signal", new_callable=AsyncMock, return_value=None)
    async def test_rollback_resumes_from_checkpoint(self, mock_signal):
        labels = [
            {"drive_id": "d1", "item_id": "i1", "label_id": "lbl", "previous_label_id": ""},
            {"drive_id": "d2", "item_id": "i2", "label_id": "lbl", "previous_label_id": ""},
            {"drive_id": "d3", "item_id": "i3", "label_id": "lbl", "previous_label_id": ""},
        ]
        rollback_cp = MagicMock()
        rollback_cp.scope_cursor = {"rolled_back_count": 2}
        rollback_cp.batch_number = 0
        ex = self._setup_rollback_executor(labels, rollback_cp=rollback_cp)
        ex._graph.post = AsyncMock()

        job = _make_job(status="rolling_back")
        await ex._rollback(job, "tenant-1")

        # Only 1 remaining item should be processed
        assert ex._graph.post.await_count == 1
