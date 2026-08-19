from __future__ import annotations

from dataclasses import dataclass


@dataclass
class MetricsRow:
    platform: str
    campaign_id: str
    campaign_name: str
    spend: float
    clicks: int
    impressions: int
    conversions: float
    conversion_value: float


@dataclass
class Summary:
    spend: float
    clicks: int
    impressions: int
    conversions: float
    conversion_value: float
    cpc: float | None
    ctr: float | None
    roas: float | None


def _safe_div(numerator: float, denominator: float) -> float | None:
    if denominator == 0:
        return None
    return numerator / denominator


def summarize(rows: list[MetricsRow]) -> Summary:
    spend = sum(r.spend for r in rows)
    clicks = sum(r.clicks for r in rows)
    impressions = sum(r.impressions for r in rows)
    conversions = sum(r.conversions for r in rows)
    conversion_value = sum(r.conversion_value for r in rows)

    return Summary(
        spend=spend,
        clicks=clicks,
        impressions=impressions,
        conversions=conversions,
        conversion_value=conversion_value,
        cpc=_safe_div(spend, clicks),
        ctr=_safe_div(clicks, impressions),
        roas=_safe_div(conversion_value, spend),
    )


def summarize_by_platform(rows: list[MetricsRow]) -> dict[str, Summary]:
    platforms = sorted({r.platform for r in rows})
    return {p: summarize([r for r in rows if r.platform == p]) for p in platforms}
