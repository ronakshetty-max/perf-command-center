"""Google Ads API client setup."""

from google.ads.googleads.client import GoogleAdsClient
from ..config import GoogleAdsConfig


def get_google_ads_client() -> GoogleAdsClient:
    """Create and return an authenticated Google Ads API client."""
    credentials = {
        "developer_token": GoogleAdsConfig.developer_token,
        "client_id": GoogleAdsConfig.client_id,
        "client_secret": GoogleAdsConfig.client_secret,
        "refresh_token": GoogleAdsConfig.refresh_token,
        "login_customer_id": GoogleAdsConfig.login_customer_id,
        "use_proto_plus": True,
    }
    return GoogleAdsClient.load_from_dict(credentials)
