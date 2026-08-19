"""Meta Ads API client for fetching campaign performance data."""

import os
import requests
from typing import Optional

API_VERSION = "v22.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"


def get_meta_access_token() -> str:
    token_file = os.getenv("META_ADS_TOKEN_FILE")
    if token_file and os.path.exists(token_file):
        with open(token_file) as f:
            return f.read().strip()
    token = os.getenv("META_ADS_ACCESS_TOKEN", "")
    if not token:
        raise ValueError("META_ADS_ACCESS_TOKEN or META_ADS_TOKEN_FILE must be set")
    return token


def get_ad_account_id() -> str:
    return os.getenv("META_ADS_ACCOUNT_ID", "act_2610976695640512")


def meta_api_get(endpoint: str, params: Optional[dict] = None) -> dict:
    token = get_meta_access_token()
    params = params or {}
    params["access_token"] = token
    url = f"{BASE_URL}/{endpoint}"
    resp = requests.get(url, params=params)
    resp.raise_for_status()
    return resp.json()


def paginate_all(endpoint: str, params: Optional[dict] = None) -> list:
    """Fetch all pages of a paginated Meta API response."""
    token = get_meta_access_token()
    params = params or {}
    params["access_token"] = token
    url = f"{BASE_URL}/{endpoint}"

    all_data = []
    first = True
    while url:
        if first:
            resp = requests.get(url, params=params)
            first = False
        else:
            # paging.next already has all params baked in
            resp = requests.get(url)
        if resp.status_code == 403:
            # Retry without filtering if it's a permissions issue with combined params
            if "filtering" in params:
                params.pop("filtering")
                resp = requests.get(f"{BASE_URL}/{endpoint}", params=params)
        resp.raise_for_status()
        result = resp.json()
        all_data.extend(result.get("data", []))
        url = result.get("paging", {}).get("next")
    return all_data
