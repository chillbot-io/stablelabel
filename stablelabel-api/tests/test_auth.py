from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.core.auth import TokenManager
from app.core.exceptions import GraphAuthError


@pytest.fixture
def token_manager() -> TokenManager:
    return TokenManager(client_id="test-client-id", client_secret="test-secret")


@patch("app.core.auth.msal.ConfidentialClientApplication")
def test_acquire_token_success(mock_cca_cls: MagicMock, token_manager: TokenManager) -> None:
    mock_app = mock_cca_cls.return_value
    mock_app.acquire_token_for_client.return_value = {"access_token": "fake-token"}

    result = token_manager.acquire_token("tenant-1")

    assert result == "fake-token"


@patch("app.core.auth.msal.ConfidentialClientApplication")
def test_acquire_token_failure_raises_graph_auth_error(
    mock_cca_cls: MagicMock, token_manager: TokenManager
) -> None:
    mock_app = mock_cca_cls.return_value
    mock_app.acquire_token_for_client.return_value = {
        "error": "invalid_client",
        "error_description": "Bad credentials",
    }

    with pytest.raises(GraphAuthError, match="Bad credentials"):
        token_manager.acquire_token("tenant-1")


@patch("app.core.auth.msal.ConfidentialClientApplication")
def test_acquire_token_failure_unknown_error(
    mock_cca_cls: MagicMock, token_manager: TokenManager
) -> None:
    mock_app = mock_cca_cls.return_value
    mock_app.acquire_token_for_client.return_value = {"error": "unknown"}

    with pytest.raises(GraphAuthError):
        token_manager.acquire_token("tenant-1")


@patch("app.core.auth.msal.ConfidentialClientApplication")
def test_get_app_caches_per_tenant(
    mock_cca_cls: MagicMock, token_manager: TokenManager
) -> None:
    # Return a new MagicMock for each constructor call so distinct tenants
    # produce distinct objects.
    mock_cca_cls.side_effect = lambda **kwargs: MagicMock()

    app_a1 = token_manager._get_app("tenant-a")
    app_a2 = token_manager._get_app("tenant-a")
    assert app_a1 is app_a2

    app_b = token_manager._get_app("tenant-b")
    assert app_a1 is not app_b


@patch("app.core.auth.msal.ConfidentialClientApplication")
def test_get_app_creates_with_correct_authority(
    mock_cca_cls: MagicMock, token_manager: TokenManager
) -> None:
    token_manager._get_app("my-tenant")

    mock_cca_cls.assert_called_once_with(
        client_id="test-client-id",
        client_credential="test-secret",
        authority="https://login.microsoftonline.com/my-tenant",
    )


@patch("app.core.auth.msal.ConfidentialClientApplication")
def test_acquire_token_uses_graph_scope(
    mock_cca_cls: MagicMock, token_manager: TokenManager
) -> None:
    mock_app = mock_cca_cls.return_value
    mock_app.acquire_token_for_client.return_value = {"access_token": "tok"}

    token_manager.acquire_token("tenant-1")

    mock_app.acquire_token_for_client.assert_called_once_with(
        scopes=["https://graph.microsoft.com/.default"]
    )
