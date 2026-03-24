"""Deferred classification task — processes large documents asynchronously.

When the main labelling loop encounters a file with >500 KB of extracted text,
it enqueues this task instead of blocking the scan. The task:
  1. Classifies the text using chunked/parallel presidio processing
  2. Evaluates tenant policies against the classification
  3. Applies the matched label (if any) via Graph API
  4. Updates the ScanResult row from "deferred" to its final outcome

This keeps the main scan loop fast — small files are classified inline while
large documents are processed in the background by the same arq worker pool.
"""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import (
    AuditEvent,
    ClassificationEvent,
    Job,
    Policy,
    ScanResult,
)
from app.dependencies import get_document_service, get_graph_client
from app.models.document import LabelAssignment, JobStatus
from app.services.classifier import classify_content_chunked
from app.services.policy_engine import (
    ClassificationResult,
    evaluate_policies,
    policies_from_db,
)

logger = logging.getLogger(__name__)


async def classify_and_label_file(
    ctx: dict,
    *,
    tenant_id: str,
    customer_tenant_id: str,
    msp_tenant_id: str | None,
    job_id: str,
    drive_id: str,
    item_id: str,
    filename: str,
    text: str,
    scan_result_id: str,
    use_policies: bool = True,
    static_label_id: str = "",
    assignment_method: str = "standard",
    justification_text: str = "",
    confirm_encryption: bool = False,
    dry_run: bool = False,
) -> None:
    """arq task: classify a large document and apply the resulting label.

    This task is enqueued by the executor when extracted text exceeds
    LARGE_TEXT_THRESHOLD. It runs chunked classification, evaluates
    policies, applies the label, and updates the deferred ScanResult.
    """
    logger.info(
        "Deferred classification starting for %s (%d chars), job %s",
        filename, len(text), job_id,
    )

    async for db in get_session():
        try:
            # 1. Run chunked classification
            classification = await classify_content_chunked(
                text, filename=filename,
            )

            if classification.error:
                logger.warning(
                    "Deferred classification failed for %s: %s",
                    filename, classification.error,
                )
                await _update_scan_result(
                    db, scan_result_id,
                    outcome="failed",
                    classification=None,
                    confidence=None,
                )
                return

            # 2. Persist classification events
            job_uuid = uuid.UUID(job_id)
            ct_uuid = uuid.UUID(customer_tenant_id)
            if classification.entities:
                entity_groups: dict[str, list] = {}
                for entity in classification.entities:
                    entity_groups.setdefault(entity.entity_type, []).append(entity)

                for entity_type, entities in entity_groups.items():
                    db.add(ClassificationEvent(
                        customer_tenant_id=ct_uuid,
                        job_id=job_uuid,
                        entity_type=entity_type,
                        entity_count=len(entities),
                        max_confidence=max(e.confidence for e in entities),
                        file_name=filename,
                    ))
                await db.commit()

            # 3. Determine label
            label_id: str | None = None
            if use_policies:
                policy_rules = await _load_tenant_policies(db, ct_uuid)
                if policy_rules:
                    match = evaluate_policies(policy_rules, classification, filename)
                    if match:
                        label_id = match.target_label_id
                        logger.debug(
                            "Deferred: %s matched policy '%s' → label %s",
                            filename, match.policy_name, label_id,
                        )
            else:
                label_id = static_label_id or None

            # Extract top entity for scan result
            top_entity, top_conf = _top_classification(classification)

            # 4. No label matched → mark as skipped
            if not label_id:
                await _update_scan_result(
                    db, scan_result_id,
                    outcome="skipped",
                    classification=top_entity,
                    confidence=top_conf,
                )
                await _increment_job_counter(db, job_uuid, "skipped")
                logger.info("Deferred: %s — no policy matched, skipped", filename)
                return

            # 5. Dry-run → record but don't apply
            if dry_run:
                await _update_scan_result(
                    db, scan_result_id,
                    outcome="labelled",
                    classification=top_entity,
                    confidence=top_conf,
                    label_applied=label_id,
                )
                await _increment_job_counter(db, job_uuid, "labelled")
                logger.info("Deferred (dry-run): %s → label %s", filename, label_id)
                return

            # 6. Apply label via Graph API
            doc_service = get_document_service()
            assignment = LabelAssignment(
                drive_id=drive_id,
                item_id=item_id,
                sensitivity_label_id=label_id,
                assignment_method=assignment_method,
                justification_text=justification_text,
            )

            result = await doc_service.apply_label(
                tenant_id,
                assignment,
                filename=filename,
                confirm_encryption=confirm_encryption,
            )

            msp_uuid = uuid.UUID(msp_tenant_id) if msp_tenant_id else None

            if result.status == JobStatus.COMPLETED:
                await _update_scan_result(
                    db, scan_result_id,
                    outcome="labelled",
                    classification=top_entity,
                    confidence=top_conf,
                    label_applied=label_id,
                )
                await _increment_job_counter(db, job_uuid, "labelled")
                if msp_uuid:
                    db.add(AuditEvent(
                        msp_tenant_id=msp_uuid,
                        customer_tenant_id=ct_uuid,
                        job_id=job_uuid,
                        event_type="file.labelled",
                        target_file=filename,
                        label_applied=label_id,
                        extra={"drive_id": drive_id, "item_id": item_id, "deferred": True},
                    ))
                    await db.commit()
                logger.info("Deferred: %s → labelled with %s", filename, label_id)

            elif result.status == JobStatus.FAILED:
                outcome = "skipped" if result.error and "Unsupported" in result.error else "failed"
                counter = "skipped" if outcome == "skipped" else "failed"
                await _update_scan_result(
                    db, scan_result_id,
                    outcome=outcome,
                    classification=top_entity,
                    confidence=top_conf,
                    label_applied=label_id,
                )
                await _increment_job_counter(db, job_uuid, counter)
                if msp_uuid and outcome == "failed":
                    db.add(AuditEvent(
                        msp_tenant_id=msp_uuid,
                        customer_tenant_id=ct_uuid,
                        job_id=job_uuid,
                        event_type="file.label_failed",
                        target_file=filename,
                        label_applied=label_id,
                        extra={"drive_id": drive_id, "item_id": item_id,
                               "error": result.error, "deferred": True},
                    ))
                    await db.commit()

            else:
                # SILENT_FAILURE
                await _update_scan_result(
                    db, scan_result_id,
                    outcome="failed",
                    classification=top_entity,
                    confidence=top_conf,
                    label_applied=label_id,
                )
                await _increment_job_counter(db, job_uuid, "failed")

        except Exception as exc:
            logger.exception(
                "Deferred classification failed for %s/%s: %s",
                drive_id, item_id, exc,
            )
            await _update_scan_result(
                db, scan_result_id,
                outcome="failed",
                classification=None,
                confidence=None,
            )
            await _increment_job_counter(db, uuid.UUID(job_id), "failed")


# ── Helpers ────────────────────────────────────────────────────


def _top_classification(
    classification: ClassificationResult,
) -> tuple[str | None, float | None]:
    if not classification.entities:
        return None, None
    best = max(classification.entities, key=lambda e: e.confidence)
    return best.entity_type, best.confidence


async def _load_tenant_policies(db: AsyncSession, customer_tenant_id: uuid.UUID):
    stmt = (
        select(Policy)
        .where(
            Policy.customer_tenant_id == customer_tenant_id,
            Policy.is_enabled.is_(True),
        )
        .order_by(Policy.priority.desc())
    )
    result = await db.execute(stmt)
    return policies_from_db(result.scalars().all())


async def _update_scan_result(
    db: AsyncSession,
    scan_result_id: str,
    *,
    outcome: str,
    classification: str | None,
    confidence: float | None,
    label_applied: str | None = None,
) -> None:
    """Update a deferred ScanResult with its final outcome."""
    values: dict = {"outcome": outcome}
    if classification is not None:
        values["classification"] = classification
    if confidence is not None:
        values["confidence"] = confidence
    if label_applied is not None:
        values["label_applied"] = label_applied

    stmt = (
        update(ScanResult)
        .where(ScanResult.id == uuid.UUID(scan_result_id))
        .values(**values)
    )
    await db.execute(stmt)
    await db.commit()


async def _increment_job_counter(
    db: AsyncSession,
    job_id: uuid.UUID,
    counter_type: str,
) -> None:
    """Atomically increment a job counter when a deferred file completes.

    counter_type: "labelled" | "skipped" | "failed"
    """
    job = await db.get(Job, job_id)
    if not job:
        return

    if counter_type == "labelled":
        job.processed_files = (job.processed_files or 0) + 1
    elif counter_type == "skipped":
        job.processed_files = (job.processed_files or 0) + 1
        job.skipped_files = (job.skipped_files or 0) + 1
    elif counter_type == "failed":
        job.processed_files = (job.processed_files or 0) + 1
        job.failed_files = (job.failed_files or 0) + 1

    await db.commit()
