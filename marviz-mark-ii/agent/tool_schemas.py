LIST_CAMPAIGNS = {
    "name": "list_campaigns",
    "description": "List campaigns for a given ad platform, with their id, name, and status.",
    "input_schema": {
        "type": "object",
        "properties": {
            "platform": {
                "type": "string",
                "enum": ["google", "meta"],
                "description": "Which ad platform to list campaigns for.",
            },
        },
        "required": ["platform"],
    },
}

GET_METRICS = {
    "name": "get_metrics",
    "description": (
        "Get spend, clicks, impressions, conversions, and conversion value for a "
        "platform, optionally scoped to one campaign, over a date range. If the user's "
        "question names or describes specific campaigns (e.g. 'campaigns containing X', "
        "'search campaigns', 'brand campaigns'), you MUST pass name_contains and/or "
        "channel_type to actually filter — never answer from memory or by guessing which "
        "campaigns match. The response includes matched_campaign_count and the list of "
        "matched campaigns so you can confirm the filter actually matched something before "
        "answering; if matched_campaign_count is 0, tell the user nothing matched instead "
        "of making up a number."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "platform": {
                "type": "string",
                "enum": ["google", "meta"],
                "description": "Which ad platform to query.",
            },
            "campaign_id": {
                "type": "string",
                "description": "Optional campaign id to scope the query to. Omit for account-wide metrics.",
            },
            "date_range": {
                "type": "string",
                "description": (
                    "Date range for the query. Use one of: today, yesterday, last_7d, "
                    "last_30d. Defaults to last_7d if omitted. Ignored if start_date and "
                    "end_date are both given."
                ),
            },
            "start_date": {
                "type": "string",
                "description": (
                    "YYYY-MM-DD. Use together with end_date for ranges date_range can't "
                    "express — e.g. month-to-date ('the 1st of this month' as start_date, "
                    "today as end_date), or a specific prior-month window for a "
                    "month-over-month comparison. Omit for the fixed date_range literals."
                ),
            },
            "end_date": {
                "type": "string",
                "description": "YYYY-MM-DD. Required alongside start_date, ignored otherwise.",
            },
            "name_contains": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Only include campaigns whose name contains ALL of these substrings "
                    "(case-insensitive AND match). E.g. the user says 'campaigns with rpsme "
                    "and brand in the name' -> name_contains=['rpsme', 'brand']. Use this "
                    "whenever the user says 'contains', 'with X in the name', names a "
                    "specific campaign family, or otherwise describes campaigns by name."
                ),
            },
            "channel_type": {
                "type": "string",
                "enum": [
                    "SEARCH", "DISPLAY", "SHOPPING", "VIDEO", "MULTI_CHANNEL", "LOCAL",
                    "SMART", "PERFORMANCE_MAX", "LOCAL_SERVICES", "DISCOVERY", "DEMAND_GEN",
                    "TRAVEL", "HOTEL",
                ],
                "description": (
                    "Google Ads only (omit for platform='meta', which has no equivalent). "
                    "Filter to campaigns of this advertising channel type — e.g. the user "
                    "says 'search campaigns' -> channel_type='SEARCH'."
                ),
            },
        },
        "required": ["platform"],
    },
}

GET_AGGREGATE_SUMMARY = {
    "name": "get_aggregate_summary",
    "description": (
        "Get a combined spend/clicks/CPC/CTR/ROAS summary across one or more platforms "
        "for a date range. Use this when the user asks for a cross-platform total or "
        "comparison. If the user's question names or describes specific campaigns, you "
        "MUST pass name_contains and/or channel_type to actually filter — never answer "
        "from memory or by guessing which campaigns match. The response includes "
        "matched_campaign_count and matched_campaign_names so you can confirm the filter "
        "actually matched something before answering; if matched_campaign_count is 0, tell "
        "the user nothing matched instead of making up a number."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "platforms": {
                "type": "array",
                "items": {"type": "string", "enum": ["google", "meta"]},
                "description": "Which platforms to include. Include both for a combined total.",
            },
            "date_range": {
                "type": "string",
                "description": (
                    "Date range: today, yesterday, last_7d, or last_30d. Defaults to "
                    "last_7d. Ignored if start_date and end_date are both given."
                ),
            },
            "start_date": {
                "type": "string",
                "description": (
                    "YYYY-MM-DD. Use together with end_date for ranges date_range can't "
                    "express — e.g. month-to-date, or a specific prior-month window for a "
                    "month-over-month comparison (call this tool twice, once per window, "
                    "and compare the two results yourself)."
                ),
            },
            "end_date": {
                "type": "string",
                "description": "YYYY-MM-DD. Required alongside start_date, ignored otherwise.",
            },
            "name_contains": {
                "type": "array",
                "items": {"type": "string"},
                "description": (
                    "Only include campaigns whose name contains ALL of these substrings "
                    "(case-insensitive AND match). E.g. 'campaigns with rpsme and brand in "
                    "the name' -> name_contains=['rpsme', 'brand']."
                ),
            },
            "channel_type": {
                "type": "string",
                "enum": [
                    "SEARCH", "DISPLAY", "SHOPPING", "VIDEO", "MULTI_CHANNEL", "LOCAL",
                    "SMART", "PERFORMANCE_MAX", "LOCAL_SERVICES", "DISCOVERY", "DEMAND_GEN",
                    "TRAVEL", "HOTEL",
                ],
                "description": (
                    "Google Ads only — ignored/invalid for a request that includes "
                    "platform='meta'. Filter to campaigns of this advertising channel type."
                ),
            },
        },
        "required": ["platforms"],
    },
}

PROPOSE_ACTION = {
    "name": "propose_action",
    "description": (
        "Stage a write action (pausing/enabling a campaign, or changing its daily "
        "budget) for user confirmation. This does NOT execute the action — it only "
        "proposes it and returns a confirmation prompt. You must relay that prompt "
        "to the user and wait for their explicit yes/no before calling "
        "confirm_and_execute_action. Never call confirm_and_execute_action in the "
        "same turn as propose_action."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action_type": {
                "type": "string",
                "enum": ["pause_campaign", "enable_campaign", "update_budget"],
            },
            "platform": {"type": "string", "enum": ["google", "meta"]},
            "campaign_id": {"type": "string"},
            "campaign_name": {
                "type": "string",
                "description": "Human-readable campaign name, for the confirmation prompt.",
            },
            "daily_budget_amount": {
                "type": "number",
                "description": "Required only when action_type is update_budget. New daily budget in account currency major units (e.g. dollars).",
            },
        },
        "required": ["action_type", "platform", "campaign_id", "campaign_name"],
    },
}

CONFIRM_AND_EXECUTE_ACTION = {
    "name": "confirm_and_execute_action",
    "description": (
        "Execute a previously proposed action, but ONLY after the user has given "
        "explicit affirmative confirmation in their most recent message. If the "
        "user has not clearly confirmed, do not call this tool — ask them again "
        "instead. The system will independently verify the user actually confirmed "
        "before this executes anything; calling it prematurely will simply fail."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "pending_action_id": {"type": "string"},
        },
        "required": ["pending_action_id"],
    },
}

CANCEL_PENDING_ACTION = {
    "name": "cancel_pending_action",
    "description": "Cancel a previously proposed action because the user declined or changed their mind.",
    "input_schema": {
        "type": "object",
        "properties": {
            "pending_action_id": {"type": "string"},
        },
        "required": ["pending_action_id"],
    },
}

WRITE_TOOLS = [PROPOSE_ACTION, CONFIRM_AND_EXECUTE_ACTION, CANCEL_PENDING_ACTION]

READ_TOOLS = [LIST_CAMPAIGNS, GET_METRICS, GET_AGGREGATE_SUMMARY]

ALL = list(READ_TOOLS) + list(WRITE_TOOLS)
