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

LOG_DIR = os.environ.get("TCMS_LOG_DIR", "/app/logs")
BE_LOG = os.path.join(LOG_DIR, "backend.log")
FE_ACCESS_LOG = os.path.join(LOG_DIR, "access.log")
FE_ERROR_LOG = os.path.join(LOG_DIR, "error.log")


def _tail_file(filepath: str, out_queue: queue.Queue, max_lines: int = 500):
    """在背景 thread 讀取 log 並放入 queue"""
    if not os.path.exists(filepath):
        out_queue.put(f"# Log file not found: {filepath}\n")
        out_queue.put(None)
        return

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


def sse_generator(filepath: str):
    """同步 generator，在 background thread 執行 tail，主 generator 從 queue 讀取"""
    q = queue.Queue()
    t = threading.Thread(target=_tail_file, args=(filepath, q), daemon=True)
    t.start()

    while True:
        try:
            line = q.get(timeout=1.0)
        except queue.Empty:
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
        filepath = FE_ACCESS_LOG if os.path.exists(FE_ACCESS_LOG) else FE_ERROR_LOG
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
