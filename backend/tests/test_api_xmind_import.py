"""
XMind Import — Unit Tests
covers:
  - Pure parser functions (no DB / HTTP)
  - POST /cases/import/xmind API (via in-memory SQLite + ASGITransport)
"""

import io
import json
import zipfile

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.api.xmind_import import (
    PRIORITY_MAP,
    has_valid_test_cases,
    parse_priority,
    parse_steps,
    parse_test_case_data,
)


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def make_xmind_bytes(sheets: list) -> bytes:
    """Build an in-memory .xmind ZIP containing content.json."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("content.json", json.dumps(sheets))
    return buf.getvalue()


def make_topic(
    title: str,
    priority: str | None = None,
    children: list | None = None,
    labels: list | None = None,
    notes: str | None = None,
    topic_id: str | None = None,
) -> dict:
    t: dict = {"title": title}
    if topic_id:
        t["id"] = topic_id
    if priority:
        t["markers"] = [{"markerId": priority}]
    if children is not None:
        t["children"] = {"attached": children}
    if labels:
        t["labels"] = labels
    if notes:
        t["notes"] = {"plain": {"content": notes}}
    return t


def make_sheet(root_title: str, children: list, relationships: list | None = None) -> dict:
    return {
        "rootTopic": {
            "title": root_title,
            "children": {"attached": children},
        },
        "relationships": relationships or [],
    }


def single_case_sheet(title: str = "TC-001", priority: str = "priority-1") -> bytes:
    topic = make_topic(title, priority=priority)
    return make_xmind_bytes([make_sheet("Root", [topic])])


# ─────────────────────────────────────────────────────────────
# Pure-function tests (no DB)
# ─────────────────────────────────────────────────────────────

class TestHasValidTestCases:
    def test_returns_true_when_priority_marker_exists(self):
        topics = [make_topic("TC", priority="priority-2")]
        ok, errors = has_valid_test_cases(topics)
        assert ok is True
        assert errors == []

    def test_returns_false_when_no_priority_marker(self):
        topics = [make_topic("Folder", children=[make_topic("No Priority")])]
        ok, errors = has_valid_test_cases(topics)
        assert ok is False
        assert len(errors) == 1

    def test_detects_nested_priority(self):
        inner = make_topic("Inner TC", priority="priority-4")
        outer = make_topic("Folder", children=[inner])
        ok, errors = has_valid_test_cases([outer])
        assert ok is True

    def test_empty_topics_returns_false(self):
        ok, errors = has_valid_test_cases([])
        assert ok is False

    def test_all_four_priority_levels_accepted(self):
        for pid in PRIORITY_MAP:
            ok, _ = has_valid_test_cases([make_topic("X", priority=pid)])
            assert ok is True, f"priority {pid} should be valid"


class TestParsePriority:
    def test_priority_1_maps_to_critical(self):
        assert parse_priority([{"markerId": "priority-1"}]) == "Critical"

    def test_priority_2_maps_to_high(self):
        assert parse_priority([{"markerId": "priority-2"}]) == "High"

    def test_priority_3_maps_to_medium(self):
        assert parse_priority([{"markerId": "priority-3"}]) == "Medium"

    def test_priority_4_maps_to_low(self):
        assert parse_priority([{"markerId": "priority-4"}]) == "Low"

    def test_unknown_marker_defaults_to_medium(self):
        assert parse_priority([{"markerId": "star-red"}]) == "Medium"

    def test_empty_markers_defaults_to_medium(self):
        assert parse_priority([]) == "Medium"

    def test_first_priority_marker_wins(self):
        markers = [{"markerId": "priority-1"}, {"markerId": "priority-4"}]
        assert parse_priority(markers) == "Critical"


class TestParseSteps:
    def test_empty_sub_topics_returns_empty_list(self):
        assert parse_steps([]) == []

    def test_single_step_no_expected_result(self):
        steps = parse_steps([{"title": "Click Login"}])
        assert len(steps) == 1
        assert steps[0]["action"] == "Click Login"
        assert steps[0]["expected_result"] == ""
        assert steps[0]["order"] == 1

    def test_step_with_child_as_expected_result(self):
        step_topic = {
            "title": "Enter credentials",
            "children": {"attached": [{"title": "Login success"}]},
        }
        steps = parse_steps([step_topic])
        assert steps[0]["expected_result"] == "Login success"

    def test_step_with_href_appended_to_expected_result(self):
        step_topic = {
            "title": "Step",
            "children": {"attached": [{"title": "Result", "href": "http://example.com"}]},
        }
        steps = parse_steps([step_topic])
        assert "http://example.com" in steps[0]["expected_result"]

    def test_order_increments_correctly(self):
        topics = [{"title": f"Step {i}"} for i in range(1, 4)]
        steps = parse_steps(topics)
        assert [s["order"] for s in steps] == [1, 2, 3]

    def test_missing_title_uses_fallback(self):
        steps = parse_steps([{}])
        assert steps[0]["action"] == "Unnamed Step"


class TestParseTestCaseData:
    def test_basic_fields_extracted(self):
        topic = make_topic("My TC", priority="priority-2")
        data = parse_test_case_data(topic)
        assert data["title"] == "My TC"
        assert data["priority"] == "High"
        assert data["description"] is None
        assert data["preconditions"] is None
        assert data["labels"] is None

    def test_notes_become_preconditions(self):
        topic = make_topic("TC", priority="priority-1", notes="Must be logged in")
        data = parse_test_case_data(topic)
        assert data["preconditions"] == "Must be logged in"

    def test_labels_serialised_as_json_string(self):
        topic = make_topic("TC", priority="priority-3", labels=["smoke", "regression"])
        data = parse_test_case_data(topic)
        assert data["labels"] == '["smoke", "regression"]'

    def test_children_become_steps(self):
        topic = make_topic(
            "TC",
            priority="priority-1",
            children=[{"title": "Step A"}, {"title": "Step B"}],
        )
        data = parse_test_case_data(topic)
        assert len(data["steps"]) == 2
        assert data["steps"][0]["action"] == "Step A"

    def test_empty_labels_returns_none(self):
        topic = make_topic("TC", priority="priority-1", labels=[])
        data = parse_test_case_data(topic)
        assert data["labels"] is None


# ─────────────────────────────────────────────────────────────
# API tests (in-memory SQLite via conftest fixtures)
# ─────────────────────────────────────────────────────────────

class TestXmindImportAPI:

    # ── file validation ──────────────────────────────────────

    @pytest.mark.asyncio
    async def test_rejects_non_xmind_file(self, client: AsyncClient, project_id: int):
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("report.pdf", b"fake", "application/pdf")},
        )
        assert res.status_code == 400

    @pytest.mark.asyncio
    async def test_missing_file_returns_422(self, client: AsyncClient, project_id: int):
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id},
        )
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_missing_project_id_returns_422(self, client: AsyncClient):
        xmind = single_case_sheet()
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 422

    # ── happy-path ───────────────────────────────────────────

    @pytest.mark.asyncio
    async def test_successful_import_returns_200(self, client: AsyncClient, project_id: int):
        xmind = single_case_sheet()
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"

    @pytest.mark.asyncio
    async def test_import_returns_correct_case_count(self, client: AsyncClient, project_id: int):
        topics = [
            make_topic("TC-001", priority="priority-1", topic_id="id-001"),
            make_topic("TC-002", priority="priority-2", topic_id="id-002"),
            make_topic("TC-003", priority="priority-3", topic_id="id-003"),
        ]
        xmind = make_xmind_bytes([make_sheet("Root", topics)])
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 200
        data = res.json()["data"]
        assert data["total_test_cases"] == 3

    @pytest.mark.asyncio
    async def test_import_creates_xmind_import_root_suite(self, client: AsyncClient, project_id: int):
        xmind = single_case_sheet()
        await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        suites_res = await client.get(f"/api/v1/suites/project/{project_id}")
        names = [s["name"] for s in suites_res.json()]
        assert "Xmind_Import" in names

    @pytest.mark.asyncio
    async def test_import_idempotent_root_suite_not_duplicated(self, client: AsyncClient, project_id: int):
        xmind = single_case_sheet()
        for _ in range(2):
            await client.post(
                "/api/v1/cases/import/xmind",
                data={"project_id": project_id, "owner": ""},
                files={"file": ("test.xmind", xmind, "application/octet-stream")},
            )
        suites_res = await client.get(f"/api/v1/suites/project/{project_id}")
        root_suites = [s for s in suites_res.json() if s["name"] == "Xmind_Import"]
        assert len(root_suites) == 1

    @pytest.mark.asyncio
    async def test_cases_queryable_after_import(self, client: AsyncClient, project_id: int):
        xmind = single_case_sheet("Login Flow", "priority-1")
        await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        cases_res = await client.get(f"/api/v1/cases/project/{project_id}")
        titles = [c["title"] for c in cases_res.json()]
        assert "Login Flow" in titles

    @pytest.mark.asyncio
    async def test_priority_correctly_mapped(self, client: AsyncClient, project_id: int):
        xmind = make_xmind_bytes([make_sheet("Root", [
            make_topic("Critical TC", priority="priority-1", topic_id="crit-01"),
            make_topic("Low TC",      priority="priority-4", topic_id="low-01"),
        ])])
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        imported = {c["title"]: c["priority"] for c in res.json()["data"]["test_cases"]}
        assert imported["Critical TC"] == "Critical"
        assert imported["Low TC"] == "Low"

    # ── owner resolution ─────────────────────────────────────

    @pytest.mark.asyncio
    async def test_owner_resolved_when_email_exists(self, client: AsyncClient, project_id: int):
        # create a user first
        await client.post(
            "/api/v1/users/",
            json={"username": "tester", "email": "tester@kkday.com",
                  "role": "QA", "password": "pass123"},
        )
        xmind = single_case_sheet()
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": "tester@kkday.com"},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        # message should NOT contain the "查無對應帳號" note
        assert "查無對應帳號" not in body["message"]

    @pytest.mark.asyncio
    async def test_owner_unassigned_when_email_not_found(self, client: AsyncClient, project_id: int):
        xmind = single_case_sheet()
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": "ghost@nowhere.com"},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "success"
        assert "查無對應帳號" in body["message"]

    @pytest.mark.asyncio
    async def test_empty_owner_does_not_raise(self, client: AsyncClient, project_id: int):
        xmind = single_case_sheet()
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 200
        assert res.json()["status"] == "success"

    # ── validation failure ───────────────────────────────────

    @pytest.mark.asyncio
    async def test_xmind_without_priority_returns_error_status(self, client: AsyncClient, project_id: int):
        no_priority = make_topic("Just a folder", children=[make_topic("child")])
        xmind = make_xmind_bytes([make_sheet("Root", [no_priority])])
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "error"
        assert body["errors"]

    # ── nested suite structure ───────────────────────────────

    @pytest.mark.asyncio
    async def test_folder_nodes_create_nested_suites(self, client: AsyncClient, project_id: int):
        inner_case = make_topic("Inner TC", priority="priority-2")
        folder = make_topic("My Feature", children=[inner_case])
        xmind = make_xmind_bytes([make_sheet("Sheet1", [folder])])
        await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        suites_res = await client.get(f"/api/v1/suites/project/{project_id}")
        names = [s["name"] for s in suites_res.json()]
        assert "My Feature" in names

    @pytest.mark.asyncio
    async def test_steps_created_for_case(self, client: AsyncClient, project_id: int):
        step1 = {"title": "Open browser"}
        step2 = {
            "title": "Login",
            "children": {"attached": [{"title": "Redirect to dashboard"}]},
        }
        tc = {
            "title": "Login Test",
            "markers": [{"markerId": "priority-1"}],
            "children": {"attached": [step1, step2]},
        }
        xmind = make_xmind_bytes([make_sheet("Root", [tc])])
        await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        cases_res = await client.get(f"/api/v1/cases/project/{project_id}")
        login_case = next(c for c in cases_res.json() if c["title"] == "Login Test")
        detail_res = await client.get(f"/api/v1/cases/{login_case['id']}")
        steps = detail_res.json().get("steps", [])
        assert len(steps) == 2
        assert steps[0]["action"] == "Open browser"
        assert steps[1]["expected_result"] == "Redirect to dashboard"

    @pytest.mark.asyncio
    async def test_priority_node_with_priority_children_keeps_both_in_same_folder(
        self, client: AsyncClient, project_id: int
    ):
        """KQT-15195 regression.

        When a node has a priority marker AND its descendants also have priority
        markers, previously the descendants were silently consumed as Steps of the
        parent — so they vanished from the folder tree, or appeared one level above
        where the mindmap put them. They should now land alongside the parent in a
        folder named after the parent topic.
        """
        grandchild = make_topic("TC-3934", priority="priority-1")
        parent_case = {
            "title": "推薦模組定位邏輯",
            "markers": [{"markerId": "priority-2"}],
            "children": {"attached": [grandchild]},
        }
        phase2 = make_topic("phase2-用戶定位功能", children=[parent_case])
        xmind = make_xmind_bytes([make_sheet("Sheet1", [phase2])])
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 200, res.text

        # The parent topic's title becomes both a folder AND a case under that folder.
        suites_res = await client.get(f"/api/v1/suites/project/{project_id}")
        suites = suites_res.json()
        suite_by_name = {s["name"]: s for s in suites}
        assert "推薦模組定位邏輯" in suite_by_name, suite_by_name.keys()
        phase2_suite = suite_by_name["phase2-用戶定位功能"]
        recommend_suite = suite_by_name["推薦模組定位邏輯"]
        assert recommend_suite["parent_suite_id"] == phase2_suite["id"]

        # TC-3934 should sit inside 推薦模組定位邏輯, not float up to phase2.
        cases_res = await client.get(
            f"/api/v1/cases/suite/{recommend_suite['id']}"
        )
        case_titles = [c["title"] for c in cases_res.json()]
        assert "TC-3934" in case_titles, case_titles
        assert "推薦模組定位邏輯" in case_titles, case_titles

        # And TC-3934 must NOT also exist directly under phase2 (the bug symptom).
        phase2_cases = await client.get(
            f"/api/v1/cases/suite/{phase2_suite['id']}"
        )
        assert "TC-3934" not in [c["title"] for c in phase2_cases.json()]

    @pytest.mark.asyncio
    async def test_titles_with_whitespace_dedupe(self, client: AsyncClient, project_id: int):
        """KQT-15195 hardening — leading/trailing whitespace shouldn't fork folders."""
        tc1 = make_topic("TC A", priority="priority-1")
        tc2 = make_topic("TC B", priority="priority-1")
        folder_clean = make_topic("Shared Folder", children=[tc1])
        folder_padded = {
            "title": "  Shared Folder  ",
            "children": {"attached": [tc2]},
        }
        xmind = make_xmind_bytes(
            [make_sheet("Sheet1", [folder_clean, folder_padded])]
        )
        res = await client.post(
            "/api/v1/cases/import/xmind",
            data={"project_id": project_id, "owner": ""},
            files={"file": ("test.xmind", xmind, "application/octet-stream")},
        )
        assert res.status_code == 200, res.text

        suites_res = await client.get(f"/api/v1/suites/project/{project_id}")
        names = [s["name"] for s in suites_res.json()]
        assert names.count("Shared Folder") == 1, names
