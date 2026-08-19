import os
from dotenv import load_dotenv

load_dotenv()


class GoogleAdsConfig:
    developer_token = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN")
    client_id = os.getenv("GOOGLE_ADS_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_ADS_CLIENT_SECRET")
    refresh_token = os.getenv("GOOGLE_ADS_REFRESH_TOKEN")
    login_customer_id = os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
    customer_ids = [
        cid.strip()
        for cid in os.getenv("GOOGLE_ADS_CUSTOMER_IDS", "").split(",")
        if cid.strip()
    ]


class TableauConfig:
    server_url = os.getenv("TABLEAU_SERVER_URL")
    site_id = os.getenv("TABLEAU_SITE_ID")
    pat_name = os.getenv("TABLEAU_PAT_NAME")
    pat_secret = os.getenv("TABLEAU_PAT_SECRET")
    view_ids = {
        "rize_leads": os.getenv("TABLEAU_VIEW_ID_RIZE_LEADS"),
        "rize_payments": os.getenv("TABLEAU_VIEW_ID_RIZE_PAYMENTS"),
        "curlec_funnel": os.getenv("TABLEAU_VIEW_ID_CURLEC_FUNNEL"),
    }


class SupabaseConfig:
    url = os.getenv("SUPABASE_URL")
    anon_key = os.getenv("SUPABASE_ANON_KEY")
    service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    database_url = os.getenv("DATABASE_URL")


BUSINESS_CONFIG = {
    "rize": {
        "name": "Rize",
        "currency": "INR",
        "primary_conversion": "payment",
        "funnel_stages": ["lead", "payment"],
        "cpp_cap": 2700,
    },
    "curlec": {
        "name": "Curlec",
        "currency": "MYR",
        "primary_conversion": "mtu",
        "funnel_stages": ["signup", "l2", "activated", "mtu"],
        "cpp_cap": None,
    },
}

ACCOUNT_MAPPING = {
    # Google Ads Customer ID → account info
    # Fill in actual IDs
    "RAZORPAY_PERF_ID": {
        "name": "Razorpay Performance",
        "businesses": ["rize", "crossborder"],
    },
    "CURLEC_ID": {
        "name": "Curlec",
        "businesses": ["curlec"],
    },
}
