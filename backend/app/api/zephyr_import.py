from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
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
        folder_path = "Imported Cases"
        
    if folder_path.startswith("Squad Projects/"):
        folder_path = folder_path[len("Squad Projects/"):]
        if not folder_path:
            folder_path = "Imported Cases"
            
    parts = [p.strip() for p in folder_path.split("/") if p.strip()]
    if not parts:
        parts = ["Imported Cases"]
        
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
async def import_zephyr_xml(project_id: int, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename.endswith('.xml'):
        raise HTTPException(status_code=400, detail="Only XML files are supported")
        
    content = await file.read()
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        raise HTTPException(status_code=400, detail="Invalid XML format")
    
    imported_count = 0
    cases_to_add = []
    suite_cache = {} # Cache suite IDs to prevent N+1 queries
    
    # 1. Parse Test Cases
    for tc_elem in root.findall('.//testCase'):
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
        
        # 2. Extract Folder to suite mapping
        folder_elem = tc_elem.find('folder')
        folder_path = folder_elem.text if folder_elem is not None else ""
        
        suite_id = await get_or_create_suite(db, project_id, folder_path, suite_cache)
            
        # 3. Extract Tags (customFields and labels)
        tags_list = []
        for cf in tc_elem.findall('.//customField'):
            cf_name = cf.get('name')
            cf_val = cf.find('value')
            if cf_name and cf_val is not None and cf_val.text:
                tags_list.append(f"{cf_name}:{cf_val.text}")
                
        for label in tc_elem.findall('.//label'):
            if label.text:
                tags_list.append(label.text)
                
        tags_json = json.dumps(tags_list, ensure_ascii=False) if tags_list else None
        
        # 4. Extract Jira Issues
        jira_keys = []
        for issue in tc_elem.findall('.//issue/key'):
            if issue.text:
                jira_keys.append(issue.text)
        jira_keys_str = ",".join(jira_keys) if jira_keys else None
        
        # 5. Build TestCase Object
        db_case = TestCase(
            suite_id=suite_id,
            title=title,
            description=description,
            preconditions=preconditions,
            priority=priority,
            status=status,
            external_id=key,
            tags=tags_json,
            jira_keys=jira_keys_str
        )
        
        # 6. Parse Steps
        steps_elems = tc_elem.findall('.//step')
        for i, step_elem in enumerate(steps_elems):
            action = step_elem.find('description')
            expected = step_elem.find('expectedResult')
            test_data = step_elem.find('testData')
            
            db_step = TestStep(
                order=i+1,
                action=action.text if action is not None and action.text else "No action specified",
                expected_result=expected.text if expected is not None else "",
                data=test_data.text if test_data is not None else ""
            )
            db_case.steps.append(db_step)
            
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
        "imported_count": imported_count
    }
