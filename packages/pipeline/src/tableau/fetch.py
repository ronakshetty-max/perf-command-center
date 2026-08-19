"""Fetch backend conversion data from Tableau Cloud published views."""

import csv
import io
from datetime import date, timedelta
from typing import Optional

import tableauserverclient as TSC
from ..config import TableauConfig
from .client import get_tableau_client


def fetch_rize_leads(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    lookback_days: int = 7,
) -> list[dict]:
    """Fetch Rize lead/payment data from Tableau view.

    Expected columns: Lead Date, UTM Campaign, Device Type, Leads, Payments
    """
    if end_date is None:
        end_date = date.today() - timedelta(days=1)
    if start_date is None:
        start_date = end_date - timedelta(days=lookback_days - 1)

    view_id = TableauConfig.view_ids["rize_leads"]
    if not view_id:
        return []

    server, auth = get_tableau_client()

    rows = []
    with server.auth.sign_in(auth):
        view = server.views.get_by_id(view_id)

        # Apply date filter
        pdf_req = TSC.PDFRequestOptions()
        csv_req = TSC.CSVRequestOptions()
        # Add filter for date range
        csv_req.vf("Lead Date", f"{start_date},{end_date}")

        server.views.populate_csv(view, csv_req)
        csv_content = view.csv

        # Parse CSV
        reader = csv.DictReader(io.StringIO(csv_content.decode("utf-8")))
        for row in reader:
            rows.append(
                {
                    "business_id": "rize",
                    "date": row.get("Lead Date", ""),
                    "campaign_name_raw": row.get("UTM Campaign", ""),
                    "device": _normalize_tableau_device(
                        row.get("Device Type", "")
                    ),
                    "leads": int(row.get("Leads", 0) or 0),
                    "payments": int(row.get("Payments", 0) or 0),
                }
            )

    return rows


def fetch_curlec_funnel(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    lookback_days: int = 7,
) -> list[dict]:
    """Fetch Curlec funnel data from Tableau view.

    Expected columns: Week, Channel, UTM Campaign, Signups, L2, Activated, MTU
    """
    if end_date is None:
        end_date = date.today() - timedelta(days=1)
    if start_date is None:
        start_date = end_date - timedelta(days=lookback_days - 1)

    view_id = TableauConfig.view_ids["curlec_funnel"]
    if not view_id:
        return []

    server, auth = get_tableau_client()

    rows = []
    with server.auth.sign_in(auth):
        view = server.views.get_by_id(view_id)

        csv_req = TSC.CSVRequestOptions()
        server.views.populate_csv(view, csv_req)
        csv_content = view.csv

        reader = csv.DictReader(io.StringIO(csv_content.decode("utf-8")))
        for row in reader:
            rows.append(
                {
                    "business_id": "curlec",
                    "date": row.get("Week", ""),
                    "campaign_name_raw": row.get("UTM Campaign", row.get("Channel", "")),
                    "device": _normalize_tableau_device(
                        row.get("Device Type", "all")
                    ),
                    "signups": int(row.get("Signups", 0) or 0),
                    "l2": int(row.get("L2", 0) or 0),
                    "activated": int(row.get("Activated", 0) or 0),
                    "mtu": int(row.get("MTU", 0) or 0),
                }
            )

    return rows


def _normalize_tableau_device(device: str) -> str:
    """Normalize Tableau device strings."""
    device_lower = device.strip().lower()
    if device_lower in ("mobile", "mobile web", "android", "ios"):
        return "mobile"
    if device_lower in ("desktop", "desktop web", "web"):
        return "desktop"
    return "all"
