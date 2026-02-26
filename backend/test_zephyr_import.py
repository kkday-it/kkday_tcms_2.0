import httpx
import asyncio

async def main():
    with open('/Users/lance.chien/Documents/antigravity/kkday-qa-ai/kk_tcms_1.5/docs/atm-exporter.xml', 'rb') as f:
        files = {'file': f}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post('http://127.0.0.1:8000/api/v1/cases/import/zephyr?project_id=1', files=files)
            print(response.status_code)
            print(response.json())

if __name__ == "__main__":
    asyncio.run(main())
