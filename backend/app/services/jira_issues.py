"""
Jira issues by filter ID. Uses production_atlassian secret.
"""
import logging
from typing import Any, Optional

import httpx

from app.core.secrets import get_secret

from app.core.config import settings

logger = logging.getLogger(__name__)

DEFAULT_FIELDS = ["key", "summary", "status", "assignee", "priority"]


def _get_auth() -> tuple[str, str]:
    data = get_secret(key="production_atlassian", return_value=True)
    if not data:
        raise ValueError("production_atlassian secret not found")
    username = data.get("username") or data.get("email")
    api_token = data.get("api_token")
    if not username or not api_token:
        raise ValueError("production_atlassian must have username and api_token")
    return username, api_token


def _get_filter_jql(filter_id: int) -> str:
    """Fetch filter by ID and return its JQL."""
    username, api_token = _get_auth()
    url = f"{settings.JIRA_HOST}/rest/api/3/filter/{filter_id}"
    with httpx.Client(timeout=30) as client:
        resp = client.get(url, auth=(username, api_token))
        resp.raise_for_status()
        data = resp.json()
    jql = data.get("jql")
    if not jql:
        raise ValueError(f"Filter {filter_id} has no JQL")
    return jql


def fetch_issues_by_filter_id(
    filter_id: int,
    fields: Optional[list[str]] = None,
    max_results: int = 100,
) -> list[dict[str, Any]]:
    """
    Fetch Jira issues for a filter ID.
    Uses GET /rest/api/3/filter/{id} to get JQL, then POST /rest/api/3/search.
    """
    jql = _get_filter_jql(filter_id)
    fields = fields or DEFAULT_FIELDS
    # Map display names to Jira field IDs
    field_map = {
        "key": "key",
        "summary": "summary",
        "status": "status",
        "assignee": "assignee",
        "priority": "priority",
        "created": "created",
        "labels": "labels",
    }
    jira_fields = [field_map.get(f, f) for f in fields]

    username, api_token = _get_auth()
    url = f"{settings.JIRA_HOST}/rest/api/3/search/jql"
    payload = {
        "jql": jql,
        "fields": jira_fields,
        "maxResults": min(max_results, 500),
    }

    with httpx.Client(timeout=30) as client:
        resp = client.post(
            url,
            json=payload,
            auth=(username, api_token),
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    issues = data.get("issues", [])
    result = []
    for i in issues:
        key = i.get("key", "")
        fs = i.get("fields", {})
        row = {"key": key, "url": f"{settings.JIRA_HOST}/browse/{key}"}
        if "summary" in jira_fields:
            row["summary"] = (fs.get("summary") or "")[:200]
        if "status" in jira_fields:
            st = fs.get("status") or {}
            row["status"] = st.get("name", "")
        if "assignee" in jira_fields:
            a = fs.get("assignee") or {}
            row["assignee"] = a.get("displayName") or ""
        if "priority" in jira_fields:
            p = fs.get("priority") or {}
            row["priority"] = p.get("name", "")
        if "created" in jira_fields:
            row["created"] = fs.get("created") or ""
        if "labels" in jira_fields:
            row["labels"] = fs.get("labels") or []
        result.append(row)

    return result
