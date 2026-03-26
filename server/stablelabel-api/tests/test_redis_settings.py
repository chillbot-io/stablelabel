"""Tests for the shared Redis URL parser."""

from app.core.redis import parse_redis_settings


class TestParseRedisSettings:
    def test_default_url(self) -> None:
        settings = parse_redis_settings("redis://localhost:6379/0")
        assert settings.host == "localhost"
        assert settings.port == 6379
        assert settings.database == 0
        assert settings.password is None

    def test_with_password(self) -> None:
        settings = parse_redis_settings("redis://:secret@redis.example.com:6380/2")
        assert settings.host == "redis.example.com"
        assert settings.port == 6380
        assert settings.database == 2
        assert settings.password == "secret"

    def test_no_port_defaults_to_6379(self) -> None:
        settings = parse_redis_settings("redis://myhost/1")
        assert settings.host == "myhost"
        assert settings.port == 6379
        assert settings.database == 1

    def test_no_database_defaults_to_0(self) -> None:
        settings = parse_redis_settings("redis://localhost:6379")
        assert settings.database == 0

    def test_empty_path_defaults_to_0(self) -> None:
        settings = parse_redis_settings("redis://localhost:6379/")
        assert settings.database == 0
