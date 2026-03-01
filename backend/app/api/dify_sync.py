"""
Dify Knowledge Base 同步 API

POST /api/v1/cases/sync/dify?project_id={id}   — 同步整個 Project
POST /api/v1/cases/sync/dify?suite_id={id}      — 同步指定 Suite
GET  /api/v1/cases/sync/dify/status             — 查看同步設定與狀態
"""

import json
import os
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_suite import TestSuite
from app.services.dify_sync import SYNC_MAP_PATH, _load_sync_map, sync_cases_to_dify

router = APIRouter()


@router.get("/status")
async def dify_sync_status():
    """查看 Dify 設定狀態與已同步的 Case 數量"""
    configured = all([settings.DIFY_BASE_URL, settings.DIFY_API_KEY, settings.DIFY_DATASET_ID])
    sync_map = _load_sync_map()

    last_synced_at = None
    if sync_map:
        dates = [v.get("synced_at") for v in sync_map.values() if v.get("synced_at")]
        if dates:
            last_synced_at = max(dates)

    return {
        "configured": configured,
        "dify_base_url": settings.DIFY_BASE_URL or "(未設定)",
        "dify_dataset_id": settings.DIFY_DATASET_ID or "(未設定)",
        "synced_cases": len(sync_map),
        "last_synced_at": last_synced_at,
    }


@router.post("")
async def trigger_dify_sync(
    project_id: Optional[int] = Query(None, description="同步整個 Project 的 Cases"),
    suite_id: Optional[int] = Query(None, description="只同步指定 Suite（含子 Suite）"),
    db: AsyncSession = Depends(get_db),
):
    """
    觸發 Dify Knowledge Base 同步。

    - 指定 **project_id**：同步整個 Project 的所有 Cases
    - 指定 **suite_id**：只同步該 Suite 及子 Suite 的 Cases
    - 新 Case 會建立新文件；已同步的 Case 會更新現有文件
    """
    if not project_id and not suite_id:
        raise HTTPException(status_code=400, detail="請提供 project_id 或 suite_id")

    if not all([settings.DIFY_BASE_URL, settings.DIFY_API_KEY, settings.DIFY_DATASET_ID]):
        raise HTTPException(
            status_code=503,
            detail="Dify 尚未設定。請在 backend/.env 中加入 DIFY_BASE_URL、DIFY_API_KEY、DIFY_DATASET_ID。",
        )

    if suite_id:
        hierarchy = (
            select(TestSuite.id)
            .where(TestSuite.id == suite_id)
            .cte(name="suite_hierarchy", recursive=True)
        )
        hierarchy = hierarchy.union_all(
            select(TestSuite.id).where(TestSuite.parent_suite_id == hierarchy.c.id)
        )
        result = await db.execute(
            select(TestCase)
            .options(selectinload(TestCase.steps))
            .where(TestCase.suite_id.in_(select(hierarchy.c.id)))
        )
    else:
        result = await db.execute(
            select(TestCase)
            .join(TestSuite)
            .options(selectinload(TestCase.steps))
            .where(TestSuite.project_id == project_id)
        )

    cases = result.scalars().all()
    if not cases:
        return {"message": "沒有找到 Cases", "stats": {"total": 0}}

    stats = await sync_cases_to_dify(cases)

    return {
        "message": "同步完成",
        "stats": stats,
    }
