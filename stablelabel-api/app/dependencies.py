"""FastAPI dependency injection — wires up services."""

from __future__ import annotations

from functools import lru_cache

from app.config import Settings
from app.core.auth import TokenManager
from app.services.document_service import DocumentService
from app.services.graph_client import GraphClient
from app.services.label_service import LabelService


@lru_cache
def get_settings() -> Settings:
    return Settings()


@lru_cache
def get_token_manager() -> TokenManager:
    s = get_settings()
    return TokenManager(client_id=s.azure_client_id, client_secret=s.azure_client_secret)


@lru_cache
def get_graph_client() -> GraphClient:
    return GraphClient(token_manager=get_token_manager())


@lru_cache
def get_label_service() -> LabelService:
    return LabelService(graph=get_graph_client())


@lru_cache
def get_document_service() -> DocumentService:
    return DocumentService(graph=get_graph_client(), labels=get_label_service())
