import asyncio
import httpx
import json
import sqlite3

# --- 配置 ---
BASE_URL = "http://localhost:8085/api/v1"
DB_PATH = "/Users/lance.chien/workspace/kkday-qa-ai/kk_tcms_1.5/backend/tcms_1_5.db"

async def verify():
    print("🧪 開始驗證『零刪除』安全更新機制...")
    
    async with httpx.AsyncClient() as client:
        # 1. 創立一個測試案例
        print("\n1. 建立測試案例...")
        create_payload = {
            "title": "Safe Update Verification",
            "suite_id": 1,
            "steps": [
                {"action": "Step 1", "data": "Data 1", "expected_result": "Result 1", "order": 1},
                {"action": "Step 2", "data": "Data 2", "expected_result": "Result 2", "order": 2}
            ]
        }
        res = await client.post(f"{BASE_URL}/cases/", json=create_payload)
        case = res.json()
        case_id = case["id"]
        print(f"✅ 建立成功, ID: {case_id}, 初始步驟數: {len(case['steps'])}")

        # 2. 更新案例：修改 Step 1, 移除 Step 2, 新增 Step 3
        print("\n2. 執行智慧更新 (Smart Update)...")
        step1_id = case["steps"][0]["id"]
        update_payload = {
            "title": "Safe Update Verification - Updated",
            "steps": [
                {"id": step1_id, "action": "Step 1 - Modified", "order": 1}, # 修改
                {"action": "Step 3 - New", "order": 2}                      # 新增
            ]
        }
        # 注意：Step 2 被移除了
        res = await client.put(f"{BASE_URL}/cases/{case_id}", json=update_payload)
        updated_case = res.json()
        print(f"✅ 更新成功, 顯示步驟數: {len(updated_case['steps'])}")
        for i, s in enumerate(updated_case["steps"]):
            print(f"   - Step {i+1}: {s['action']} (ID: {s['id']})")

        # 3. 資料庫深度檢查 (直接檢查 SQLite)
        print("\n3. 檢查資料庫物理狀態 (SQL Check)...")
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # 檢查該案例的所有步驟 (包含被標記為 Archived 的)
        cursor.execute("SELECT id, action, status FROM tcms_test_steps WHERE test_case_id = ?", (case_id,))
        rows = cursor.fetchall()
        print(f"📊 資料庫實體記錄總數: {len(rows)}")
        for row in rows:
            print(f"   - Row ID {row[0]}: {row[1]} | Status: {row[2]}")
            
        # 驗證是否真的沒有刪除
        if len(rows) == 3: # 1 (modified) + 1 (archived) + 1 (new)
            print("\n🌟 驗證通過：所有記錄皆保留，『零刪除』機制生效！")
        else:
            print(f"\n❌ 驗證失敗：預期 3 筆記錄，實際為 {len(rows)} 筆。")
            
        conn.close()

if __name__ == "__main__":
    asyncio.run(verify())
