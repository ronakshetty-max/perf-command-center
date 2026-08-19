from agent import fast_path


def test_plain_spend_question_matches():
    m = fast_path.match("How much did we spend this week?")
    assert m is not None
    assert m.intent == "spend"
    assert m.date_range == "last_7d"


def test_plain_roas_question_matches():
    m = fast_path.match("What's my ROAS?")
    assert m is not None
    assert m.intent == "roas"


def test_list_campaigns_matches():
    m = fast_path.match("List my active campaigns.")
    assert m is not None
    assert m.intent == "list_campaigns"


def test_date_range_variants_resolve_correctly():
    assert fast_path.match("What did we spend today?").date_range == "today"
    assert fast_path.match("What did we spend yesterday?").date_range == "yesterday"
    assert fast_path.match("What did we spend in the last 30 days?").date_range == "last_30d"
    assert fast_path.match("What did we spend this month?").date_range == "last_30d"
    assert fast_path.match("How much did we spend?").date_range == "last_7d"


def test_filtered_query_never_matches_even_with_matching_intent_words():
    """The single most important property of this module: any hint of a
    filter (campaign name, channel type, specific campaign) must bypass the
    fast path entirely, even though the query also contains the word 'spend'
    or 'ROAS'. A false match here would silently drop the user's filter and
    return an account-wide number instead of what they asked for."""
    assert fast_path.match("How much did we spend on search campaigns?") is None
    assert fast_path.match("What's my ROAS on campaigns containing brand?") is None
    assert fast_path.match("How much did we spend on campaigns with rpsme in the name?") is None
    assert fast_path.match("What's the ROAS for campaign 12345?") is None
    assert fast_path.match("Compare spend between google and meta") is None


def test_unrelated_query_does_not_match():
    assert fast_path.match("Can you pause campaign 123?") is None
    assert fast_path.match("What's the weather like?") is None
    assert fast_path.match("") is None


def test_list_campaigns_with_filter_word_does_not_match():
    assert fast_path.match("List campaigns containing brand") is None
    assert fast_path.match("Show me only search campaigns") is None


def test_query_with_any_digits_never_matches():
    """Digits almost always mean a specific campaign ID — never fast-path,
    even if the phrasing otherwise looks like a plain spend/ROAS question."""
    assert fast_path.match("What's the spend for 12345?") is None
    assert fast_path.match("How much did campaign 987654321 spend?") is None


def test_realistic_conversational_phrasings_still_match():
    """Sanity check against phrasings a real voice user would actually say,
    not just the canonical form — this is what actually matters for the
    latency win to be worth anything."""
    assert fast_path.match("what did we spend").intent == "spend"
    assert fast_path.match("what's our total spend").intent == "spend"
    assert fast_path.match("how much have we spent").intent == "spend"
    assert fast_path.match("what's our roas looking like").intent == "roas"
    assert fast_path.match("show me all campaigns").intent == "list_campaigns"
