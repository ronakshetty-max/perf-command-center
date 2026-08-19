from datetime import date

from tools import date_ranges


def test_yesterday_range():
    assert date_ranges.yesterday_range(date(2026, 8, 19)) == (date(2026, 8, 18), date(2026, 8, 18))


def test_last_7_days_range_is_inclusive_of_anchor():
    start, end = date_ranges.last_7_days_range(date(2026, 8, 19))
    assert end == date(2026, 8, 19)
    assert start == date(2026, 8, 13)
    assert (end - start).days == 6  # 7 days total, inclusive of both ends


def test_month_to_date_range():
    assert date_ranges.month_to_date_range(date(2026, 8, 19)) == (date(2026, 8, 1), date(2026, 8, 19))


def test_month_to_date_vs_prev_month_same_duration():
    current, prior = date_ranges.month_to_date_vs_prev_month(date(2026, 8, 19))
    assert current == (date(2026, 8, 1), date(2026, 8, 19))
    assert prior == (date(2026, 7, 1), date(2026, 7, 19))


def test_month_to_date_vs_prev_month_clamps_short_previous_month():
    """Anchor day 30/31 with a shorter previous month (Feb) must clamp to
    that month's last real day instead of overflowing into March."""
    current, prior = date_ranges.month_to_date_vs_prev_month(date(2026, 3, 31))
    assert current == (date(2026, 3, 1), date(2026, 3, 31))
    assert prior == (date(2026, 2, 1), date(2026, 2, 28))  # 2026 is not a leap year


def test_month_to_date_vs_prev_month_leap_year_clamp():
    current, prior = date_ranges.month_to_date_vs_prev_month(date(2024, 3, 30))
    assert prior == (date(2024, 2, 1), date(2024, 2, 29))  # 2024 IS a leap year


def test_month_to_date_vs_prev_month_crosses_year_boundary():
    current, prior = date_ranges.month_to_date_vs_prev_month(date(2026, 1, 15))
    assert current == (date(2026, 1, 1), date(2026, 1, 15))
    assert prior == (date(2025, 12, 1), date(2025, 12, 15))


def test_resolve_dispatches_to_the_right_helper():
    anchor = date(2026, 8, 19)
    assert date_ranges.resolve("yesterday", anchor) == date_ranges.yesterday_range(anchor)
    assert date_ranges.resolve("last_7_days", anchor) == date_ranges.last_7_days_range(anchor)
    assert date_ranges.resolve("mtd", anchor) == date_ranges.month_to_date_range(anchor)


def test_resolve_rejects_unknown_date_kind():
    try:
        date_ranges.resolve("mtd_vs_prev_month", date(2026, 8, 19))
        assert False, "expected ValueError — comparison kinds go through month_to_date_vs_prev_month directly"
    except ValueError:
        pass
