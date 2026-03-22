"""Minimal cron expression evaluator — no external dependencies.

Supports standard 5-field cron: minute hour day_of_month month day_of_week

Field syntax:
  *        = any value
  5        = exact value
  1,3,5    = list
  1-5      = range
  */15     = step (every 15)
  1-30/5   = range with step

Examples:
  "0 2 * * *"     = daily at 02:00
  "*/30 * * * *"  = every 30 minutes
  "0 9 * * 1-5"   = weekdays at 09:00
  "0 0 1 * *"     = first of every month at midnight
"""

from __future__ import annotations

from datetime import datetime


def is_cron_due(expression: str, now: datetime) -> bool:
    """Check if a cron expression matches the current time (to the minute)."""
    parts = expression.strip().split()
    if len(parts) != 5:
        return False

    minute, hour, day, month, dow = parts

    return (
        _matches(minute, now.minute, 0, 59)
        and _matches(hour, now.hour, 0, 23)
        and _matches(day, now.day, 1, 31)
        and _matches(month, now.month, 1, 12)
        and _matches(dow, now.weekday(), 0, 6)  # 0=Monday in Python
    )


def _matches(field: str, value: int, min_val: int, max_val: int) -> bool:
    """Check if a single cron field matches the given value."""
    if field == "*":
        return True

    for part in field.split(","):
        if _part_matches(part.strip(), value, min_val, max_val):
            return True

    return False


def _part_matches(part: str, value: int, min_val: int, max_val: int) -> bool:
    """Evaluate a single cron part (e.g., '5', '1-10', '*/15', '1-30/5')."""
    # Step: */N or range/N
    step = 1
    if "/" in part:
        range_part, step_str = part.split("/", 1)
        try:
            step = int(step_str)
        except ValueError:
            return False
        part = range_part

    # Wildcard with step
    if part == "*":
        return (value - min_val) % step == 0

    # Range: N-M
    if "-" in part:
        try:
            start, end = part.split("-", 1)
            start_val = int(start)
            end_val = int(end)
        except ValueError:
            return False
        if value < start_val or value > end_val:
            return False
        return (value - start_val) % step == 0

    # Exact value
    try:
        return int(part) == value
    except ValueError:
        return False
