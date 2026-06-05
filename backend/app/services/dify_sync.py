"""
Dify Knowledge Base 同步服務

透過 Dify Dataset API 將 TestCase 同步為 Knowledge Base 文件，
讓 Dify 的 LLM workflow 可對 TCMS 資料進行語意搜尋。

設定方式（backend/.env）：
    DIFY_BASE_URL=https://your-dify.example.com
    DIFY_API_KEY=dataset-xxxxxxxxxxxxxxxx
    DIFY_DATASET_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SYNC_MAP_PATH = os.path.join(os.path.dirname(__file__), "../../../data/dify_sync_map.json")


def _load_sync_map() -> dict:
    """載入 case_id → dify_document_id 的對應表"""
    try:
        with open(SYNC_MAP_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_sync_map(sync_map: dict) -> None:
    os.makedirs(os.path.dirname(SYNC_MAP_PATH), exist_ok=True)
    with open(SYNC_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(sync_map, f, ensure_ascii=False, indent=2)


def build_case_text(case) -> str:
    """將 TestCase 轉成適合 LLM embedding 的自然語言文字"""
    parts = [f"Title: {case.title}"]

    if case.description:
        parts.append(f"Description: {case.description}")
    if case.preconditions:
        parts.append(f"Preconditions: {case.preconditions}")

    if case.steps:
        steps_text = []
        for i, step in enumerate(case.steps, 1):
            step_parts = [f"Step {i}: {step.action}"]
            if step.data:
                step_parts.append(f"  Data: {step.data}")
            if step.expected_result:
                step_parts.append(f"  Expected: {step.expected_result}")
            steps_text.append("\n".join(step_parts))
        parts.append("Steps:\n" + "\n".join(steps_text))

    if case.postconditions:
        parts.append(f"Postconditions: {case.postconditions}")

    return "\n\n".join(parts)


def build_case_metadata(case) -> dict:
    """提取適合向量 DB filter 的 metadata"""
    tags = []
    labels = []
    if case.tags:
        try:
            tags = json.loads(case.tags)
        except Exception:
            tags = [t.strip() for t in case.tags.split(",") if t.strip()]
    if case.labels:
        try:
            labels = json.loads(case.labels)
        except Exception:
            labels = [l.strip() for l in case.labels.split(",") if l.strip()]

    return {
        "case_id": case.id,
        "suite_id": case.suite_id,
        "priority": case.priority,
        "automation_status": case.automation_status,
        "layer": case.layer,
        "type": case.type,
        # Lifecycle now lives on `status` (lifecycle_status is dead); keep the
        # metadata key for compat but source the live value.
        "lifecycle_status": case.status,
        "tags": tags,
        "labels": labels,
        "jira_keys": case.jira_keys or "",
        "external_id": case.external_id or "",
    }


def _check_config() -> None:
    missing = [k for k in ("DIFY_BASE_URL", "DIFY_API_KEY", "DIFY_DATASET_ID")
               if not getattr(settings, k)]
    if missing:
        raise ValueError(f"Dify 設定缺少：{', '.join(missing)}。請在 backend/.env 中設定。")


async def sync_cases_to_dify(cases: list) -> dict:
    """
    將 TestCase 列表同步至 Dify Knowledge Base。

    Returns:
        { "created": int, "updated": int, "failed": int, "total": int }
    """
    _check_config()

    base_url = settings.DIFY_BASE_URL.rstrip("/")
    dataset_id = settings.DIFY_DATASET_ID
    headers = {
        "Authorization": f"Bearer {settings.DIFY_API_KEY}",
        "Content-Type": "application/json",
    }

    sync_map = _load_sync_map()
    stats = {"created": 0, "updated": 0, "failed": 0, "total": len(cases)}

    async with httpx.AsyncClient(timeout=30) as client:
        for case in cases:
            case_key = str(case.id)
            text = build_case_text(case)
            doc_name = f"TC-{case.id} - {case.title}"

            payload = {
                "name": doc_name,
                "text": text,
                "indexing_technique": "high_quality",
                "process_rule": {
                    "mode": "custom",
                    "rules": {
                        "pre_processing_rules": [
                            {"id": "remove_extra_spaces", "enabled": True},
                            {"id": "remove_urls_emails", "enabled": False},
                        ],
                        "segmentation": {"separator": "\n\n", "max_tokens": 1000},
                    },
                },
            }

            try:
                existing_doc_id = sync_map.get(case_key, {}).get("document_id")

                if existing_doc_id:
                    # 更新現有文件
                    resp = await client.post(
                        f"{base_url}/v1/datasets/{dataset_id}/documents/{existing_doc_id}/update_by_text",
                        headers=headers,
                        json={"name": doc_name, "text": text, "process_rule": payload["process_rule"]},
                    )
                else:
                    # 建立新文件
                    resp = await client.post(
                        f"{base_url}/v1/datasets/{dataset_id}/document/create_by_text",
                        headers=headers,
                        json=payload,
                    )

                resp.raise_for_status()
                data = resp.json()
                doc_id = data.get("document", {}).get("id") or existing_doc_id

                sync_map[case_key] = {
                    "document_id": doc_id,
                    "synced_at": datetime.now(timezone.utc).isoformat(),
                }

                if existing_doc_id:
                    stats["updated"] += 1
                else:
                    stats["created"] += 1

            except Exception as e:
                logger.error(f"TC-{case.id} 同步失敗: {e}")
                stats["failed"] += 1

    _save_sync_map(sync_map)
    return stats


async def delete_case_from_dify(case_id: int) -> bool:
    """從 Dify Knowledge Base 刪除對應文件"""
    try:
        _check_config()
    except ValueError:
        return False

    sync_map = _load_sync_map()
    case_key = str(case_id)
    doc_info = sync_map.get(case_key)
    if not doc_info:
        return False

    base_url = settings.DIFY_BASE_URL.rstrip("/")
    dataset_id = settings.DIFY_DATASET_ID
    headers = {"Authorization": f"Bearer {settings.DIFY_API_KEY}"}

    async with httpx.AsyncClient(timeout=15) as client:
        try:
            resp = await client.delete(
                f"{base_url}/v1/datasets/{dataset_id}/documents/{doc_info['document_id']}",
                headers=headers,
            )
            resp.raise_for_status()
            del sync_map[case_key]
            _save_sync_map(sync_map)
            return True
        except Exception as e:
            logger.error(f"TC-{case_id} 從 Dify 刪除失敗: {e}")
            return False
