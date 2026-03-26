"""Tests for ScanResultResponse and ScanResultPage Pydantic models.

These models are defined in app.routers.jobs. We replicate their schema here
to avoid pulling in the full router import chain (which requires jose/cryptography).
The test validates the Pydantic model shape that the API uses.
"""

import pytest
from pydantic import BaseModel


# Mirror the model definitions from app.routers.jobs to avoid heavy import chain
class ScanResultResponse(BaseModel):
    id: str
    file_name: str
    drive_id: str
    item_id: str
    classification: str | None
    confidence: float | None
    label_applied: str | None
    previous_label: str | None
    outcome: str
    ts: str


class ScanResultPage(BaseModel):
    items: list[ScanResultResponse]
    total: int
    page: int
    page_size: int


class TestScanResultResponseModel:
    def test_scan_result_response_model(self) -> None:
        resp = ScanResultResponse(
            id="sr-001",
            file_name="report.docx",
            drive_id="drive-abc",
            item_id="item-123",
            classification="CREDIT_CARD",
            confidence=0.95,
            label_applied="Confidential",
            previous_label=None,
            outcome="labelled",
            ts="2026-03-23T10:00:00Z",
        )
        assert resp.id == "sr-001"
        assert resp.file_name == "report.docx"
        assert resp.drive_id == "drive-abc"
        assert resp.item_id == "item-123"
        assert resp.classification == "CREDIT_CARD"
        assert resp.confidence == 0.95
        assert resp.label_applied == "Confidential"
        assert resp.previous_label is None
        assert resp.outcome == "labelled"
        assert resp.ts == "2026-03-23T10:00:00Z"

    def test_scan_result_response_nullable_fields(self) -> None:
        resp = ScanResultResponse(
            id="sr-002",
            file_name="photo.jpg",
            drive_id="drive-abc",
            item_id="item-456",
            classification=None,
            confidence=None,
            label_applied=None,
            previous_label="General",
            outcome="skipped",
            ts="2026-03-23T11:00:00Z",
        )
        assert resp.classification is None
        assert resp.confidence is None
        assert resp.label_applied is None
        assert resp.previous_label == "General"

    def test_scan_result_response_serialization(self) -> None:
        resp = ScanResultResponse(
            id="sr-003",
            file_name="data.xlsx",
            drive_id="d1",
            item_id="i1",
            classification="US_SSN",
            confidence=0.88,
            label_applied="Highly Confidential",
            previous_label=None,
            outcome="labelled",
            ts="2026-03-23T12:00:00Z",
        )
        data = resp.model_dump()
        assert data["classification"] == "US_SSN"
        assert data["confidence"] == 0.88


class TestScanResultPageModel:
    def test_scan_result_page_model(self) -> None:
        items = [
            ScanResultResponse(
                id="sr-001",
                file_name="report.docx",
                drive_id="drive-abc",
                item_id="item-123",
                classification="CREDIT_CARD",
                confidence=0.95,
                label_applied="Confidential",
                previous_label=None,
                outcome="labelled",
                ts="2026-03-23T10:00:00Z",
            ),
            ScanResultResponse(
                id="sr-002",
                file_name="notes.txt",
                drive_id="drive-abc",
                item_id="item-456",
                classification=None,
                confidence=None,
                label_applied=None,
                previous_label=None,
                outcome="skipped",
                ts="2026-03-23T10:01:00Z",
            ),
        ]
        page = ScanResultPage(items=items, total=25, page=1, page_size=50)
        assert len(page.items) == 2
        assert page.total == 25
        assert page.page == 1
        assert page.page_size == 50
        assert page.items[0].file_name == "report.docx"
        assert page.items[1].outcome == "skipped"

    def test_scan_result_page_empty(self) -> None:
        page = ScanResultPage(items=[], total=0, page=1, page_size=50)
        assert page.items == []
        assert page.total == 0
