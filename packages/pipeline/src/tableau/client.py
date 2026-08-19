"""Tableau Cloud REST API client."""

import tableauserverclient as TSC
from ..config import TableauConfig


def get_tableau_client() -> tuple[TSC.Server, TSC.PersonalAccessTokenAuth]:
    """Create Tableau Cloud connection using PAT."""
    tableau_auth = TSC.PersonalAccessTokenAuth(
        token_name=TableauConfig.pat_name,
        personal_access_token=TableauConfig.pat_secret,
        site_id=TableauConfig.site_id,
    )
    server = TSC.Server(TableauConfig.server_url, use_server_version=True)
    return server, tableau_auth
