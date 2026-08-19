"""Run this script to generate a Google Ads API refresh token.
It will open your browser — log in with the Google account that has access to your Google Ads."""

from google_auth_oauthlib.flow import InstalledAppFlow
import os

CLIENT_CONFIG = {
    "installed": {
        "client_id": os.environ.get("GOOGLE_ADS_CLIENT_ID", "YOUR_CLIENT_ID"),
        "client_secret": os.environ.get("GOOGLE_ADS_CLIENT_SECRET", "YOUR_CLIENT_SECRET"),
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": ["http://localhost:8080"],
    }
}

SCOPES = ["https://www.googleapis.com/auth/adwords"]

flow = InstalledAppFlow.from_client_config(CLIENT_CONFIG, scopes=SCOPES)
credentials = flow.run_local_server(port=8080)

print("\n" + "=" * 60)
print("YOUR REFRESH TOKEN (copy this):")
print("=" * 60)
print(credentials.refresh_token)
print("=" * 60)
