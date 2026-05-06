from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
import xml.etree.ElementTree as ET
import json
from typing import Optional

from app.db.database import get_db
from app.models.test_case import TestCase
from app.models.test_suite import TestSuite
from app.models.test_step import TestStep

router = APIRouter()

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

        precond_elem = tc_elem.find('precondition')
        preconditions = precond_elem.text if precond_elem is not None else ""

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

        # Parse Steps
        steps_elems = tc_elem.findall('.//step')
        parsed_steps = []
        for i, step_elem in enumerate(steps_elems):
            action = step_elem.find('description')
            expected = step_elem.find('expectedResult')
            test_data = step_elem.find('testData')
            parsed_steps.append(dict(
                order=i + 1,
                action=action.text if action is not None and action.text else "No action specified",
                expected_result=expected.text if expected is not None else "",
                data=test_data.text if test_data is not None else "",
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

    return {
        "message": f"Successfully imported {imported_count} test cases",
        "imported_count": imported_count,
        "skipped_count": skipped_count,
        "skipped_keys": skipped_keys,
        "overwritten_count": overwritten_count,
    }
