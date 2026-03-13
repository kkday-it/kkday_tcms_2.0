import pytest
import allure
from httpx import AsyncClient

pytestmark = pytest.mark.asyncio

@allure.epic("TCMS API")
@allure.feature("安全刪除與還原 (Archiving and Restore)")
class TestSafeDeletion:

    @allure.title("Test Case 封存與還原驗證")
    async def test_case_archive_and_restore(self, client: AsyncClient, suite_id: int):
        # 1. 建立測試案例
        create_res = await client.post("/api/v1/cases/", json={"title": "TC to Archive", "suite_id": suite_id})
        case_id = create_res.json()["id"]
        
        # 2. 驗證在清單中可見
        list_res = await client.get(f"/api/v1/cases/suite/{suite_id}")
        assert any(c["id"] == case_id for c in list_res.json())

        # 3. 執行封存 (原本的 Delete)
        archive_res = await client.delete(f"/api/v1/cases/{case_id}")
        assert archive_res.status_code == 200
        assert "archived" in archive_res.json()["message"]

        # 4. 驗證在清單中已消失 (隱藏)
        list_res_after = await client.get(f"/api/v1/cases/suite/{suite_id}")
        assert not any(c["id"] == case_id for c in list_res_after.json())

        # 5. 驗證資料仍存在 (直接透過 ID 取得不受限，或透過歷史紀錄驗證)
        case_get = await client.get(f"/api/v1/cases/{case_id}")
        assert case_get.json()["status"] == "Archived"

        # 6. 執行還原
        restore_res = await client.post(f"/api/v1/cases/{case_id}/restore")
        assert restore_res.status_code == 200
        assert "restored" in restore_res.json()["message"]

        # 7. 驗證在清單中重新出現
        list_res_final = await client.get(f"/api/v1/cases/suite/{suite_id}")
        assert any(c["id"] == case_id for c in list_res_final.json())
        assert next(c for c in list_res_final.json() if c["id"] == case_id)["status"] == "Active"

    @allure.title("Test Plan 封存與還原驗證")
    async def test_plan_archive_and_restore(self, client: AsyncClient, project_id: int):
        # 1. 建立計畫
        create_res = await client.post("/api/v1/plans/", json={"title": "Plan to Archive", "project_id": project_id})
        plan_id = create_res.json()["id"]

        # 2. 驗證清單
        list_res = await client.get(f"/api/v1/plans/project/{project_id}")
        assert any(p["id"] == plan_id for p in list_res.json())

        # 3. 封存
        await client.delete(f"/api/v1/plans/{plan_id}")

        # 4. 驗證隱藏
        list_res_after = await client.get(f"/api/v1/plans/project/{project_id}")
        assert not any(p["id"] == plan_id for p in list_res_after.json())

        # 5. 還原
        await client.post(f"/api/v1/plans/{plan_id}/restore")

        # 6. 驗證回歸
        list_res_final = await client.get(f"/api/v1/plans/project/{project_id}")
        assert any(p["id"] == plan_id for p in list_res_final.json())

    @allure.title("Test Run 封存與還原驗證")
    async def test_run_archive_and_restore(self, client: AsyncClient, project_id: int):
        # 1. 建立 Run
        create_res = await client.post("/api/v1/runs/", json={"title": "Run to Archive", "project_id": project_id})
        run_id = create_res.json()["id"]

        # 2. 驗證清單
        list_res = await client.get(f"/api/v1/runs/project/{project_id}")
        assert any(r["id"] == run_id for r in list_res.json())

        # 3. 封存
        await client.delete(f"/api/v1/runs/{run_id}")

        # 4. 驗證隱藏
        list_res_after = await client.get(f"/api/v1/runs/project/{project_id}")
        assert not any(r["id"] == run_id for r in list_res_after.json())

        # 5. 還原
        await client.post(f"/api/v1/runs/{run_id}/restore")

        # 6. 驗證回歸
        list_res_final = await client.get(f"/api/v1/runs/project/{project_id}")
        assert any(r["id"] == run_id for r in list_res_final.json())
