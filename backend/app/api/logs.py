"""
即時 log 串流 API（隱藏頁面 tcms/fe-log, tcms/be-log 使用）
"""
import os
import queue
import threading
import time
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

router = APIRouter()

LOG_DIR = os.environ.get("TCMS_LOG_DIR", "/app/logs" if os.environ.get("USE_QA_DATABASE_SECRET") == "true" else os.path.abspath(os.path.join(os.path.dirname(__file__), "../../../logs")))
BE_LOG = os.path.join(LOG_DIR, "backend.log")
# Docker: Nginx writes to access.log (mounted from /var/log/nginx)
# Local:  Vite plugin writes to frontend.log
FE_ACCESS_LOG = os.path.join(LOG_DIR, "access.log")
FE_LOCAL_LOG = os.path.join(LOG_DIR, "frontend.log")


def _tail_file(filepath: str, out_queue: queue.Queue, max_lines: int = 500):
    """在背景 thread 讀取 log 並放入 queue"""
    if not os.path.exists(filepath):
        if "access.log" in filepath or "frontend.log" in filepath:
            out_queue.put("# [INFO] Log 檔案尚未建立。\n")
            out_queue.put("# 本機開發：Vite 啟動後會自動寫入 frontend.log。\n")
            out_queue.put(f"# 預期讀取路徑: {filepath}\n")
        else:
            out_queue.put(f"# Log file not found: {filepath}\n")
        
        # 等待檔案被建立，這樣即使後來才產生 log 檔也能印出來
        while not os.path.exists(filepath):
            time.sleep(2)
            
        out_queue.put(f"\n# [INFO] 檔案已建立: {filepath}，開始即時讀取...\n")

    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        lines = f.readlines()
        for line in lines[-max_lines:]:
            out_queue.put(line)

    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        f.seek(0, 2)
        while True:
            line = f.readline()
            if line:
                out_queue.put(line)
            else:
                time.sleep(0.2)


import asyncio

async def sse_generator(filepath: str):
    """異步 generator，避免佔用 FastAPI 的 threadpool 導致其他 API 卡死"""
    q = queue.Queue()
    t = threading.Thread(target=_tail_file, args=(filepath, q), daemon=True)
    t.start()

    while True:
        try:
            line = q.get_nowait()
        except queue.Empty:
            await asyncio.sleep(1.0)
            yield ": keepalive\n\n"
            continue
        if line is None:
            break
        data = line.rstrip("\n").replace("\n", " ")
        if data:
            yield f"data: {data}\n\n"


@router.get("/stream")
async def stream_logs(
    source: str = Query(..., description="be | fe"),
):
    """SSE 串流 backend 或 frontend(nginx) 的 log"""
    if source == "be":
        filepath = BE_LOG
    elif source == "fe":
        # Prefer Docker/Nginx access.log, then Vite local frontend.log
        if os.path.exists(FE_ACCESS_LOG):
            filepath = FE_ACCESS_LOG
        else:
            filepath = FE_LOCAL_LOG
    else:
        return {"error": "Invalid source. Use 'be' or 'fe'"}

    return StreamingResponse(
        sse_generator(filepath),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
