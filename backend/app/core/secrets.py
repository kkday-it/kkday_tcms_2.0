"""
get_secret: 從 autotest-service 取得加密的 secrets，與 QA-automation lib.util 相容。

用法：
    from app.core.secrets import get_secret

    # 取得 raw 陣列 [{"id": ..., "value": "...", ...}]
    resp = get_secret(env="sit", service="payment", key="auth")

    # 取得解析後的 value (JSON dict)
    data = get_secret(env="sit", service="payment", key="auth", return_value=True)
"""
import json
import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# 快取：key -> result
_secret_cache: dict[str, Any] = {}


def _get_secret_from_service(
    key: str,
    env: str = "",
    service: str = "",
    return_value: bool = False,
) -> Any:
    """從 secret service API 取得資料。"""
    base_url = settings.SECRET_SERVICE_URL or settings.SERVICE_URL
    token = settings.AUTOMATION_TOKEN

    if not base_url or not token:
        logger.warning("SECRET_SERVICE_URL (or SERVICE_URL) and AUTOMATION_TOKEN must be set")
        raise ValueError("SECRET_SERVICE_URL/SERVICE_URL and AUTOMATION_TOKEN must be set in .env")

    # 與 QA-automation 相同：port 8000
    url = f"{base_url.rstrip('/')}:8000/api/v1/data/"
    params: dict[str, str] = {}
    if env:
        normalized = "sit" if "sit" in env else env
        params["env"] = normalized
    if service:
        params["service"] = service
    if key:
        params["key"] = key

    headers = {"Authorization": f"Bearer {token}"}

    with httpx.Client(timeout=30) as client:
        resp = client.get(url, params=params, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    if not isinstance(data, list) or len(data) == 0:
        logger.debug(f"get_secret: no result for key={key} env={env} service={service}")
        return None

    if return_value:
        raw_value = data[0].get("value")
        if raw_value is None:
            return None
        try:
            return json.loads(raw_value)
        except json.JSONDecodeError:
            return raw_value

    return data


def get_secret(
    env: str = "",
    service: str = "",
    key: str = "",
    return_value: bool = False,
) -> Any:
    """
    取得 secret，與 QA-automation lib.util.get_secret 相容。

    Args:
        env: 環境，如 sit / stage
        service: 服務名稱
        key: secret 的 key
        return_value: 若 True，回傳解析後的 value (JSON)；否則回傳 raw API 陣列

    Returns:
        return_value=False: [{"id": ..., "value": "...", ...}]
        return_value=True: 解析後的 value (dict 或 str)
    """
    cache_key = f"{env}|{service}|{key}|{return_value}"

    if cache_key in _secret_cache:
        logger.debug(f"get_secret cache hit: {cache_key}")
        return _secret_cache[cache_key]

    try:
        result = _get_secret_from_service(key=key, env=env, service=service, return_value=return_value)
    except Exception as e:
        logger.exception(f"get_secret failed: key={key} env={env} service={service}")
        raise

    if result is not None:
        _secret_cache[cache_key] = result
    return result
