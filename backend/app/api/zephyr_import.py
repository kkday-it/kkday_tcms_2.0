from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import xml.etree.ElementTree as ET
import ipaddress
import json
import logging
import os
import re
import socket
import uuid
from typing import Dict, Optional
from urllib.parse import urlparse

import httpx

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_suite import TestSuite
from app.models.test_step import TestStep

router = APIRouter()
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────────
# Zephyr image rehoming
# ──────────────────────────────────────────────────────────────────────────────
# Zephyr XML exports embed <img src="..."> tags pointing at the source instance
# (e.g. zephyr.atlassian.com/...). Those URLs require Zephyr authentication and
# will 401 once accessed from TCMS, so the images would silently break.
#
# Rehome strategy:
#   1. Scan every text field (description, preconditions, step.action, .expected,
#      .testData) for <img src="..."> tags.
#   2. Download each external URL via httpx, save under uploads/ with a UUID
#      filename, and rewrite the src attribute to the TCMS-served path.
#   3. Cache per-import so the same Zephyr URL is downloaded once.
#   4. Any single download failure is logged but doesn't fail the whole import —
#      the original src is kept as-is so a manual fix is still possible.
#
# Security:
#   * SSRF: each candidate URL's host is resolved via getaddrinfo, and we reject
#     any host that maps to a private/loopback/link-local/multicast/reserved
#     range. Without this guard a crafted XML could pivot the backend at
#     169.254.169.254 (AWS IMDS) or 10.x services.
#   * Content sniffing: we only trust the remote Content-Type if it matches a
#     small allowlist of raster image MIME types, and we only persist files
#     with a matching safe extension. SVG is intentionally excluded because
#     it can carry inline <script>.

UPLOAD_DIR = "uploads"
IMG_TAG_RE = re.compile(r'(<img[^>]*\bsrc=["\'])([^"\']+)(["\'][^>]*>)', re.IGNORECASE)

# Raster-only allowlist. Keep in sync with extension allowlist below.
_SAFE_IMAGE_MIMES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
_SAFE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

# Cap on a single downloaded image. Without this, an attacker-controlled (or
# accidentally huge) URL could let a Zephyr XML import balloon TCMS's memory
# and disk usage. 10 MB is generous for a screenshot — anything larger is
# almost certainly not a UI artefact.
MAX_IMAGE_BYTES = 10 * 1024 * 1024


def _is_safe_remote_host(host: str) -> bool:
    """Reject hostnames that resolve to non-public IPs (loopback, link-local,
    private, multicast, reserved). Empty host or DNS failure → reject."""
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    if not infos:
        return False
    for info in infos:
        sockaddr = info[4]
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            return False
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            return False
    return True


async def _download_and_store_image(
    client: httpx.AsyncClient,
    url: str,
    cache: Dict[str, str],
) -> Optional[str]:
    """Download `url` once and return the rewritten TCMS path, or None on error."""
    if url in cache:
        return cache[url]
    # Anything that already lives under our own /uploads path doesn't need rehoming.
    if url.startswith("/api/v1/uploads/") or url.startswith("/uploads/"):
        cache[url] = url
        return url
    if not (url.startswith("http://") or url.startswith("https://")):
        # data: URIs and other schemes are kept as-is.
        cache[url] = url
        return url

    parsed = urlparse(url)
    if not _is_safe_remote_host(parsed.hostname or ""):
        logger.warning(f"Zephyr image rehome rejected (private/loopback host) for {url}")
        return None

    # Stream the response so we can (a) check Content-Length early and (b)
    # enforce MAX_IMAGE_BYTES even when the server omits or lies about the
    # header — otherwise an attacker could serve an unbounded "image" and
    # exhaust memory before our size check ran.
    try:
        async with client.stream("GET", url, follow_redirects=True) as resp:
            resp.raise_for_status()

            # After redirects, the final URL might have landed on a private
            # host (`follow_redirects=True` would otherwise be an SSRF bypass).
            final_host = (
                resp.url.host if hasattr(resp.url, "host")
                else urlparse(str(resp.url)).hostname
            ) or ""
            if final_host and not _is_safe_remote_host(final_host):
                logger.warning(
                    f"Zephyr image rehome rejected post-redirect (private host {final_host}) for {url}"
                )
                return None

            content_type = resp.headers.get("content-type", "").split(";")[0].strip().lower()
            if content_type not in _SAFE_IMAGE_MIMES:
                logger.warning(
                    f"Zephyr image rehome skipped (disallowed content-type {content_type!r}) for {url}"
                )
                return None
            ext = _SAFE_IMAGE_MIMES[content_type]

            content_length = resp.headers.get("content-length")
            if content_length:
                try:
                    declared = int(content_length)
                except ValueError:
                    declared = -1
                if declared > MAX_IMAGE_BYTES:
                    logger.warning(
                        f"Zephyr image rehome skipped (Content-Length {declared} > {MAX_IMAGE_BYTES}) for {url}"
                    )
                    return None

            chunks: list[bytes] = []
            total = 0
            async for chunk in resp.aiter_bytes():
                total += len(chunk)
                if total > MAX_IMAGE_BYTES:
                    logger.warning(
                        f"Zephyr image rehome aborted (downloaded > {MAX_IMAGE_BYTES} bytes) for {url}"
                    )
                    return None
                chunks.append(chunk)
            body = b"".join(chunks)
    except Exception as exc:
        logger.warning(f"Zephyr image rehome failed for {url}: {exc}")
        return None

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    try:
        with open(file_path, "wb") as f:
            f.write(body)
    except OSError as exc:
        logger.warning(f"Zephyr image rehome write failed for {url}: {exc}")
        return None

    rewritten = f"/api/v1/uploads/static/{filename}"
    cache[url] = rewritten
    return rewritten


async def rehome_zephyr_images(
    text: Optional[str],
    client: httpx.AsyncClient,
    cache: Dict[str, str],
) -> Optional[str]:
    """Find every <img src="..."> in `text`, download the asset, and rewrite the
    src to point at the local /uploads/static/... path. If `text` has no img
    tags it's returned unchanged. Failures fall back to the original src."""
    if not text or "<img" not in text.lower():
        return text

    # Collect unique URLs first so we don't kick off duplicate downloads when the
    # same image appears more than once in a field.
    seen: set[str] = set()
    matches = list(IMG_TAG_RE.finditer(text))
    for m in matches:
        seen.add(m.group(2))
    for url in seen:
        await _download_and_store_image(client, url, cache)

    def _rewrite(match: re.Match) -> str:
        original = match.group(2)
        rewritten = cache.get(original, original)
        return f"{match.group(1)}{rewritten}{match.group(3)}"

    return IMG_TAG_RE.sub(_rewrite, text)

async def get_or_create_suite(db: AsyncSession, project_id: int, folder_path: str, suite_cache: dict) -> int:
    """Helper to convert 'Squad Projects/Trans/高鐵聯票' into a suite ID hierarchy.
       Uses a cache dict to avoid hitting the DB for every path level.
    """
    if not folder_path:
        folder_path = ""
        
    if folder_path.startswith("Squad Projects/"):
        folder_path = folder_path[len("Squad Projects/"):]
            
    parts = ["Zephyr_Import"]
    if folder_path:
        parts.extend([p.strip() for p in folder_path.split("/") if p.strip()])
        
    parent_id = None
    current_suite_id = None
    current_path = ""
    
    for part in parts:
        current_path = f"{current_path}/{part}" if current_path else part
        
        if current_path in suite_cache:
            current_suite_id = suite_cache[current_path]
            parent_id = current_suite_id
            continue
            
        # Search for existing suite
        if parent_id is None:
            query = select(TestSuite).where(
                TestSuite.project_id == project_id, 
                TestSuite.name == part, 
                TestSuite.parent_suite_id.is_(None)
            )
        else:
            query = select(TestSuite).where(
                TestSuite.project_id == project_id, 
                TestSuite.name == part, 
                TestSuite.parent_suite_id == parent_id
            )
            
        result = await db.execute(query)
        suite = result.scalar_one_or_none()
        
        if not suite:
            suite = TestSuite(
                project_id=project_id, 
                parent_suite_id=parent_id, 
                name=part, 
                description="Auto-generated from Zephyr import"
            )
            db.add(suite)
            await db.commit()
            await db.refresh(suite)
            
        current_suite_id = suite.id
        suite_cache[current_path] = current_suite_id
        parent_id = current_suite_id
        
    return current_suite_id

@router.post("/import/zephyr")
async def import_zephyr_xml(
    project_id: int,
    file: UploadFile = File(...),
    strategy: str = "skip",
    db: AsyncSession = Depends(get_db),
):
    """
    匯入 Zephyr XML 檔案。

    - **strategy=skip**（預設）：external_id 已存在的 case 跳過，不覆蓋
    - **strategy=overwrite**：external_id 已存在的 case 以 XML 內容覆蓋（title、description、steps 等）
    """
    if strategy not in ("skip", "overwrite"):
        raise HTTPException(status_code=400, detail="strategy 必須為 'skip' 或 'overwrite'")

    if not file.filename.endswith('.xml'):
        raise HTTPException(status_code=400, detail="Only XML files are supported")

    content = await file.read()
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        raise HTTPException(status_code=400, detail="Invalid XML format")

    imported_count = 0
    skipped_count = 0
    skipped_keys = []
    overwritten_count = 0
    cases_to_add = []
    suite_cache = {}  # Cache suite IDs to prevent N+1 queries
    image_cache: Dict[str, str] = {}  # Zephyr URL → rewritten /api/v1/uploads/...

    # Use a single httpx client across the import so connections to the same
    # Zephyr host get reused. `async with` guarantees aclose() even if any
    # downstream await (e.g. db.commit) raises — see PR #693 review.
    async with httpx.AsyncClient(timeout=30.0) as image_client:
        rehomed_images, imported_count, skipped_count, skipped_keys, overwritten_count = await _process_zephyr_cases(
            db=db,
            root=root,
            project_id=project_id,
            strategy=strategy,
            image_client=image_client,
            image_cache=image_cache,
            suite_cache=suite_cache,
        )

    return {
        "message": f"Successfully imported {imported_count} test cases",
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "skipped_keys": skipped_keys,
        "overwritten_count": overwritten_count,
        "rehomed_images": rehomed_images,
    }


async def _process_zephyr_cases(
    db: AsyncSession,
    root: ET.Element,
    project_id: int,
    strategy: str,
    image_client: httpx.AsyncClient,
    image_cache: Dict[str, str],
    suite_cache: dict,
) -> tuple[int, int, int, list, int]:
    """Inner loop of import_zephyr_xml. Returns (rehomed_images, imported,
    skipped, skipped_keys, overwritten). Split out so the caller can manage
    the httpx client lifetime with `async with`."""
    imported_count = 0
    skipped_count = 0
    skipped_keys: list[str] = []
    overwritten_count = 0
    cases_to_add: list[TestCase] = []

    # 1. Parse all test case elements into memory first
    tc_elems = root.findall('.//testCase')

    # 2. Batch query existing external_ids in one shot (avoid N+1)
    all_keys = [tc.get('key', '') for tc in tc_elems if tc.get('key', '')]
    existing_map: dict[str, TestCase] = {}
    if all_keys:
        existing_result = await db.execute(
            select(TestCase)
            .options(selectinload(TestCase.steps))
            .where(TestCase.external_id.in_(all_keys))
        )
        for existing_case in existing_result.scalars().all():
            existing_map[existing_case.external_id] = existing_case

    # 3. Process each test case
    for tc_elem in tc_elems:
        # Extract basic info
        key = tc_elem.get('key', '')
        name_elem = tc_elem.find('name')
        title = name_elem.text if name_elem is not None else "Untitled Case"

        description_elem = tc_elem.find('objective')
        description = description_elem.text if description_elem is not None else ""
        description = await rehome_zephyr_images(description, image_client, image_cache) or ""

        precond_elem = tc_elem.find('precondition')
        preconditions = precond_elem.text if precond_elem is not None else ""
        preconditions = await rehome_zephyr_images(preconditions, image_client, image_cache) or ""

        priority_elem = tc_elem.find('priority')
        priority = priority_elem.text if priority_elem is not None else "Not Set"

        status_elem = tc_elem.find('status')
        status = status_elem.text if status_elem is not None else "Draft"

        # Extract Folder to suite mapping
        folder_elem = tc_elem.find('folder')
        folder_path = folder_elem.text if folder_elem is not None else ""

        suite_id = await get_or_create_suite(db, project_id, folder_path, suite_cache)

        # Extract Tags (customFields) and Labels
        tags_list = []
        for cf in tc_elem.findall('.//customField'):
            cf_name = cf.get('name')
            cf_val = cf.find('value')
            if cf_name and cf_val is not None and cf_val.text:
                tags_list.append(f"{cf_name}:{cf_val.text}")

        labels_list = []
        for label in tc_elem.findall('.//label'):
            if label.text:
                labels_list.append(label.text)

        tags_json = json.dumps(tags_list, ensure_ascii=False) if tags_list else None
        labels_json = json.dumps(labels_list, ensure_ascii=False) if labels_list else None

        # Extract Jira Issues
        jira_keys = []
        for issue in tc_elem.findall('.//issue/key'):
            if issue.text:
                jira_keys.append(issue.text)
        jira_keys_str = ",".join(jira_keys) if jira_keys else None

        # Parse Steps (and rehome any embedded Zephyr <img> URLs to local uploads)
        steps_elems = tc_elem.findall('.//step')
        parsed_steps = []
        for i, step_elem in enumerate(steps_elems):
            action = step_elem.find('description')
            expected = step_elem.find('expectedResult')
            test_data = step_elem.find('testData')
            action_text = action.text if action is not None and action.text else "No action specified"
            expected_text = expected.text if expected is not None else ""
            data_text = test_data.text if test_data is not None else ""
            action_text = await rehome_zephyr_images(action_text, image_client, image_cache) or action_text
            expected_text = await rehome_zephyr_images(expected_text, image_client, image_cache) or expected_text
            data_text = await rehome_zephyr_images(data_text, image_client, image_cache) or data_text
            parsed_steps.append(dict(
                order=i + 1,
                action=action_text,
                expected_result=expected_text,
                data=data_text,
            ))

        # Duplicate handling using pre-fetched map
        existing_case = existing_map.get(key) if key else None

        if existing_case:
            if strategy == "skip":
                skipped_count += 1
                skipped_keys.append(key)
                continue
            else:  # overwrite
                existing_case.title = title
                existing_case.description = description
                existing_case.preconditions = preconditions
                existing_case.priority = priority
                existing_case.tags = tags_json
                existing_case.labels = labels_json
                existing_case.jira_keys = jira_keys_str
                existing_case.suite_id = suite_id
                existing_case.version = existing_case.version + 1
                # Replace steps: archive old, bulk insert new
                for old_step in existing_case.steps:
                    old_step.status = "Archived"
                db.add_all([
                    TestStep(test_case_id=existing_case.id, **s) for s in parsed_steps
                ])
                overwritten_count += 1
                continue

        # Build new TestCase
        db_case = TestCase(
            suite_id=suite_id,
            title=title,
            description=description,
            preconditions=preconditions,
            priority=priority,
            status=status,
            external_id=key,
            tags=tags_json,
            labels=labels_json,
            jira_keys=jira_keys_str,
        )
        for s in parsed_steps:
            db_case.steps.append(TestStep(**s))

        cases_to_add.append(db_case)
        imported_count += 1

        # Flush every 100 cases to avoid memory blob issues
        if imported_count % 100 == 0:
            db.add_all(cases_to_add)
            await db.commit()
            cases_to_add = []

    # Final flush
    if cases_to_add:
        db.add_all(cases_to_add)
    await db.commit()

    rehomed_images = sum(
        1 for v in image_cache.values()
        if v.startswith("/api/v1/uploads/static/")
    )
    return rehomed_images, imported_count, skipped_count, skipped_keys, overwritten_count
