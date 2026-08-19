import pytest

from agent import known_queries as kq

# The exact 24 example questions this catalog was built from, paired with the
# catalog id each one must resolve to. This is the primary regression guard:
# if a matcher tweak ever silently stops recognizing one of these, this list
# catches it immediately rather than relying on someone noticing slow
# responses in production.
EXAMPLE_QUESTIONS = [
    ("tell me the spends of google for yesterday where campaign name contains RPSME, and brand.", "g_yesterday_rpsme_brand_spend"),
    ("tell me the spends of google for yesterday where campaign name contains Rize.", "g_yesterday_rize_spend"),
    ("tell me the spends of Meta for yesterday where campaign name contains Rize.", "m_yesterday_rize_spend"),
    ("tell me the spends of Meta for yesterday where campaign name contains Rpbrand.", "m_yesterday_rpbrand_spend"),
    ("tell me the spends of Meta for yesterday where campaign name contains Rbranding.", "m_yesterday_rbranding_spend"),
    ("Compare the spends of google campaigns from month till date of this month with the same duration of previous month, where campaign name contains RPSME, and Brand", "g_cmp_rpsme_brand_spend"),
    ("Compare the spends of meta campaigns from month till date of this month with the same duration of previous month, where campaign name contains Rbranding", "m_cmp_rbranding_spend"),
    ("tell me the spends of google for last 7 days where campaign name contains RPSME, and brand.", "g_last7_rpsme_brand_spend"),
    ("tell me the spends of google for last 7 days where campaign name contains Rize", "g_last7_rize_spend"),
    ("tell me the spends of meta for last 7 days where campaign name contains Rize", "m_last7_rize_spend"),
    ("tell me the spends of meta for last 7 days where campaign name contains Rpbrand", "m_last7_rpbrand_spend"),
    ("tell me the spends of meta for last 7 days where campaign name contains Rbranding", "m_last7_rbranding_spend"),
    ("Compare the spends of google campaigns from month till date of this month with the same duration of previous month, where campaign name contains Rize", "g_cmp_rize_spend"),
    ("Compare the spends of meta campaigns from month till date of this month with the same duration of previous month, where campaign name contains Rpbrand", "m_cmp_rpbrand_spend"),
    ("tell me the spends of google for month till date where campaign name contains RPSME, and brand.", "g_mtd_rpsme_brand_spend"),
    ("tell me the spends of google for month till date where campaign name contains Rize", "g_mtd_rize_spend"),
    ("tell me the spends of meta for month till date where campaign name contains Rize", "m_mtd_rize_spend"),
    ("tell me the spends of meta for month till date where campaign name contains Rpbrand", "m_mtd_rpbrand_spend"),
    ("tell me the spends of meta for month till date where campaign name contains Rbranding", "m_mtd_rbranding_spend"),
    ("Compare the spends of meta campaigns from month till date of this month with the same duration of previous month, where campaign name contains Rize", "m_cmp_rize_spend"),
    ("Compare the spends of meta campaigns from month till date of this month with the same duration of previous month, where campaign name contains Rpsme", "m_cmp_rpsme_spend"),
    ("tell me the avg cpc of google search campaigns, where campaign name contains RPSME, and brand", "g_cpc_rpsme_brand_search"),
    ("tell me the avg cpc of google search campaigns, where campaign name contains Rize", "g_cpc_rize_search"),
    ("tell me improvement in the avg cpc of google search campaigns from July to august month till date comparison, where campaign name contains RPSME and brand", "g_cpc_cmp_rpsme_brand_search"),
]


@pytest.mark.parametrize("question,expected_id", EXAMPLE_QUESTIONS)
def test_example_questions_match_expected_catalog_entry(question, expected_id):
    result = kq.match(question)
    assert result is not None, f"expected a match for: {question!r}"
    assert result.id == expected_id


def test_all_24_catalog_entries_are_reachable():
    """Every catalog entry must be hit by at least one of the example
    questions above — an entry nothing can ever match is dead weight (or a
    sign the catalog and the matcher have drifted apart)."""
    matched_ids = {kq.match(q).id for q, _ in EXAMPLE_QUESTIONS if kq.match(q) is not None}
    all_ids = {q.id for q in kq.KNOWN_QUERIES}
    assert matched_ids == all_ids


def test_catalog_has_no_duplicate_keys():
    """Two catalog entries resolving to the same structured key would make
    match() non-deterministic (whichever happened to be inserted last wins
    silently) — the dict comprehension in known_queries.py would already
    have collapsed them, so this catches it explicitly instead of silently."""
    assert len(kq._BY_KEY) == len(kq.KNOWN_QUERIES)


# --- Negative / safety cases: match() must fail closed, never guess. ---


def test_unrelated_question_does_not_match():
    assert kq.match("What's the weather like today?") is None
    assert kq.match("How much did we spend this week?") is None  # no campaign filter at all


def test_ambiguous_platform_does_not_match():
    assert kq.match("tell me the spend for yesterday where campaign name contains Rize") is None


def test_both_platforms_mentioned_does_not_match():
    assert kq.match(
        "tell me the spends of google and meta for yesterday where campaign name contains Rize"
    ) is None


def test_unknown_campaign_filter_token_does_not_match():
    assert kq.match(
        "tell me the spends of google for yesterday where campaign name contains Nonexistent"
    ) is None


def test_known_filter_with_wrong_platform_does_not_match():
    # Rpbrand is only a real catalog entry for meta, not google.
    assert kq.match(
        "tell me the spends of google for yesterday where campaign name contains Rpbrand"
    ) is None


def test_known_filter_with_wrong_date_range_does_not_match():
    # RPSME+brand yesterday exists for google, but not "last 30 days".
    assert kq.match(
        "tell me the spends of google for last 30 days where campaign name contains RPSME, and brand"
    ) is None


def test_case_insensitive_matching():
    lower = kq.match("tell me the SPENDS of GOOGLE for YESTERDAY where campaign name contains rize")
    upper = kq.match("TELL ME THE SPENDS OF GOOGLE FOR YESTERDAY WHERE CAMPAIGN NAME CONTAINS RIZE")
    assert lower is not None and lower.id == "g_yesterday_rize_spend"
    assert upper is not None and upper.id == "g_yesterday_rize_spend"


def test_rbranding_and_brand_tokens_do_not_collide():
    """'Rbranding' must tokenize as its own word, never as a partial match
    for the separate 'brand' filter token — these are two different real
    campaign-name substrings."""
    rbranding_match = kq.match(
        "tell me the spends of meta for yesterday where campaign name contains Rbranding"
    )
    assert rbranding_match is not None
    assert rbranding_match.name_contains == ("rbranding",)


def test_rpsme_alone_is_distinct_from_rpsme_and_brand():
    alone = kq.match(
        "Compare the spends of meta campaigns from month till date of this month with the "
        "same duration of previous month, where campaign name contains Rpsme"
    )
    combined = kq.match(
        "Compare the spends of google campaigns from month till date of this month with the "
        "same duration of previous month, where campaign name contains RPSME, and Brand"
    )
    assert alone is not None and alone.name_contains == ("rpsme",)
    assert combined is not None and set(combined.name_contains) == {"rpsme", "brand"}


def test_avg_cpc_without_stated_date_range_defaults_to_mtd():
    m = kq.match("tell me the avg cpc of google search campaigns, where campaign name contains Rize")
    assert m is not None
    assert m.date_kind == "mtd"
    assert m.channel_type == "SEARCH"


def test_spend_without_stated_date_range_does_not_match():
    """Unlike avg_cpc, none of the catalog's spend questions omit a date
    range — a spend question with no recognizable date phrase must not
    silently default to anything."""
    assert kq.match(
        "tell me the spends of google where campaign name contains Rize"
    ) is None
