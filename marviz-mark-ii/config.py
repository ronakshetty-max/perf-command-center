from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load order: shared org-wide credentials first, then this project's own .env
# overrides anything project-specific (Anthropic, Google Ads OAuth, Meta app,
# OpenAI). Keys present in both (e.g. a future shared ANTHROPIC_API_KEY) will
# take the marviz2/.env value.
load_dotenv(Path.home() / ".claude" / ".env")
load_dotenv(Path(__file__).parent / ".env", override=True)


class ConfigError(Exception):
    pass


def _get(name: str, default: str | None = None) -> str | None:
    # An env var present but blank (e.g. "FOO=" in a .env file) must fall back
    # to `default` too — os.environ.get's own default only applies when the
    # var is absent entirely, not when it's set to an empty string.
    val = os.environ.get(name)
    if val is None or val.strip() == "":
        return default
    return val.strip()


def _get_bool(name: str, default: bool) -> bool:
    val = _get(name)
    if val is None:
        return default
    return val.lower() in ("1", "true", "yes", "on")


def _get_int(name: str, default: int) -> int:
    val = _get(name)
    if val is None:
        return default
    return int(val)


@dataclass
class Settings:
    anthropic_api_key: str | None
    anthropic_model: str

    gemini_api_key: str | None
    gemini_transcription_model: str

    google_ads_developer_token: str
    google_ads_client_id: str
    google_ads_client_secret: str
    google_ads_refresh_token: str
    google_ads_login_customer_id: str | None
    google_ads_customer_id: str

    meta_app_id: str
    meta_app_secret: str
    meta_access_token: str
    meta_access_token_is_fallback: bool
    meta_ad_account_id: str

    write_actions_enabled: bool
    confirmation_timeout_seconds: int
    max_tool_iterations: int
    known_query_refresh_seconds: int

    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def load_settings(require_anthropic: bool = False, require_google_stt: bool = False) -> Settings:
    errors: list[str] = []
    warnings: list[str] = []

    def required(name: str) -> str:
        val = _get(name)
        if not val:
            errors.append(f"Missing required env var: {name}")
        return val or ""

    anthropic_api_key = _get("ANTHROPIC_API_KEY")
    if require_anthropic and not anthropic_api_key:
        errors.append("Missing required env var: ANTHROPIC_API_KEY")

    # GEMINI_API_KEY powers voice transcription (Gemini), in place of the old
    # OpenAI Whisper integration — see stt/gemini_client.py. Deliberately a
    # separate var from GOOGLE_API_KEY (used for Sheets/other Google APIs
    # elsewhere) — that key was tried and rejected by the Gemini API
    # (API_KEY_INVALID), and the two keys may not always be interchangeable.
    gemini_api_key = _get("GEMINI_API_KEY")
    if require_google_stt and not gemini_api_key:
        errors.append("Missing required env var: GEMINI_API_KEY")

    google_ads_customer_id = required("GOOGLE_ADS_CUSTOMER_ID")
    if google_ads_customer_id and not re.fullmatch(r"\d+", google_ads_customer_id):
        errors.append(
            "GOOGLE_ADS_CUSTOMER_ID must be digits only, no dashes "
            f"(got: {google_ads_customer_id!r})"
        )

    meta_ad_account_id = required("META_AD_ACCOUNT_ID")
    if meta_ad_account_id and not re.fullmatch(r"act_\d+", meta_ad_account_id):
        errors.append(
            "META_AD_ACCOUNT_ID must be in the form 'act_<digits>' "
            f"(got: {meta_ad_account_id!r})"
        )

    # META_ACCESS_TOKEN is the properly-scoped Marketing API token this app needs.
    # META_API_TOKEN (from ~/.claude/.env) is a generic Graph API token of unknown
    # scope, kept only as a scaffolding fallback so read calls can be tried before
    # a real token is issued. It may lack the permissions write actions require.
    meta_access_token = _get("META_ACCESS_TOKEN")
    meta_access_token_is_fallback = False
    if not meta_access_token:
        fallback = _get("META_API_TOKEN")
        if fallback:
            meta_access_token = fallback
            meta_access_token_is_fallback = True
            warnings.append(
                "META_ACCESS_TOKEN is not set; falling back to META_API_TOKEN. "
                "This token's scope is unverified — it may not support Marketing "
                "API write actions (pause/enable/budget). Set META_ACCESS_TOKEN "
                "with a properly-scoped (ideally System User) token before "
                "relying on write actions."
            )
        else:
            errors.append("Missing required env var: META_ACCESS_TOKEN")

    settings = Settings(
        anthropic_api_key=anthropic_api_key,
        anthropic_model=_get("ANTHROPIC_MODEL", "claude-sonnet-5"),
        gemini_api_key=gemini_api_key,
        gemini_transcription_model=_get("GEMINI_TRANSCRIPTION_MODEL", "gemini-3.6-flash"),
        google_ads_developer_token=required("GOOGLE_ADS_DEVELOPER_TOKEN"),
        google_ads_client_id=required("GOOGLE_ADS_CLIENT_ID"),
        google_ads_client_secret=required("GOOGLE_ADS_CLIENT_SECRET"),
        google_ads_refresh_token=required("GOOGLE_ADS_REFRESH_TOKEN"),
        google_ads_login_customer_id=_get("GOOGLE_ADS_LOGIN_CUSTOMER_ID"),
        google_ads_customer_id=google_ads_customer_id,
        meta_app_id=required("META_APP_ID"),
        meta_app_secret=required("META_APP_SECRET"),
        meta_access_token=meta_access_token or "",
        meta_access_token_is_fallback=meta_access_token_is_fallback,
        meta_ad_account_id=meta_ad_account_id,
        write_actions_enabled=_get_bool("WRITE_ACTIONS_ENABLED", False),
        confirmation_timeout_seconds=_get_int("CONFIRMATION_TIMEOUT_SECONDS", 30),
        max_tool_iterations=_get_int("MAX_TOOL_ITERATIONS", 8),
        # How often the background task in app.py recomputes the fixed known-question
        # cache (agent/known_query_cache.py). Default 15 minutes.
        known_query_refresh_seconds=_get_int("KNOWN_QUERY_REFRESH_SECONDS", 900),
        errors=errors,
        warnings=warnings,
    )

    if errors:
        raise ConfigError(
            "Invalid configuration:\n" + "\n".join(f"  - {e}" for e in errors)
        )

    for w in warnings:
        print(f"[config] WARNING: {w}")

    return settings
