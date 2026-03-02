from fastapi import APIRouter
from app.api.projects import router as projects_router
from app.api.test_suites import router as test_suites_router
from app.api.test_cases import router as test_cases_router
from app.api.test_runs import router as test_runs_router

router = APIRouter()

router.include_router(projects_router, prefix="/projects", tags=["Projects"])
router.include_router(test_suites_router, prefix="/suites", tags=["Test Suites"])
router.include_router(test_cases_router, prefix="/cases", tags=["Test Cases"])
router.include_router(test_runs_router, prefix="/runs", tags=["Test Runs"])
from app.api.dashboard import router as dashboard_router
router.include_router(dashboard_router, prefix="/dashboard", tags=["Dashboard"])
from app.api.test_results import router as test_results_router
router.include_router(test_results_router, prefix="/results", tags=["Test Results"])
from app.api.test_run_folders import router as test_run_folders_router
router.include_router(test_run_folders_router, prefix="/run-folders", tags=["Test Run Folders"])
from app.api.zephyr_import import router as zephyr_import_router
router.include_router(zephyr_import_router, prefix="/cases", tags=["Zephyr Import"])

from app.api.users import router as users_router
router.include_router(users_router, prefix="/users", tags=["Users"])

from app.api.test_plans import router as test_plans_router
router.include_router(test_plans_router, prefix="/plans", tags=["Test Plans"])

from app.api.test_plan_folders import router as test_plan_folders_router
router.include_router(test_plan_folders_router, prefix="/plan-folders", tags=["Test Plan Folders"])

from app.api.uploads import router as uploads_router
router.include_router(uploads_router, prefix="/uploads", tags=["Uploads"])

from app.api.dify_sync import router as dify_sync_router
router.include_router(dify_sync_router, prefix="/cases/sync/dify", tags=["Dify Sync"])

from app.api.backup import router as backup_router
router.include_router(backup_router, prefix="/backup", tags=["Backup"])
