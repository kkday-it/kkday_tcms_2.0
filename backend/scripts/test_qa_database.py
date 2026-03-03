#!/usr/bin/env python3
"""Test get_secret with qa_database (remote DB config)."""
import os
import sys
from pathlib import Path

# Load .env
_root = Path(__file__).resolve().parents[1]
tcms_env = _root / ".env"
if tcms_env.exists():
    from dotenv import load_dotenv
    load_dotenv(tcms_env)

sys.path.insert(0, str(_root))


def main():
    from app.core.secrets import get_secret

    print("Fetching qa_database...")
    try:
        data = get_secret(key="qa_database", return_value=True)
        if data is None:
            print("No data returned")
            return 1

        keys = list(data.keys()) if isinstance(data, dict) else []
        print(f"OK. Keys: {keys}")

        for k in keys:
            v = data[k]
            if k.lower() in ("password", "pass", "secret"):
                print(f"  {k}: [REDACTED]")
            elif v:
                print(f"  {k}: {v}")
            else:
                print(f"  {k}: (empty)")

        # Build URL (masked)
        if all(k in data for k in ["host", "user", "database"]):
            from urllib.parse import quote_plus
            user = data.get("user", "")
            pw = data.get("password", "") or data.get("pass", "")
            host = data.get("host", "")
            port = data.get("port", 5432)
            db = data.get("database", "")
            url = f"postgresql+asyncpg://{user}:{quote_plus(pw)}@{host}:{port}/{db}"
            print(f"\n  Built URL (masked): postgresql+asyncpg://{user}:***@{host}:{port}/{db}")
            print("  (URL build OK)")
        return 0
    except Exception as e:
        print(f"Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
