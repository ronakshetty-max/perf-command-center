from __future__ import annotations

import calendar
from datetime import date, timedelta

DateRange = tuple[date, date]


def today() -> date:
    # Single indirection point so callers/tests can pin "now" by monkeypatching
    # this function instead of freezing the system clock.
    return date.today()


def yesterday_range(anchor: date) -> DateRange:
    d = anchor - timedelta(days=1)
    return (d, d)


def last_7_days_range(anchor: date) -> DateRange:
    return (anchor - timedelta(days=6), anchor)


def month_to_date_range(anchor: date) -> DateRange:
    return (anchor.replace(day=1), anchor)


def _shift_month(anchor: date, months: int) -> tuple[int, int]:
    """Returns (year, month) for `anchor`'s month shifted by `months` (can be negative)."""
    zero_based = anchor.month - 1 + months
    year = anchor.year + zero_based // 12
    month = zero_based % 12 + 1
    return year, month


def month_to_date_vs_prev_month(anchor: date) -> tuple[DateRange, DateRange]:
    """Returns (this_month_to_date, same_duration_in_previous_month).

    E.g. anchor=2026-08-19 -> ((Aug 1, Aug 19), (Jul 1, Jul 19)). If the
    previous month is shorter than the anchor's day-of-month (e.g. anchor is
    Mar 30/31 and the previous month is February), the previous-month end
    date is clamped to that month's last day rather than overflowing into
    the following month.
    """
    current = month_to_date_range(anchor)
    prev_year, prev_month = _shift_month(anchor, -1)
    prev_days_in_month = calendar.monthrange(prev_year, prev_month)[1]
    prev_day = min(anchor.day, prev_days_in_month)
    prior = (date(prev_year, prev_month, 1), date(prev_year, prev_month, prev_day))
    return current, prior


def resolve(date_kind: str, anchor: date) -> DateRange:
    """Resolves a non-comparison date_kind ("yesterday" | "last_7_days" | "mtd")
    to a concrete (start, end) date pair as of `anchor`."""
    if date_kind == "yesterday":
        return yesterday_range(anchor)
    if date_kind == "last_7_days":
        return last_7_days_range(anchor)
    if date_kind == "mtd":
        return month_to_date_range(anchor)
    raise ValueError(f"Unsupported date_kind for resolve(): {date_kind!r}")
