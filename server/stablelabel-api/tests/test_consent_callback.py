"""Tests for consent callback HTML responses and routing logic."""

from app.routers.onboard import _DENIED_HTML, _NOT_FOUND_HTML, _SUCCESS_HTML


class TestConsentHtmlResponses:
    def test_success_html_contains_close_message(self) -> None:
        assert "close this tab" in _SUCCESS_HTML
        assert "Consent granted" in _SUCCESS_HTML

    def test_denied_html_contains_retry_message(self) -> None:
        assert "Consent denied" in _DENIED_HTML
        assert "retry" in _DENIED_HTML.lower()

    def test_not_found_html_contains_reconnect_message(self) -> None:
        assert "not found" in _NOT_FOUND_HTML.lower()
        assert "reconnect" in _NOT_FOUND_HTML.lower()

    def test_all_responses_are_valid_html(self) -> None:
        for html in (_SUCCESS_HTML, _DENIED_HTML, _NOT_FOUND_HTML):
            assert html.strip().startswith("<!DOCTYPE html>")
            assert "</html>" in html
