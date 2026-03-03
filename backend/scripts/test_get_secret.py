#!/usr/bin/env python3
"""Test get_secret with production_atlassian (Jira API token)."""
import os
import sys
from pathlib import Path

# Load QA-automation .env if exists (for SERVICE_URL, AUTOMATION_TOKEN)
# workspace/kkday-qa-ai/kk_tcms_1.5/backend/scripts -> workspace = parents[3]
_root = Path(__file__).resolve().parents[3]
qa_env = _root / "kkday-QA-automation" / "QATest" / ".env"
if qa_env.exists():
    from dotenv import load_dotenv
    load_dotenv(qa_env)
    print(f"[Loaded env from {qa_env}]")
# TCMS .env
tcms_env = Path(__file__).resolve().parent.parent / ".env"
if tcms_env.exists():
    from dotenv import load_dotenv
    load_dotenv(tcms_env)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

def main():
    from app.core.secrets import get_secret

    print("Fetching production_atlassian...")
    try:
        data = get_secret(key="production_atlassian", return_value=True)
        if data is None:
            print("No data returned")
            return 1

        # 只顯示 key 名稱，不顯示實際內容
        keys = list(data.keys()) if isinstance(data, dict) else []
        print(f"OK. Keys: {keys}")

        # 驗證 Jira 需要的欄位
        if "api_token" in data:
            print("  api_token: [REDACTED]")
        else:
            print("  api_token: (missing)")
        if "username" in data:
            print(f"  username: {data['username']}")
        else:
            print("  username: (missing)")

        return 0
    except Exception as e:
        print(f"Error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
