"""Tests for ScanResultResponse and ScanResultPage Pydantic models."""

import pytest

from app.routers.jobs import ScanResultResponse, ScanResultPage


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
