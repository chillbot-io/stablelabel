"""Tests for the cron expression evaluator."""

from datetime import datetime, timezone

import pytest

from app.worker.cron_eval import is_cron_due


# Helper to build a specific time
def _t(minute: int = 0, hour: int = 0, day: int = 1, month: int = 1, year: int = 2026) -> datetime:
    # Note: weekday() is 0=Monday in Python
    return datetime(year, month, day, hour, minute, tzinfo=timezone.utc)


class TestWildcard:
    def test_all_wildcards_always_matches(self) -> None:
        assert is_cron_due("* * * * *", _t(minute=30, hour=14, day=15, month=6))

    def test_all_wildcards_midnight(self) -> None:
        assert is_cron_due("* * * * *", _t())


class TestExactValues:
    def test_exact_minute(self) -> None:
        assert is_cron_due("30 * * * *", _t(minute=30))
        assert not is_cron_due("30 * * * *", _t(minute=15))

    def test_exact_hour(self) -> None:
        assert is_cron_due("0 9 * * *", _t(minute=0, hour=9))
        assert not is_cron_due("0 9 * * *", _t(minute=0, hour=10))

    def test_exact_day_of_month(self) -> None:
        assert is_cron_due("0 0 15 * *", _t(day=15))
        assert not is_cron_due("0 0 15 * *", _t(day=16))

    def test_exact_month(self) -> None:
        assert is_cron_due("0 0 1 6 *", _t(month=6))
        assert not is_cron_due("0 0 1 6 *", _t(month=7))


class TestRanges:
    def test_minute_range(self) -> None:
        assert is_cron_due("0-15 * * * *", _t(minute=10))
        assert not is_cron_due("0-15 * * * *", _t(minute=20))

    def test_range_boundaries(self) -> None:
        assert is_cron_due("5-10 * * * *", _t(minute=5))
        assert is_cron_due("5-10 * * * *", _t(minute=10))
        assert not is_cron_due("5-10 * * * *", _t(minute=4))
        assert not is_cron_due("5-10 * * * *", _t(minute=11))

    def test_weekday_range(self) -> None:
        # 2026-01-05 is Monday (weekday=0)
        monday = _t(day=5)
        assert monday.weekday() == 0
        assert is_cron_due("* * * * 0-4", monday)  # Mon-Fri

        # 2026-01-03 is Saturday (weekday=5)
        saturday = _t(day=3)
        assert saturday.weekday() == 5
        assert not is_cron_due("* * * * 0-4", saturday)


class TestLists:
    def test_minute_list(self) -> None:
        assert is_cron_due("0,15,30,45 * * * *", _t(minute=15))
        assert is_cron_due("0,15,30,45 * * * *", _t(minute=45))
        assert not is_cron_due("0,15,30,45 * * * *", _t(minute=20))


class TestSteps:
    def test_every_15_minutes(self) -> None:
        assert is_cron_due("*/15 * * * *", _t(minute=0))
        assert is_cron_due("*/15 * * * *", _t(minute=15))
        assert is_cron_due("*/15 * * * *", _t(minute=30))
        assert is_cron_due("*/15 * * * *", _t(minute=45))
        assert not is_cron_due("*/15 * * * *", _t(minute=7))

    def test_every_2_hours(self) -> None:
        assert is_cron_due("0 */2 * * *", _t(hour=0))
        assert is_cron_due("0 */2 * * *", _t(hour=4))
        assert not is_cron_due("0 */2 * * *", _t(hour=3))

    def test_range_with_step(self) -> None:
        # 1-30/5 = 1, 6, 11, 16, 21, 26
        assert is_cron_due("1-30/5 * * * *", _t(minute=1))
        assert is_cron_due("1-30/5 * * * *", _t(minute=6))
        assert is_cron_due("1-30/5 * * * *", _t(minute=26))
        assert not is_cron_due("1-30/5 * * * *", _t(minute=2))
        assert not is_cron_due("1-30/5 * * * *", _t(minute=31))


class TestCommonPatterns:
    def test_daily_at_2am(self) -> None:
        assert is_cron_due("0 2 * * *", _t(minute=0, hour=2))
        assert not is_cron_due("0 2 * * *", _t(minute=0, hour=3))

    def test_weekdays_at_9am(self) -> None:
        # 2026-01-05 is Monday
        monday_9am = _t(minute=0, hour=9, day=5)
        assert is_cron_due("0 9 * * 0-4", monday_9am)

    def test_first_of_month_midnight(self) -> None:
        assert is_cron_due("0 0 1 * *", _t(day=1))
        assert not is_cron_due("0 0 1 * *", _t(day=2))

    def test_every_30_minutes(self) -> None:
        assert is_cron_due("*/30 * * * *", _t(minute=0))
        assert is_cron_due("*/30 * * * *", _t(minute=30))
        assert not is_cron_due("*/30 * * * *", _t(minute=15))


class TestInvalidExpressions:
    def test_too_few_fields(self) -> None:
        assert not is_cron_due("* * *", _t())

    def test_too_many_fields(self) -> None:
        assert not is_cron_due("* * * * * *", _t())

    def test_empty_string(self) -> None:
        assert not is_cron_due("", _t())

    def test_invalid_value(self) -> None:
        assert not is_cron_due("abc * * * *", _t())
