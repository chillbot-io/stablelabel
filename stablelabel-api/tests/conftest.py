"""Shared test fixtures."""

import os

# Set required env vars for Settings before any imports that trigger get_settings()
os.environ.setdefault("SL_SESSION_SECRET", "test-secret-not-for-production")
