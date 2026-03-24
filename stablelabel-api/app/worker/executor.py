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
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from arq.connections import ArqRedis

from app.core.exceptions import StableLabelError
from app.core.redis import JobSignal, ack_job_signal, check_job_signal
from app.db.models import (
    AuditEvent, ClassificationEvent, Job, JobCheckpoint, JobMetric, Policy, ScanResult,
)
from app.models.document import LabelAssignment, JobStatus
from app.config import Settings
from app.services.classifier import classify_content_async, is_large_text
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

# File size limits
_MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024  # 5 GB
_STREAM_THRESHOLD = 50 * 1024 * 1024  # 50 MB — above this, stream to temp file

# Zip bomb protection limits
_ZIP_MAX_ENTRIES = 10_000  # max files inside a single archive
_ZIP_MAX_UNCOMPRESSED = 200 * 1024 * 1024  # 200 MB total decompressed
_ZIP_MAX_RATIO = 100  # max compression ratio (uncompressed / compressed)
_ZIP_MAX_SINGLE_FILE = 100 * 1024 * 1024  # 100 MB for a single file inside the zip


class _ZipBombError(Exception):
    """Raised when a zip archive looks like a zip bomb."""


def _validate_zip_safety(zf: "zipfile.ZipFile", filename: str) -> None:
    """Check a zip archive for zip bomb characteristics.

    Raises _ZipBombError if any limit is exceeded.
    """
    if len(zf.infolist()) > _ZIP_MAX_ENTRIES:
        raise _ZipBombError(
            f"{filename}: zip has {len(zf.infolist())} entries "
            f"(limit {_ZIP_MAX_ENTRIES})"
        )

    total_uncompressed = 0
    for info in zf.infolist():
        # Check individual file size
        if info.file_size > _ZIP_MAX_SINGLE_FILE:
            raise _ZipBombError(
                f"{filename}: entry '{info.filename}' is {info.file_size} bytes "
                f"uncompressed (limit {_ZIP_MAX_SINGLE_FILE})"
            )

        # Check compression ratio per entry
        if info.compress_size > 0:
            ratio = info.file_size / info.compress_size
            if ratio > _ZIP_MAX_RATIO:
                raise _ZipBombError(
                    f"{filename}: entry '{info.filename}' has compression ratio "
                    f"{ratio:.0f}:1 (limit {_ZIP_MAX_RATIO}:1)"
                )

        total_uncompressed += info.file_size

    if total_uncompressed > _ZIP_MAX_UNCOMPRESSED:
        raise _ZipBombError(
            f"{filename}: total uncompressed size {total_uncompressed} bytes "
            f"(limit {_ZIP_MAX_UNCOMPRESSED})"
        )


def _extract_text_from_bytes(content: bytes, filename: str) -> str:
    """Extract text from file content based on file extension.

    Supports:
      - Plain text (.txt, .csv, .json, .xml, .ps1, .md, etc.)
      - Office OOXML (.docx, .xlsx, .pptx) via zipfile + XML parsing
      - PDF via pdfminer.six (optional dependency)

    Falls back to UTF-8 decode for unknown types.
    """
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    # OOXML formats — extract text from XML inside the ZIP
    if ext in ("docx", "docm"):
        return _extract_docx(content)
    if ext in ("xlsx", "xlsm"):
        return _extract_xlsx(content)
    if ext in ("pptx", "pptm"):
        return _extract_pptx(content)
    if ext == "pdf":
        return _extract_pdf(content)

    # Default: UTF-8 text
    try:
        return content.decode("utf-8", errors="replace")
    except (UnicodeDecodeError, AttributeError):
        return ""


def _extract_docx(content: bytes) -> str:
    """Extract text from .docx by parsing word/document.xml inside the ZIP."""
    import zipfile
    import io
    import xml.etree.ElementTree as ET

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            _validate_zip_safety(zf, "docx")
            if "word/document.xml" not in zf.namelist():
                return ""
            xml_content = zf.read("word/document.xml")
            root = ET.fromstring(xml_content)
            # Word namespace
            ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
            texts = [t.text for t in root.iter(f"{{{ns['w']}}}t") if t.text]
            return " ".join(texts)
    except _ZipBombError as exc:
        logger.error("Zip bomb detected in docx: %s", exc)
        return ""
    except (zipfile.BadZipFile, ET.ParseError, KeyError):
        return ""


def _extract_xlsx(content: bytes) -> str:
    """Extract text from .xlsx — shared strings, inline strings, and cell values.

    Excel stores text in three places:
      1. xl/sharedStrings.xml — shared string table (most text cells)
      2. Sheet XML <is><t> — inline strings
      3. Sheet XML <v> — raw cell values (numbers, dates, formulas)
    We read all three to ensure numeric PII (SSNs, account numbers) is captured.
    """
    import zipfile
    import io
    import xml.etree.ElementTree as ET

    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            _validate_zip_safety(zf, "xlsx")
            texts: list[str] = []

            # 1. Shared strings table
            if "xl/sharedStrings.xml" in zf.namelist():
                root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
                texts.extend(t.text for t in root.iter(f"{{{ns['s']}}}t") if t.text)

            # 2 & 3. Walk sheet files for inline strings and raw cell values
            for name in sorted(zf.namelist()):
                if not name.startswith("xl/worksheets/sheet") or not name.endswith(".xml"):
                    continue
                root = ET.fromstring(zf.read(name))
                for cell in root.iter(f"{{{ns['s']}}}c"):
                    # Inline strings: <c><is><t>value</t></is></c>
                    inline = cell.find(f"{{{ns['s']}}}is")
                    if inline is not None:
                        for t in inline.iter(f"{{{ns['s']}}}t"):
                            if t.text:
                                texts.append(t.text)
                        continue
                    # Raw values (numbers, formula results): <c><v>123</v></c>
                    # Skip shared-string references (t="s") since we already have those
                    cell_type = cell.get("t", "")
                    if cell_type == "s":
                        continue
                    v = cell.find(f"{{{ns['s']}}}v")
                    if v is not None and v.text:
                        texts.append(v.text)

            return " ".join(texts)
    except _ZipBombError as exc:
        logger.error("Zip bomb detected in xlsx: %s", exc)
        return ""
    except (zipfile.BadZipFile, ET.ParseError, KeyError):
        return ""


def _extract_pptx(content: bytes) -> str:
    """Extract text from .pptx slide XML inside the ZIP."""
    import zipfile
    import io
    import xml.etree.ElementTree as ET

    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            _validate_zip_safety(zf, "pptx")
            texts: list[str] = []
            ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main"}
            for name in sorted(zf.namelist()):
                if name.startswith("ppt/slides/slide") and name.endswith(".xml"):
                    root = ET.fromstring(zf.read(name))
                    texts.extend(t.text for t in root.iter(f"{{{ns['a']}}}t") if t.text)
            return " ".join(texts)
    except _ZipBombError as exc:
        logger.error("Zip bomb detected in pptx: %s", exc)
        return ""
    except (zipfile.BadZipFile, ET.ParseError, KeyError):
        return ""


def _extract_pdf(content: bytes) -> str:
    """Extract text from PDF using pdfminer.six (optional dependency)."""
    try:
        from pdfminer.high_level import extract_text
        import io

        return extract_text(io.BytesIO(content))
    except ImportError:
        logger.debug("pdfminer.six not installed — skipping PDF text extraction")
        return ""
    except Exception:
        return ""


def _top_classification(
    classification: ClassificationResult | None,
) -> tuple[str | None, float | None]:
    """Extract the highest-confidence entity type from a classification result.

    Returns (entity_type, confidence) or (None, None) if no entities.
    """
    if not classification or not classification.entities:
        return None, None
    best = max(classification.entities, key=lambda e: e.confidence)
    return best.entity_type, best.confidence


class JobExecutor:
    """Executes a labelling job end-to-end with checkpointing and signal handling."""

    def __init__(
        self,
        db: AsyncSession,
        graph: GraphClient,
        doc_service: DocumentService,
        redis: Redis,
        arq_pool: ArqRedis | None = None,
    ) -> None:
        self._db = db
        self._graph = graph
        self._docs = doc_service
        self._redis = redis
        self._arq_pool = arq_pool

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

            elif job.status == "running":
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
        try:
            sites = await self._graph.get_all_pages(
                tenant_id, "/sites?search=*"
            )
        except (StableLabelError, httpx.HTTPError) as exc:
            raise RuntimeError(f"Failed to enumerate SharePoint sites: {exc}") from exc

        # Apply site scope filter if configured
        scoped_site_ids: list[str] | None = job.config.get("site_ids")
        if scoped_site_ids:
            sites = [s for s in sites if s.get("id", "") in scoped_site_ids]
            logger.info(
                "Job %s: scoped to %d site(s) out of %d available",
                job.id, len(sites), len(scoped_site_ids),
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
            except (StableLabelError, httpx.HTTPError) as exc:
                logger.warning("Failed to enumerate drives for site %s: %s, skipping", site_id, exc)
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
                except (StableLabelError, httpx.HTTPError):
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

        Three modes:
          1. Static: job.config["target_label_id"] — apply one label to all files
          2. Policy-driven: job.config["use_policies"] = true — classify each file,
             evaluate policies, and pick the appropriate label per file
          3. Dry-run: job.config["dry_run"] = true — classify and evaluate but don't
             actually apply labels (works with both static and policy-driven)
        """
        use_policies = job.config.get("use_policies", False)
        dry_run = job.config.get("dry_run", False)
        assignment_method = job.config.get("assignment_method", "standard")
        justification = job.config.get("justification_text", "")
        confirm_encryption = job.config.get("confirm_encryption", False)

        if dry_run:
            logger.info("Job %s: running in DRY-RUN mode — no labels will be applied", job.id)

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
            batch_skipped = 0
            batch_start = time.monotonic()

            for file_info in batch:
                drive_id = file_info["drive_id"]
                item_id = file_info["item_id"]
                filename = file_info["name"]

                # Determine which label to apply
                file_classification: ClassificationResult | None = None
                if use_policies:
                    label_id, file_classification = await self._resolve_label_via_policy(
                        tenant_id, drive_id, item_id, filename, policy_rules,
                        job=job,
                    )

                    # Large document → enqueue deferred async classification
                    if file_classification and file_classification.error == "deferred":
                        deferred = await self._enqueue_deferred_classification(
                            job=job,
                            tenant_id=tenant_id,
                            msp_tenant_id=msp_tenant_id,
                            drive_id=drive_id,
                            item_id=item_id,
                            filename=filename,
                            text=file_classification.text_content,
                            use_policies=True,
                            static_label_id="",
                            assignment_method=assignment_method,
                            justification_text=justification,
                            confirm_encryption=confirm_encryption,
                            dry_run=dry_run,
                        )
                        if deferred:
                            # Don't count toward batch totals — deferred task
                            # will update job counters when it completes
                            continue
                        # If arq pool not available, fall back to skip
                        files_skipped += 1
                        batch_skipped += 1
                        self._db.add(ScanResult(
                            customer_tenant_id=job.customer_tenant_id,
                            job_id=job.id,
                            drive_id=drive_id,
                            item_id=item_id,
                            file_name=filename,
                            outcome="skipped",
                        ))
                        continue

                    if not label_id:
                        files_skipped += 1
                        batch_skipped += 1
                        # Extract top classification for the scan result
                        top_entity, top_conf = _top_classification(file_classification)
                        self._db.add(ScanResult(
                            customer_tenant_id=job.customer_tenant_id,
                            job_id=job.id,
                            drive_id=drive_id,
                            item_id=item_id,
                            file_name=filename,
                            classification=top_entity,
                            confidence=top_conf,
                            outcome="skipped",
                        ))
                        continue  # no policy matched — skip file
                else:
                    label_id = static_label_id

                top_entity, top_conf = _top_classification(file_classification)

                # In dry-run mode: record what would happen without applying
                if dry_run:
                    files_labelled += 1
                    batch_applied.append({
                        "item_id": item_id,
                        "drive_id": drive_id,
                        "label_id": label_id,
                        "previous_label_id": "",
                        "dry_run": True,
                    })
                    self._db.add(ScanResult(
                        customer_tenant_id=job.customer_tenant_id,
                        job_id=job.id,
                        drive_id=drive_id,
                        item_id=item_id,
                        file_name=filename,
                        classification=top_entity,
                        confidence=top_conf,
                        label_applied=label_id,
                        outcome="labelled",
                    ))
                    continue

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
                    self._db.add(ScanResult(
                        customer_tenant_id=job.customer_tenant_id,
                        job_id=job.id,
                        drive_id=drive_id,
                        item_id=item_id,
                        file_name=filename,
                        classification=top_entity,
                        confidence=top_conf,
                        label_applied=label_id,
                        outcome="labelled",
                    ))
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
                        batch_skipped += 1
                        self._db.add(ScanResult(
                            customer_tenant_id=job.customer_tenant_id,
                            job_id=job.id,
                            drive_id=drive_id,
                            item_id=item_id,
                            file_name=filename,
                            classification=top_entity,
                            confidence=top_conf,
                            label_applied=label_id,
                            outcome="skipped",
                        ))
                    else:
                        files_failed += 1
                        batch_failed += 1
                        self._db.add(ScanResult(
                            customer_tenant_id=job.customer_tenant_id,
                            job_id=job.id,
                            drive_id=drive_id,
                            item_id=item_id,
                            file_name=filename,
                            classification=top_entity,
                            confidence=top_conf,
                            label_applied=label_id,
                            outcome="failed",
                        ))
                        logger.warning(
                            "Job %s: failed to label %s/%s: %s",
                            job.id, drive_id, item_id, result.error,
                        )
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
                    self._db.add(ScanResult(
                        customer_tenant_id=job.customer_tenant_id,
                        job_id=job.id,
                        drive_id=drive_id,
                        item_id=item_id,
                        file_name=filename,
                        label_applied=label_id,
                        outcome="failed",
                    ))
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

            # Write batch metrics
            batch_duration_ms = int((time.monotonic() - batch_start) * 1000)
            batch_total = len(batch_applied) + batch_failed + batch_skipped
            fps = batch_total / max(batch_duration_ms / 1000, 0.001)
            self._db.add(JobMetric(
                customer_tenant_id=job.customer_tenant_id,
                job_id=job.id,
                batch_number=batch_number,
                files_processed=batch_total,
                files_failed=batch_failed,
                files_skipped=batch_skipped,
                duration_ms=batch_duration_ms,
                files_per_second=round(fps, 2),
            ))

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
                len(batch_applied), batch_skipped, batch_failed,
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
                except (StableLabelError, httpx.HTTPError):
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
        *,
        job: Job | None = None,
    ) -> tuple[str | None, ClassificationResult]:
        """Classify a file's content and evaluate policies to pick a label.

        Returns (target_label_id, classification_result).
        target_label_id is None if no policy matched.
        If classification.error == "deferred", the caller must enqueue async
        processing — no policy evaluation is done here.
        """
        # Download file content as text for classification
        classification = await self._classify_file(tenant_id, drive_id, item_id, filename)

        # Large document → pass through so caller can enqueue deferred task
        if classification.error == "deferred":
            return None, classification

        # Persist classification events for detected entities
        if job and classification.entities:
            # Group by entity type
            entity_groups: dict[str, list] = {}
            for entity in classification.entities:
                entity_groups.setdefault(entity.entity_type, []).append(entity)

            for entity_type, entities in entity_groups.items():
                self._db.add(ClassificationEvent(
                    customer_tenant_id=job.customer_tenant_id,
                    job_id=job.id,
                    entity_type=entity_type,
                    entity_count=len(entities),
                    max_confidence=max(e.confidence for e in entities),
                    file_name=filename,
                ))

        # Evaluate all policies against the classification result
        match = evaluate_policies(policy_rules, classification, filename)
        if match:
            logger.debug(
                "File %s/%s matched policy '%s' → label %s",
                drive_id, item_id, match.policy_name, match.target_label_id,
            )
            return match.target_label_id, classification

        return None, classification

    async def _download_and_extract_text(
        self,
        tenant_id: str,
        drive_id: str,
        item_id: str,
        filename: str,
    ) -> str | None:
        """Download a file via Graph and extract its text content.

        Supports files up to 5 GB. Small files (< 50 MB) are downloaded into
        memory; larger files are streamed to a temp file to avoid OOM.

        Returns the extracted text, or None if the file should be skipped
        (too large, download failed, classifier disabled, etc.).
        """
        try:
            settings = Settings()
            if not settings.classifier_enabled:
                return None
        except Exception:
            pass

        body = await self._graph.get(
            tenant_id,
            f"/drives/{drive_id}/items/{item_id}",
            select="id,name,size,@microsoft.graph.downloadUrl",
        )

        size = body.get("size", 0)
        if size > _MAX_FILE_SIZE:
            logger.info(
                "File %s/%s is %d bytes (> %d limit), skipping classification",
                drive_id, item_id, size, _MAX_FILE_SIZE,
            )
            return None

        download_url = body.get("@microsoft.graph.downloadUrl", "")
        if not download_url:
            return None

        import httpx as _httpx
        import tempfile

        if size <= _STREAM_THRESHOLD:
            # Small file — download into memory
            async with _httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.get(download_url)
                if resp.status_code != 200:
                    return None
            content = resp.content
        else:
            # Large file — stream to temp file to avoid holding it all in memory
            logger.info(
                "Streaming large file %s (%d bytes) to temp file",
                filename, size,
            )
            try:
                with tempfile.SpooledTemporaryFile(max_size=_STREAM_THRESHOLD) as tmp:
                    async with _httpx.AsyncClient(timeout=300.0) as client:
                        async with client.stream("GET", download_url) as resp:
                            if resp.status_code != 200:
                                return None
                            async for chunk in resp.aiter_bytes(chunk_size=1024 * 1024):
                                tmp.write(chunk)
                    tmp.seek(0)
                    content = tmp.read()
            except (IOError, _httpx.HTTPError) as exc:
                logger.warning(
                    "Streaming download failed for %s/%s: %s",
                    drive_id, item_id, exc,
                )
                return None

        text = _extract_text_from_bytes(content, filename)
        return text if text and text.strip() else None

    async def _classify_file(
        self,
        tenant_id: str,
        drive_id: str,
        item_id: str,
        filename: str,
    ) -> ClassificationResult:
        """Download file content and run it through the content classifier.

        Uses format-aware text extraction for Office/PDF files.
        Respects the classifier_enabled config flag.

        For small texts (<500 KB): classifies inline via thread pool.
        For large texts (≥500 KB): returns a result with error="deferred"
        so the caller can enqueue async processing.
        """
        try:
            text = await self._download_and_extract_text(
                tenant_id, drive_id, item_id, filename,
            )
            if text is None:
                return ClassificationResult(filename=filename)

            # Large text → signal the caller to defer
            if is_large_text(text):
                return ClassificationResult(
                    filename=filename,
                    text_content=text,
                    error="deferred",
                )

            # Small text → classify inline (runs in thread pool, won't block event loop)
            return await classify_content_async(text, filename=filename)

        except Exception as exc:
            logger.warning(
                "Classification failed for %s/%s: %s", drive_id, item_id, exc,
            )
            return ClassificationResult(filename=filename, error=str(exc))

    # ── Deferred classification ──────────────────────────────────

    async def _enqueue_deferred_classification(
        self,
        *,
        job: Job,
        tenant_id: str,
        msp_tenant_id: uuid.UUID | None,
        drive_id: str,
        item_id: str,
        filename: str,
        text: str,
        use_policies: bool,
        static_label_id: str,
        assignment_method: str,
        justification_text: str,
        confirm_encryption: bool,
        dry_run: bool,
    ) -> bool:
        """Create a deferred ScanResult and enqueue async classification.

        Returns True if successfully enqueued, False if arq pool unavailable.
        """
        if self._arq_pool is None:
            logger.warning(
                "arq pool not available — cannot defer classification for %s",
                filename,
            )
            return False

        # Create placeholder ScanResult with outcome="deferred"
        scan_result = ScanResult(
            customer_tenant_id=job.customer_tenant_id,
            job_id=job.id,
            drive_id=drive_id,
            item_id=item_id,
            file_name=filename,
            outcome="deferred",
        )
        self._db.add(scan_result)
        await self._db.flush()  # get the generated id

        await self._arq_pool.enqueue_job(
            "classify_and_label_file",
            _job_id=f"deferred-{scan_result.id}",
            tenant_id=tenant_id,
            customer_tenant_id=str(job.customer_tenant_id),
            msp_tenant_id=str(msp_tenant_id) if msp_tenant_id else None,
            job_id=str(job.id),
            drive_id=drive_id,
            item_id=item_id,
            filename=filename,
            text=text,
            scan_result_id=str(scan_result.id),
            use_policies=use_policies,
            static_label_id=static_label_id,
            assignment_method=assignment_method,
            justification_text=justification_text,
            confirm_encryption=confirm_encryption,
            dry_run=dry_run,
        )

        logger.info(
            "Deferred classification enqueued for %s (%d chars), scan_result %s",
            filename, len(text), scan_result.id,
        )
        return True

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
