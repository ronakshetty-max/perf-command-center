import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.aggregation import MetricsRow, summarize, summarize_by_platform


def row(platform="google", spend=0.0, clicks=0, impressions=0, conversions=0.0, conversion_value=0.0, campaign_id="1", campaign_name="c1"):
    return MetricsRow(
        platform=platform,
        campaign_id=campaign_id,
        campaign_name=campaign_name,
        spend=spend,
        clicks=clicks,
        impressions=impressions,
        conversions=conversions,
        conversion_value=conversion_value,
    )


def test_summarize_empty():
    s = summarize([])
    assert s.spend == 0
    assert s.clicks == 0
    assert s.cpc is None
    assert s.ctr is None
    assert s.roas is None


def test_summarize_single_row():
    s = summarize([row(spend=100.0, clicks=50, impressions=1000, conversions=5, conversion_value=250.0)])
    assert s.spend == 100.0
    assert s.clicks == 50
    assert s.impressions == 1000
    assert s.conversions == 5
    assert s.conversion_value == 250.0
    assert s.cpc == 2.0
    assert s.ctr == 0.05
    assert s.roas == 2.5


def test_summarize_multiple_rows_sums_correctly():
    rows = [
        row(spend=100.0, clicks=50, impressions=1000, conversions=5, conversion_value=250.0),
        row(spend=50.0, clicks=25, impressions=500, conversions=2, conversion_value=100.0, campaign_id="2"),
    ]
    s = summarize(rows)
    assert s.spend == 150.0
    assert s.clicks == 75
    assert s.impressions == 1500
    assert s.conversions == 7
    assert s.conversion_value == 350.0


def test_summarize_zero_clicks_gives_none_cpc():
    s = summarize([row(spend=100.0, clicks=0, impressions=1000)])
    assert s.cpc is None
    assert s.ctr == 0.0


def test_summarize_zero_impressions_gives_none_ctr():
    s = summarize([row(spend=100.0, clicks=0, impressions=0)])
    assert s.ctr is None


def test_summarize_zero_spend_gives_none_roas():
    s = summarize([row(spend=0.0, conversion_value=100.0)])
    assert s.roas is None


def test_summarize_by_platform_splits_correctly():
    rows = [
        row(platform="google", spend=100.0, clicks=50, campaign_id="g1"),
        row(platform="meta", spend=40.0, clicks=20, campaign_id="m1"),
        row(platform="google", spend=60.0, clicks=30, campaign_id="g2"),
    ]
    result = summarize_by_platform(rows)
    assert set(result.keys()) == {"google", "meta"}
    assert result["google"].spend == 160.0
    assert result["google"].clicks == 80
    assert result["meta"].spend == 40.0
    assert result["meta"].clicks == 20


def test_summarize_by_platform_empty_input():
    assert summarize_by_platform([]) == {}
