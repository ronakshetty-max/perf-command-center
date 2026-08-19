#!/usr/bin/env python3
"""Fetch live Google Ads signals and output as JSON.
Called by the Next.js agent API to provide real-time context.
Caches results for 30 minutes to avoid hammering the API.
"""

import json
import os
import sys
import time
from pathlib import Path

# Add the package to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

CACHE_FILE = Path(__file__).parent / ".signals_cache.json"
CACHE_TTL = 1800  # 30 minutes


def fetch_fresh_signals():
    """Fetch all signals from Google Ads API."""
    from src.google_ads.client import get_google_ads_client
    from src.google_ads.fetch_signals import fetch_all_signals
    from src.config import GoogleAdsConfig

    client = get_google_ads_client()
    customer_id = GoogleAdsConfig.customer_ids[0]

    signals = fetch_all_signals(client, customer_id)
    return signals


def get_signals():
    """Get signals from cache or fetch fresh."""
    # Check cache
    if CACHE_FILE.exists():
        cache_age = time.time() - CACHE_FILE.stat().st_mtime
        if cache_age < CACHE_TTL:
            with open(CACHE_FILE) as f:
                return json.load(f)

    # Fetch fresh
    try:
        signals = fetch_fresh_signals()
        # Write cache
        with open(CACHE_FILE, "w") as f:
            json.dump(signals, f)
        return signals
    except Exception as e:
        # If fetch fails but cache exists (even stale), use it
        if CACHE_FILE.exists():
            with open(CACHE_FILE) as f:
                return json.load(f)
        return {"error": str(e)}


if __name__ == "__main__":
    force_refresh = "--refresh" in sys.argv
    if force_refresh and CACHE_FILE.exists():
        CACHE_FILE.unlink()

    signals = get_signals()
    print(json.dumps(signals))
