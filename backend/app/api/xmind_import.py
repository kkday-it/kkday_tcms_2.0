#!/usr/bin/env python
# _*_ coding:utf-8 _*_
"""
XMind → TCMS 1.5 匯入

設計說明
--------
* 所有匯入的 Suite / Case 都放在 project 下的 "Xmind_Import" 根 Suite。
* XMind 中心節點 → Xmind_Import 的子 Suite。
* 有 priority 標記的節點 → TestCase；其餘節點 → 子 Suite（遞迴）。
* owner 使用 email 查詢 TCMS User；查不到則自動設為 Unassigned（null）。
* 標籤（labels）為自由文字，無白名單限制（Plan B）。
* XMind relationships → 附加至目標 TestCase 的 preconditions。
"""

import json
import os
import shutil
import traceback
import zipfile
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_step import TestStep
from app.models.test_suite import TestSuite
from app.models.user import User

router = APIRouter()

XMIND_IMPORT_ROOT = "Xmind_Import"

PRIORITY_MAP: Dict[str, str] = {
    "priority-1": "Critical",
    "priority-2": "High",
    "priority-3": "Medium",
    "priority-4": "Low",
}


class ImportResponse(BaseModel):
    status: str
    message: str
    data: Optional[dict] = None
    errors: Optional[List[str]] = None


# ──────────────────────────────────────────────
# XMind 解析（純 CPU，不含 I/O）
# ──────────────────────────────────────────────

def extract_xmind_content(xmind_file: str) -> list:
    """解壓 .xmind 並回傳 content.json 的 parsed 結果。"""
    temp_dir = f"{xmind_file}_extracted"
    with zipfile.ZipFile(xmind_file, "r") as zf:
        zf.extractall(temp_dir)
    content_path = os.path.join(temp_dir, "content.json")
    if not os.path.exists(content_path):
        raise ValueError("XMind 檔案中找不到 content.json")
    with open(content_path, "r", encoding="utf-8") as f:
        return json.load(f)


def has_valid_test_cases(topics: List[Dict]) -> Tuple[bool, List[str]]:
    """
    Plan B：只驗證整棵樹至少有一個帶 priority 標記的節點。
    Labels 為選填、無白名單限制。
    """
    found = False

    def scan(topic: Dict) -> None:
        nonlocal found
        if any(m.get("markerId", "") in PRIORITY_MAP for m in topic.get("markers", [])):
            found = True
        for child in topic.get("children", {}).get("attached", []):
            scan(child)

    for t in topics:
        scan(t)

    if not found:
        return False, ["XMind 檔案中找不到含 priority 標記的測試案例（priority-1 ~ priority-4）"]
    return True, []


def parse_priority(markers: list) -> str:
    for m in markers:
        mid = m.get("markerId", "")
        if mid in PRIORITY_MAP:
            return PRIORITY_MAP[mid]
    return "Medium"


def parse_steps(sub_topics: list) -> List[Dict]:
    """將 XMind 子節點轉為 TCMS TestStep 欄位格式。"""
    steps = []
    for idx, step in enumerate(sub_topics):
        action = step.get("title", "Unnamed Step")
        children = step.get("children", {}).get("attached", [])
        expected_result = ""
        if children:
            parts = []
            for child in children:
                part = child.get("title", "")
                href = child.get("href", "")
                if href:
                    part += f"\n{href}"
                if part:
                    parts.append(part)
            expected_result = "\n".join(parts)
        steps.append(
            {
                "order": idx + 1,
                "action": action,
                "expected_result": expected_result,
                "data": "",
            }
        )
    return steps


def _topic_has_priority(topic: dict) -> bool:
    """單一節點是否有 priority-1..4 marker。"""
    return any(m.get("markerId", "") in PRIORITY_MAP for m in topic.get("markers", []))


def _clean_title(raw: Optional[str], fallback: str) -> str:
    """去除前後空白並回 fallback 以避免空字串成為資料夾/案例名稱。

    KQT-15195：複製貼上常帶入零寬字元或前後空白，會讓 cache_key 與 DB 查詢看似不同名而
    產生重複資料夾，或讓案例落在錯誤層級。
    """
    if not raw:
        return fallback
    cleaned = raw.replace("​", "").replace("﻿", "").strip()
    return cleaned or fallback


def parse_test_case_data(topic: dict, step_children: Optional[List[Dict]] = None) -> dict:
    """從 XMind topic 擷取結構化測試案例資料。

    `step_children` 允許呼叫端先把 attached 子節點過濾後再傳入；預設行為相容舊版（把所有
    attached children 視為步驟）。
    """
    title = _clean_title(topic.get("title"), "Unnamed Test Case")

    # description：第一個 summary 節點（如有）
    summaries = topic.get("children", {}).get("summary", [])
    description = summaries[0].get("title", "") if summaries else ""

    # preconditions：純文字 note
    preconditions = topic.get("notes", {}).get("plain", {}).get("content", "")

    if step_children is None:
        step_children = topic.get("children", {}).get("attached", [])

    # labels：自由文字，存成 JSON 字串
    labels = topic.get("labels", [])
    labels_json = json.dumps(labels, ensure_ascii=False) if labels else None

    return {
        "id": topic.get("id"),
        "title": title,
        "description": description or None,
        "preconditions": preconditions or None,
        "priority": parse_priority(topic.get("markers", [])),
        "labels": labels_json,
        "steps": parse_steps(step_children),
    }


# ──────────────────────────────────────────────
# 非同步 DB 輔助函式
# ──────────────────────────────────────────────

async def get_or_create_suite(
    db: AsyncSession,
    project_id: int,
    name: str,
    parent_id: Optional[int],
    cache: dict,
    cache_key: str,
) -> int:
    """
    查詢或建立 Suite，並以 cache_key 快取，避免重複查詢 DB。
    使用 flush 取得 id，不 commit（由最外層統一 commit）。
    """
    if cache_key in cache:
        return cache[cache_key]

    if parent_id is None:
        q = select(TestSuite).where(
            TestSuite.project_id == project_id,
            TestSuite.name == name,
            TestSuite.parent_suite_id.is_(None),
        )
    else:
        q = select(TestSuite).where(
            TestSuite.project_id == project_id,
            TestSuite.name == name,
            TestSuite.parent_suite_id == parent_id,
        )

    result = await db.execute(q)
    suite = result.scalar_one_or_none()

    if not suite:
        suite = TestSuite(
            project_id=project_id,
            parent_suite_id=parent_id,
            name=name,
            description="Auto-generated from XMind import",
        )
        db.add(suite)
        await db.flush()

    cache[cache_key] = suite.id
    return suite.id


async def resolve_owner_id(db: AsyncSession, email: str) -> Optional[int]:
    """以 email 查詢 User.id；查不到回傳 None（Unassigned）。"""
    if not email:
        return None
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    return user.id if user else None


# ──────────────────────────────────────────────
# 遞迴建立 Suite / TestCase
# ──────────────────────────────────────────────

def _create_test_case(
    db: AsyncSession,
    topic: dict,
    suite_id: int,
    owner_id: Optional[int],
    step_children: List[Dict],
    xmind_id_to_case: dict,
) -> None:
    """單純的 TestCase 建立邏輯抽出，避免 recursive_create 兩條分支重複。"""
    data = parse_test_case_data(topic, step_children=step_children)
    db_case = TestCase(
        suite_id=suite_id,
        title=data["title"],
        description=data["description"],
        preconditions=data["preconditions"],
        priority=data["priority"],
        labels=data["labels"],
        default_owner_id=owner_id,
        status="Active",
        automation_status="Manual",
    )
    for s in data["steps"]:
        db_case.steps.append(
            TestStep(
                order=s["order"],
                action=s["action"],
                expected_result=s["expected_result"],
                data=s["data"],
            )
        )
    db.add(db_case)
    if data["id"]:
        xmind_id_to_case[data["id"]] = db_case


async def recursive_create(
    db: AsyncSession,
    topic: dict,
    parent_suite_id: int,
    project_id: int,
    owner_id: Optional[int],
    suite_cache: dict,
    path_prefix: str,
    xmind_id_to_case: dict,
) -> None:
    """
    帶 priority 標記的節點 → 建立 TestCase（含 TestStep）。
    無 priority 標記且有 children 的節點 → 建立子 Suite 並遞迴。
    """
    attached = topic.get("children", {}).get("attached", [])

    if _topic_has_priority(topic):
        _create_test_case(db, topic, parent_suite_id, owner_id, attached, xmind_id_to_case)
        return

    # 無 priority marker → 作為資料夾（子 Suite）
    if "children" in topic:
        folder_name = _clean_title(topic.get("title"), "Unknown")
        cache_key = f"{path_prefix}/{folder_name}"
        suite_id = await get_or_create_suite(
            db, project_id, folder_name, parent_suite_id, suite_cache, cache_key
        )
        for child in attached:
            await recursive_create(
                db, child, suite_id, project_id, owner_id,
                suite_cache, cache_key, xmind_id_to_case,
            )


# ──────────────────────────────────────────────
# 主要匯入邏輯
# ──────────────────────────────────────────────

async def process_xmind(
    db: AsyncSession,
    xmind_file: str,
    project_id: int,
    owner_id: Optional[int],
) -> dict:
    """解析 XMind 並在 TCMS DB 中建立 Suite / TestCase。"""
    content = extract_xmind_content(xmind_file)
    suite_cache: dict = {}
    xmind_id_to_case: dict = {}

    # 確保 "Xmind_Import" 根 Suite 存在
    xmind_root_id = await get_or_create_suite(
        db, project_id, XMIND_IMPORT_ROOT, None, suite_cache, XMIND_IMPORT_ROOT
    )

    for sheet in content:
        root_topic = sheet.get("rootTopic", {})
        relationships = sheet.get("relationships") or []
        root_title = root_topic.get("title", "Untitled")

        first_layer = (
            root_topic.get("children", {}).get("attached", [])
            or root_topic.get("children", {}).get("detached", [])
        )

        # 驗證（Plan B）
        is_valid, errors = has_valid_test_cases(first_layer)
        if not is_valid:
            return {"success": False, "errors": errors}

        # XMind 中心節點 → Xmind_Import 下的子 Suite
        sheet_key = f"{XMIND_IMPORT_ROOT}/{root_title}"
        sheet_suite_id = await get_or_create_suite(
            db, project_id, root_title, xmind_root_id, suite_cache, sheet_key
        )

        # 遞迴建立
        for topic in first_layer:
            await recursive_create(
                db, topic, sheet_suite_id, project_id, owner_id,
                suite_cache, sheet_key, xmind_id_to_case,
            )

        # flush 取得所有 case id（依賴解析需要）
        await db.flush()

        # XMind relationships → 附加 preconditions 文字
        for rel in relationships:
            from_id = rel.get("end1Id")
            to_id = rel.get("end2Id")
            if from_id in xmind_id_to_case and to_id in xmind_id_to_case:
                from_case = xmind_id_to_case[from_id]
                to_case = xmind_id_to_case[to_id]
                dep_note = f"\n--- 依賴測試案例：{from_case.title}（id: {from_case.id}）"
                to_case.preconditions = (to_case.preconditions or "") + dep_note

    await db.commit()

    total = len(xmind_id_to_case)
    created = [
        {"title": c.title, "priority": c.priority}
        for c in xmind_id_to_case.values()
    ]
    return {"success": True, "total_test_cases": total, "test_cases": created}


# ──────────────────────────────────────────────
# FastAPI endpoint
# ──────────────────────────────────────────────

@router.post("/import/xmind", response_model=ImportResponse)
async def import_xmind(
    project_id: int = Form(..., description="目標專案 ID"),
    owner: str = Form("", description="負責人 email；查不到帳號則設為 Unassigned"),
    file: UploadFile = File(..., description=".xmind 檔案"),
    db: AsyncSession = Depends(get_db),
):
    """
    上傳 XMind 檔案，自動在 TCMS 建立 Xmind_Import 根資料夾、
    對應 Suite 階層與 TestCase（含步驟）。

    - **project_id**：匯入目標專案
    - **owner**：負責人 email，系統自動轉換為 user_id；查無帳號時自動設為 Unassigned
    - **file**：.xmind 格式檔案
    """
    if not (file.filename or "").endswith(".xmind"):
        raise HTTPException(status_code=400, detail="只接受 .xmind 格式的檔案")

    temp_file = f"tmp_xmind_{file.filename}"
    try:
        raw = await file.read()
        with open(temp_file, "wb") as f:
            f.write(raw)

        owner_id = await resolve_owner_id(db, owner.strip())
        owner_resolved = owner_id is not None

        result = await process_xmind(db, temp_file, project_id, owner_id)

        if not result["success"]:
            return ImportResponse(
                status="error",
                message="XMind 驗證失敗，未建立任何測試案例",
                errors=result.get("errors", []),
            )

        note = ""
        if owner.strip() and not owner_resolved:
            note = f"（owner「{owner.strip()}」查無對應帳號，已設為 Unassigned）"

        return ImportResponse(
            status="success",
            message=f"成功匯入 {result['total_test_cases']} 筆測試案例{note}",
            data={
                "total_test_cases": result["total_test_cases"],
                "test_cases": result["test_cases"],
            },
        )

    except Exception:
        return ImportResponse(
            status="error",
            message="匯入過程發生錯誤",
            errors=[traceback.format_exc()],
        )
    finally:
        if os.path.exists(temp_file):
            os.remove(temp_file)
        temp_dir = f"{temp_file}_extracted"
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)
