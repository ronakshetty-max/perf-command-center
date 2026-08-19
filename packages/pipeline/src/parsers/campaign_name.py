"""
Campaign Name Parser v3

BUSINESS RULES:
  - Contains "RZPX" (case-insensitive) → SKIP (not tracked)
  - Contains "CURLEC" → curlec
  - Contains "RPIPC" → crossborder
  - Contains "RIZE" → rize
  - Contains "RPBRAND" → eb (tofu campaigns)
  - Contains "RPHQL" or "RPSME" → eb

CATEGORY RULES (for Rize, Crossborder, Curlec):
  - Contains "Brand" → brand
  - Contains "Generic" → generic
  - Contains "Comp" → competitor
  - Contains "Pmax" → pmax
  - Contains "IncorpTypes" or "StartUp" → high_intent

CATEGORY RULES (for EB — keyword/channel based):
  - Contains "Brand" → brand
  - Contains "Comp" → competitor
  - Contains "Pmax" → pmax
  - RPbrand prefix → tofu
  - Contains "PG-Core" or "PG_Core" → core
  - Contains "Accept-Payment" or "Accept_Payment" → accept_payments
  - Contains "DemandGen" → demandgen
  - Contains "PL-" or "PL_" → payment_links
  - Contains "YT" or "YouTube" → youtube
  - Contains "GUAC" or "App" → app
  - Contains "HQL" → hql
  - Otherwise → other
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class ParsedCampaign:
    business: str
    platform: str
    category: str
    sub_category: Optional[str] = None
    device_target: str = "all"
    audience_type: Optional[str] = None
    objective: Optional[str] = None
    geo: str = "India"
    skip: bool = False


def parse_campaign_name(campaign_name: str) -> ParsedCampaign:
    """Parse a campaign name into structured fields."""
    name = campaign_name.strip()
    name_upper = name.upper()

    # Skip RZPx campaigns
    if "RZPX" in name_upper:
        return ParsedCampaign(
            business="skip", platform="google_search", category="skip", skip=True
        )

    business = _detect_business(name_upper)
    platform = _detect_platform(name_upper)

    if business == "eb":
        category = _detect_eb_category(name_upper)
    else:
        category = _detect_category(name_upper, platform)

    sub_category = _detect_sub_category(name, name_upper, category)
    device_target = _detect_device(name_upper)
    audience_type = _detect_audience(name)
    objective = _detect_objective(name)
    geo = _detect_geo(name_upper)

    return ParsedCampaign(
        business=business,
        platform=platform,
        category=category,
        sub_category=sub_category,
        device_target=device_target,
        audience_type=audience_type,
        objective=objective,
        geo=geo,
    )


def _detect_business(name_upper: str) -> str:
    """Detect business. Order matters — most specific first."""
    if "CURLEC" in name_upper:
        return "curlec"
    if "RPIPC" in name_upper:
        return "crossborder"
    if "RIZE" in name_upper:
        return "rize"
    if "RPBRAND" in name_upper:
        return "eb"
    if "RPHQL" in name_upper:
        return "eb"
    if "RPSME" in name_upper:
        return "eb"
    return "unknown"


def _detect_category(name_upper: str, platform: str) -> str:
    """Category for Rize, Crossborder, Curlec."""
    if "PMAX" in name_upper:
        return "pmax"
    if "BRAND" in name_upper:
        return "brand"
    if "COMP" in name_upper:
        return "competitor"
    if "GENERIC" in name_upper:
        return "generic"
    if "INCORPTYPES" in name_upper or "STARTUP" in name_upper:
        return "high_intent"
    if platform == "meta":
        return "retargeting"
    return "uncategorized"


def _detect_eb_category(name_upper: str) -> str:
    """Category for EB campaigns — keyword/channel based."""
    # Check standard ones first
    if "PMAX" in name_upper:
        return "pmax"
    if "COMP" in name_upper:
        return "competitor"

    # RPbrand prefix = TOFU
    if "RPBRAND" in name_upper:
        return "tofu"

    # Brand (explicit)
    if "BRAND" in name_upper and "RPBRAND" not in name_upper:
        return "brand"

    # Channel/keyword based
    if "DEMANDGEN" in name_upper:
        return "demandgen"
    if "YT-" in name_upper or "YOUTUBE" in name_upper:
        return "youtube"
    if "GUAC" in name_upper or "APPSFLYER" in name_upper:
        return "app"

    # Keyword type
    if "PG-CORE" in name_upper or "PG_CORE" in name_upper:
        return "core"
    if "ACCEPT" in name_upper and "PAYMENT" in name_upper:
        return "accept_payments"
    if "PL-" in name_upper or "PL_" in name_upper:
        return "payment_links"
    if "HQL" in name_upper:
        return "hql"

    # Broad/generic keyword patterns
    if "BROAD" in name_upper:
        return "generic"
    if "GENERIC" in name_upper:
        return "generic"

    return "other"


def _detect_platform(name_upper: str) -> str:
    """Detect advertising platform."""
    if "META" in name_upper or "FACEBOOK" in name_upper:
        return "meta"
    if "PMAX" in name_upper:
        return "google_pmax"
    if "DEMANDGEN" in name_upper:
        return "google_demandgen"
    if "YT" in name_upper or "YOUTUBE" in name_upper:
        return "google_youtube"
    if "GUAC" in name_upper or "APPSFLYER" in name_upper:
        return "google_app"
    if "GSEARCH" in name_upper or "GOOGLESEARCH" in name_upper:
        return "google_search"
    if "DISPLAY" in name_upper or "GDN" in name_upper:
        return "google_display"
    return "google_search"


def _detect_sub_category(name: str, name_upper: str, category: str) -> Optional[str]:
    """More specific label within category."""
    if category == "high_intent":
        if "INCORPTYPES" in name_upper:
            return "IncorpTypes"
        if "STARTUP" in name_upper:
            return "StartUp"

    if category == "generic":
        if "DWEB" in name_upper:
            return "Generic_Dweb"
        if "MWEB" in name_upper:
            return "Generic_Mweb"
        if "BROAD" in name_upper:
            return "Generic_Broad"

    if category == "core":
        if "DWEB" in name_upper:
            return "Core_Dweb"
        if "MWEB" in name_upper:
            return "Core_Mweb"

    if category == "competitor":
        for comp in ["PAYU", "PAYTM", "CASHFREE", "INDIAFILINGS", "CLEARTAX", "SHOPIFY"]:
            if comp in name_upper:
                return f"Comp_{comp.title()}"

    return None


def _detect_device(name_upper: str) -> str:
    """Detect target device."""
    if "DWEB" in name_upper or "DESKTOP" in name_upper:
        return "desktop"
    if "MWEB" in name_upper or "MOBILE" in name_upper:
        return "mobile"
    if "ALLDEVICES" in name_upper:
        return "all"
    return "all"


def _detect_audience(name: str) -> Optional[str]:
    """Detect audience type."""
    audiences = ["Int_Aud", "WebVisitors", "Open_Aud", "LAL_MTU", "LAL_Signup",
                 "Unreg_L1orL2", "LAL-ActiveHQL", "Retargeting"]
    for aud in audiences:
        if aud.lower() in name.lower():
            return aud
    return None


def _detect_objective(name: str) -> Optional[str]:
    """Detect campaign objective."""
    name_upper = name.upper()
    if "CONV" in name_upper:
        return "conversions"
    if "CLICKS" in name_upper:
        return "clicks"
    if "TRAFFIC" in name_upper:
        return "traffic"
    if "AWARENESS" in name_upper or "REACH" in name_upper:
        return "awareness"
    if "L2SUBMIT" in name_upper:
        return "l2_submit"
    return None


def _detect_geo(name_upper: str) -> str:
    """Detect geography."""
    if "MALAYSIA" in name_upper or "-MY-" in name_upper:
        return "Malaysia"
    return "India"


def normalize_campaign_name(name: str) -> str:
    """Normalize for matching between Google Ads and Tableau."""
    normalized = name.strip()
    if normalized.startswith("RRize"):
        normalized = normalized[1:]
    return normalized
