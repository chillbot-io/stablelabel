"""Job executor — the core loop that actually enumerates and labels files.

Lifecycle:
  1. ENUMERATING: walk SharePoint sites → libraries → files, build file list
  2. RUNNING: apply labels to files in batches, write checkpoints
  3. ROLLING_BACK: reverse applied labels using checkpoint data

The executor is called by arq tasks. It owns checkpoint creation, signal
checking (pause/cancel), and status transitions during execution.

Design principles:
  - Checkpoint after each site (enumeration) or every N files (labelling)
  - Check for pause/cancel signal between batches
  - On crash, the arq task is retried and resumes from last checkpoint
  - Never hold large lists in memory — stream and checkpoint incrementally
"""

from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.redis import JobSignal, ack_job_signal, check_job_signal
from app.db.models import AuditEvent, Job, JobCheckpoint, Policy
from app.models.document import LabelAssignment, JobStatus
from app.services.classifier import classify_content
from app.services.document_service import DocumentService
from app.services.graph_client import GraphClient
from app.services.policy_engine import (
    ClassificationResult,
    PolicyRule,
    evaluate_policies,
    policies_from_db,
)

logger = logging.getLogger(__name__)

# Checkpoint every N files during labelling
_LABELLING_BATCH_SIZE = 100


class JobExecutor:
    """Executes a labelling job end-to-end with checkpointing and signal handling."""

    def __init__(
        self,
        db: AsyncSession,
        graph: GraphClient,
        doc_service: DocumentService,
        redis: Redis,
    ) -> None:
        self._db = db
        self._graph = graph
        self._docs = doc_service
        self._redis = redis

    async def run(self, job_id: str) -> None:
        """Main entry point — dispatched by arq for start/resume."""
        job = await self._load_job(job_id)
        if not job:
            logger.error("Job %s not found", job_id)
            return

        tenant_info = await self._get_tenant_info(job)
        if not tenant_info:
            await self._fail_job(job, "Tenant not found or inactive")
            return
        tenant_id, msp_tenant_id = tenant_info

        try:
            if job.status == "enumerating":
                await self._enumerate(job, tenant_id)
                # After enumeration, if not paused/cancelled, transition to running
                await self._db.refresh(job)
                if job.status == "enumerating":
                    job.status = "running"
                    await self._db.commit()

            if job.status == "running":
                await self._label(job, tenant_id, msp_tenant_id)

            # Check final status
            await self._db.refresh(job)
            if job.status == "running":
                job.status = "completed"
                job.completed_at = datetime.now(UTC)
                self._db.add(AuditEvent(
                    msp_tenant_id=msp_tenant_id,
                    customer_tenant_id=job.customer_tenant_id,
                    job_id=job.id,
                    event_type="job.completed",
                    extra={
                        "total_files": job.total_files,
                        "processed_files": job.processed_files,
                        "failed_files": job.failed_files,
                        "skipped_files": job.skipped_files,
                    },
                ))
                await self._db.commit()
                logger.info("Job %s completed", job_id)

        except Exception as exc:
            logger.exception("Job %s failed with unrecoverable error", job_id)
            await self._db.refresh(job)
            await self._fail_job(job, str(exc))

    async def run_rollback(self, job_id: str) -> None:
        """Entry point for rollback — dispatched by arq."""
        job = await self._load_job(job_id)
        if not job:
            logger.error("Job %s not found for rollback", job_id)
            return

        tenant_info = await self._get_tenant_info(job)
        if not tenant_info:
            await self._fail_job(job, "Tenant not found for rollback")
            return
        tenant_id, msp_tenant_id = tenant_info

        try:
            await self._rollback(job, tenant_id, msp_tenant_id)
            await self._db.refresh(job)
            if job.status == "rolling_back":
                job.status = "rolled_back"
                job.completed_at = datetime.now(UTC)
                await self._db.commit()
                logger.info("Job %s rolled back", job_id)
        except Exception as exc:
            logger.exception("Rollback failed for job %s", job_id)
            await self._db.refresh(job)
            await self._fail_job(job, f"Rollback failed: {exc}")

    # ── Enumeration phase ──────────────────────────────────────

    async def _enumerate(self, job: Job, tenant_id: str) -> None:
        """Walk SharePoint sites → drives → files, store file manifest in checkpoints."""
        last_cp = await self._get_latest_checkpoint(job.id, "enumeration")
        cursor: dict[str, Any] = last_cp.scope_cursor if last_cp else {}
        sites_completed: list[str] = cursor.get("sites_completed", [])
        batch_number = (last_cp.batch_number + 1) if last_cp else 0
        total_files_found = cursor.get("total_files_found", 0)

        # Get all SharePoint sites for this tenant
        sites = await self._graph.get_all_pages(
            tenant_id, "/sites?search=*"
        )

        for site in sites:
            site_id = site.get("id", "")
            if not site_id or site_id in sites_completed:
                continue

            # Check for pause/cancel signal between sites
            signal = await check_job_signal(self._redis, str(job.id))
            if signal:
                await self._handle_signal(job, signal, "enumeration", {
                    "phase": "enumeration",
                    "sites_completed": sites_completed,
                    "total_files_found": total_files_found,
                }, batch_number)
                return

            # Get all drives (document libraries) for this site
            try:
                drives = await self._graph.get_all_pages(
                    tenant_id, f"/sites/{site_id}/drives"
                )
            except Exception:
                logger.warning("Failed to enumerate drives for site %s, skipping", site_id)
                continue

            site_files: list[dict[str, str]] = []

            for drive in drives:
                drive_id = drive.get("id", "")
                if not drive_id:
                    continue

                # Get all items in the drive recursively
                try:
                    items = await self._graph.get_all_pages(
                        tenant_id,
                        f"/drives/{drive_id}/root/search(q='')",
                    )
                except Exception:
                    logger.warning(
                        "Failed to enumerate drive %s in site %s, skipping",
                        drive_id, site_id,
                    )
                    continue

                for item in items:
                    # Only include files (not folders)
                    if "file" not in item:
                        continue
                    item_id = item.get("id", "")
                    name = item.get("name", "")
                    if item_id and name:
                        site_files.append({
                            "drive_id": drive_id,
                            "item_id": item_id,
                            "name": name,
                            "site_id": site_id,
                        })

            total_files_found += len(site_files)
            sites_completed.append(site_id)

            # Checkpoint after each site
            cp = JobCheckpoint(
                job_id=job.id,
                checkpoint_type="enumeration",
                scope_cursor={
                    "phase": "enumeration",
                    "sites_completed": sites_completed,
                    "current_site": site_id,
                    "files_in_site": site_files,
                    "total_files_found": total_files_found,
                },
                batch_number=batch_number,
                items_processed=len(site_files),
                items_failed=0,
                status="completed",
            )
            self._db.add(cp)
            job.total_files = total_files_found
            await self._db.commit()
            batch_number += 1

            logger.info(
                "Job %s enumerated site %s: %d files (%d total)",
                job.id, site_id, len(site_files), total_files_found,
            )

    # ── Labelling phase ────────────────────────────────────────

    async def _label(self, job: Job, tenant_id: str, msp_tenant_id: uuid.UUID | None = None) -> None:
        """Apply labels to enumerated files.

        Two modes:
          1. Static: job.config["target_label_id"] — apply one label to all files
          2. Policy-driven: job.config["use_policies"] = true — classify each file,
             evaluate policies, and pick the appropriate label per file
        """
        use_policies = job.config.get("use_policies", False)
        assignment_method = job.config.get("assignment_method", "standard")
        justification = job.config.get("justification_text", "")
        confirm_encryption = job.config.get("confirm_encryption", False)

        # Static mode requires a target label
        static_label_id = job.config.get("target_label_id", "")
        if not use_policies and not static_label_id:
            await self._fail_job(job, "No target_label_id in job config (and use_policies is false)")
            return

        # Load policies if in policy-driven mode
        policy_rules: list[PolicyRule] = []
        if use_policies:
            policy_rules = await self._load_tenant_policies(job.customer_tenant_id)
            if not policy_rules:
                await self._fail_job(job, "No enabled policies found for tenant")
                return
            logger.info("Job %s: loaded %d policies for evaluation", job.id, len(policy_rules))

        # Collect all files from enumeration checkpoints
        all_files = await self._collect_enumerated_files(job.id)
        if not all_files:
            logger.warning("Job %s has no enumerated files", job.id)
            return

        # Find where we left off (from labelling checkpoints)
        last_cp = await self._get_latest_checkpoint(job.id, "labelling")
        start_index = 0
        batch_number = 0
        if last_cp:
            cursor = last_cp.scope_cursor
            start_index = cursor.get("files_processed_index", 0)
            batch_number = last_cp.batch_number + 1

        files_labelled = last_cp.scope_cursor.get("files_labelled", 0) if last_cp else 0
        files_skipped = last_cp.scope_cursor.get("files_skipped", 0) if last_cp else 0
        files_failed = last_cp.scope_cursor.get("files_failed", 0) if last_cp else 0
        applied_labels: list[dict[str, str]] = []

        remaining = all_files[start_index:]

        for i in range(0, len(remaining), _LABELLING_BATCH_SIZE):
            batch = remaining[i : i + _LABELLING_BATCH_SIZE]

            # Check for pause/cancel signal between batches
            signal = await check_job_signal(self._redis, str(job.id))
            if signal:
                await self._handle_signal(job, signal, "labelling", {
                    "phase": "labelling",
                    "files_processed_index": start_index + i,
                    "files_labelled": files_labelled,
                    "files_skipped": files_skipped,
                    "files_failed": files_failed,
                    "applied_labels": applied_labels,
                }, batch_number)
                return

            batch_applied: list[dict[str, str]] = []
            batch_failed = 0

            for file_info in batch:
                drive_id = file_info["drive_id"]
                item_id = file_info["item_id"]
                filename = file_info["name"]

                # Determine which label to apply
                if use_policies:
                    label_id = await self._resolve_label_via_policy(
                        tenant_id, drive_id, item_id, filename, policy_rules,
                    )
                    if not label_id:
                        files_skipped += 1
                        continue  # no policy matched — skip file
                else:
                    label_id = static_label_id

                assignment = LabelAssignment(
                    drive_id=drive_id,
                    item_id=item_id,
                    sensitivity_label_id=label_id,
                    assignment_method=assignment_method,
                    justification_text=justification,
                )

                result = await self._docs.apply_label(
                    tenant_id,
                    assignment,
                    filename=filename,
                    confirm_encryption=confirm_encryption,
                )

                if result.status == JobStatus.COMPLETED:
                    files_labelled += 1
                    batch_applied.append({
                        "item_id": item_id,
                        "drive_id": drive_id,
                        "label_id": label_id,
                        "previous_label_id": "",
                    })
                    # Audit: successful label application
                    if msp_tenant_id:
                        self._db.add(AuditEvent(
                            msp_tenant_id=msp_tenant_id,
                            customer_tenant_id=job.customer_tenant_id,
                            job_id=job.id,
                            event_type="file.labelled",
                            target_file=filename,
                            label_applied=label_id,
                            extra={"drive_id": drive_id, "item_id": item_id},
                        ))
                elif result.status == JobStatus.FAILED:
                    if result.error and "Unsupported" in result.error:
                        files_skipped += 1
                    else:
                        files_failed += 1
                        batch_failed += 1
                        logger.warning(
                            "Job %s: failed to label %s/%s: %s",
                            job.id, drive_id, item_id, result.error,
                        )
                        # Audit: failed label application
                        if msp_tenant_id:
                            self._db.add(AuditEvent(
                                msp_tenant_id=msp_tenant_id,
                                customer_tenant_id=job.customer_tenant_id,
                                job_id=job.id,
                                event_type="file.label_failed",
                                target_file=filename,
                                label_applied=label_id,
                                extra={
                                    "drive_id": drive_id,
                                    "item_id": item_id,
                                    "error": result.error,
                                },
                            ))
                elif result.status == JobStatus.SILENT_FAILURE:
                    files_failed += 1
                    batch_failed += 1
                    if msp_tenant_id:
                        self._db.add(AuditEvent(
                            msp_tenant_id=msp_tenant_id,
                            customer_tenant_id=job.customer_tenant_id,
                            job_id=job.id,
                            event_type="file.silent_failure",
                            target_file=filename,
                            label_applied=label_id,
                            extra={
                                "drive_id": drive_id,
                                "item_id": item_id,
                                "error": result.error,
                            },
                        ))

            applied_labels.extend(batch_applied)
            current_index = start_index + i + len(batch)

            # Write checkpoint
            cp = JobCheckpoint(
                job_id=job.id,
                checkpoint_type="labelling",
                scope_cursor={
                    "phase": "labelling",
                    "files_processed_index": current_index,
                    "files_labelled": files_labelled,
                    "files_skipped": files_skipped,
                    "files_failed": files_failed,
                    "applied_labels": batch_applied,
                },
                batch_number=batch_number,
                items_processed=len(batch),
                items_failed=batch_failed,
                status="completed",
            )
            self._db.add(cp)

            # Update job counters
            job.processed_files = files_labelled + files_skipped + files_failed
            job.failed_files = files_failed
            job.skipped_files = files_skipped

            await self._db.commit()
            batch_number += 1

            logger.info(
                "Job %s batch %d: labelled=%d, skipped=%d, failed=%d (total processed: %d/%d)",
                job.id, batch_number - 1,
                len(batch_applied), 0, 0,
                job.processed_files, job.total_files,
            )

    # ── Rollback phase ─────────────────────────────────────────

    async def _rollback(self, job: Job, tenant_id: str, msp_tenant_id: uuid.UUID | None = None) -> None:
        """Reverse applied labels using data from labelling checkpoints.

        For each applied label record, either restore the previous label
        or remove the current label if there was none before.
        """
        # Collect all applied_labels from labelling checkpoints
        stmt = (
            select(JobCheckpoint)
            .where(
                JobCheckpoint.job_id == job.id,
                JobCheckpoint.checkpoint_type == "labelling",
            )
            .order_by(JobCheckpoint.batch_number)
        )
        result = await self._db.execute(stmt)
        checkpoints = result.scalars().all()

        all_applied: list[dict[str, str]] = []
        for cp in checkpoints:
            all_applied.extend(cp.scope_cursor.get("applied_labels", []))

        if not all_applied:
            logger.info("Job %s: nothing to roll back", job.id)
            return

        batch_number = 0
        last_rollback_cp = await self._get_latest_checkpoint(job.id, "rollback")
        start_index = 0
        if last_rollback_cp:
            start_index = last_rollback_cp.scope_cursor.get("rolled_back_count", 0)
            batch_number = last_rollback_cp.batch_number + 1

        rolled_back = start_index
        rollback_failed = 0
        remaining = all_applied[start_index:]

        for i in range(0, len(remaining), _LABELLING_BATCH_SIZE):
            batch = remaining[i : i + _LABELLING_BATCH_SIZE]

            # Check for signal
            signal = await check_job_signal(self._redis, str(job.id))
            if signal:
                await self._handle_signal(job, signal, "rollback", {
                    "phase": "rollback",
                    "rolled_back_count": rolled_back,
                    "rollback_failed": rollback_failed,
                    "total_to_rollback": len(all_applied),
                }, batch_number)
                return

            batch_rollback_failed = 0

            for entry in batch:
                drive_id = entry.get("drive_id", "")
                item_id = entry.get("item_id", "")
                previous_label_id = entry.get("previous_label_id", "")

                try:
                    if previous_label_id:
                        # Restore previous label
                        assignment = LabelAssignment(
                            drive_id=drive_id,
                            item_id=item_id,
                            sensitivity_label_id=previous_label_id,
                            assignment_method="privileged",
                        )
                        await self._docs.apply_label(
                            tenant_id, assignment, verify=False,
                        )
                    else:
                        # Remove label (apply empty / delete)
                        await self._graph.post(
                            tenant_id,
                            f"/drives/{drive_id}/items/{item_id}/deleteSensitivityLabel",
                        )
                    rolled_back += 1
                    # Audit: successful rollback
                    if msp_tenant_id:
                        self._db.add(AuditEvent(
                            msp_tenant_id=msp_tenant_id,
                            customer_tenant_id=job.customer_tenant_id,
                            job_id=job.id,
                            event_type="file.rolled_back",
                            extra={
                                "drive_id": drive_id,
                                "item_id": item_id,
                                "restored_label_id": previous_label_id or None,
                            },
                        ))
                except Exception:
                    rollback_failed += 1
                    batch_rollback_failed += 1
                    logger.warning(
                        "Job %s: rollback failed for %s/%s",
                        job.id, drive_id, item_id,
                    )

            # Checkpoint
            cp = JobCheckpoint(
                job_id=job.id,
                checkpoint_type="rollback",
                scope_cursor={
                    "phase": "rollback",
                    "rolled_back_count": rolled_back,
                    "rollback_failed": rollback_failed,
                    "total_to_rollback": len(all_applied),
                },
                batch_number=batch_number,
                items_processed=len(batch),
                items_failed=batch_rollback_failed,
                status="completed",
            )
            self._db.add(cp)
            await self._db.commit()
            batch_number += 1

    # ── Helpers ─────────────────────────────────────────────────

    # ── Policy-driven labelling helpers ──────────────────────

    async def _load_tenant_policies(self, customer_tenant_id: uuid.UUID) -> list[PolicyRule]:
        """Load enabled policies for a tenant, sorted by priority."""
        stmt = (
            select(Policy)
            .where(
                Policy.customer_tenant_id == customer_tenant_id,
                Policy.is_enabled.is_(True),
            )
            .order_by(Policy.priority.desc())
        )
        result = await self._db.execute(stmt)
        db_policies = result.scalars().all()
        return policies_from_db(db_policies)

    async def _resolve_label_via_policy(
        self,
        tenant_id: str,
        drive_id: str,
        item_id: str,
        filename: str,
        policy_rules: list[PolicyRule],
    ) -> str | None:
        """Classify a file's content and evaluate policies to pick a label.

        Returns the target_label_id or None if no policy matched.
        """
        # Download file content as text for classification
        classification = await self._classify_file(tenant_id, drive_id, item_id, filename)

        # Evaluate all policies against the classification result
        match = evaluate_policies(policy_rules, classification, filename)
        if match:
            logger.debug(
                "File %s/%s matched policy '%s' → label %s",
                drive_id, item_id, match.policy_name, match.target_label_id,
            )
            return match.target_label_id

        return None

    async def _classify_file(
        self,
        tenant_id: str,
        drive_id: str,
        item_id: str,
        filename: str,
    ) -> ClassificationResult:
        """Download file content and run it through the content classifier."""
        try:
            # Get file content via Graph — small files only (< 4MB via direct download)
            body = await self._graph.get(
                tenant_id,
                f"/drives/{drive_id}/items/{item_id}",
                select="id,name,size,@microsoft.graph.downloadUrl",
            )

            size = body.get("size", 0)
            if size > 4 * 1024 * 1024:
                # Too large for direct classification — skip content scan
                # Still evaluate file_pattern rules with empty classification
                return ClassificationResult(filename=filename)

            download_url = body.get("@microsoft.graph.downloadUrl", "")
            if not download_url:
                return ClassificationResult(filename=filename)

            # Download the raw content
            import httpx

            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(download_url)
                if resp.status_code != 200:
                    return ClassificationResult(
                        filename=filename,
                        error=f"Download failed: {resp.status_code}",
                    )

            # Extract text (simple approach — works for plaintext-ish files)
            try:
                text = resp.content.decode("utf-8", errors="replace")
            except Exception:
                text = ""

            if not text.strip():
                return ClassificationResult(filename=filename)

            # Run presidio classification
            return classify_content(text, filename=filename)

        except Exception as exc:
            logger.warning(
                "Classification failed for %s/%s: %s", drive_id, item_id, exc,
            )
            return ClassificationResult(filename=filename, error=str(exc))

    # ── DB helpers ──────────────────────────────────────────────

    async def _load_job(self, job_id: str) -> Job | None:
        stmt = select(Job).where(Job.id == uuid.UUID(job_id))
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_tenant_info(self, job: Job) -> tuple[str, uuid.UUID] | None:
        """Get (entra_tenant_id, msp_tenant_id) for the job's customer tenant.

        Returns None if tenant not found or consent not active.
        """
        from app.db.models import CustomerTenant

        stmt = select(CustomerTenant).where(
            CustomerTenant.id == job.customer_tenant_id,
            CustomerTenant.consent_status == "active",
        )
        result = await self._db.execute(stmt)
        ct = result.scalar_one_or_none()
        if ct is None:
            return None
        return ct.entra_tenant_id, ct.msp_tenant_id

    async def _get_latest_checkpoint(
        self, job_id: uuid.UUID, checkpoint_type: str
    ) -> JobCheckpoint | None:
        stmt = (
            select(JobCheckpoint)
            .where(
                JobCheckpoint.job_id == job_id,
                JobCheckpoint.checkpoint_type == checkpoint_type,
            )
            .order_by(JobCheckpoint.batch_number.desc())
            .limit(1)
        )
        result = await self._db.execute(stmt)
        return result.scalar_one_or_none()

    async def _collect_enumerated_files(self, job_id: uuid.UUID) -> list[dict[str, str]]:
        """Collect all file records from enumeration checkpoints."""
        stmt = (
            select(JobCheckpoint)
            .where(
                JobCheckpoint.job_id == job_id,
                JobCheckpoint.checkpoint_type == "enumeration",
            )
            .order_by(JobCheckpoint.batch_number)
        )
        result = await self._db.execute(stmt)
        checkpoints = result.scalars().all()

        all_files: list[dict[str, str]] = []
        for cp in checkpoints:
            all_files.extend(cp.scope_cursor.get("files_in_site", []))
        return all_files

    async def _handle_signal(
        self,
        job: Job,
        signal: JobSignal,
        checkpoint_type: str,
        scope_cursor: dict[str, Any],
        batch_number: int,
    ) -> None:
        """Handle a pause or cancel signal — write checkpoint and update status."""
        await ack_job_signal(self._redis, str(job.id))

        # Write final checkpoint before stopping
        cp = JobCheckpoint(
            job_id=job.id,
            checkpoint_type=checkpoint_type,
            scope_cursor=scope_cursor,
            batch_number=batch_number,
            items_processed=0,
            items_failed=0,
            status="completed",
        )
        self._db.add(cp)

        if signal == JobSignal.PAUSE:
            job.status = "paused"
            logger.info("Job %s paused at batch %d", job.id, batch_number)
        elif signal == JobSignal.CANCEL:
            job.status = "failed"
            logger.info("Job %s cancelled at batch %d", job.id, batch_number)

        await self._db.commit()

    async def _fail_job(self, job: Job, error: str) -> None:
        """Mark a job as failed with an error message."""
        job.status = "failed"
        job.config = {**job.config, "error": error}
        await self._db.commit()
        logger.error("Job %s failed: %s", job.id, error)
