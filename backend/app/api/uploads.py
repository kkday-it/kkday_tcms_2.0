from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
import shutil
import os
import uuid
from typing import Dict

router = APIRouter()
UPLOAD_DIR = "uploads"

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/")
async def upload_file(file: UploadFile = File(...)) -> Dict[str, str]:
    is_image = file.content_type and file.content_type.startswith("image/")
    is_xmind = file.filename and file.filename.endswith(".xmind")
    
    if not (is_image or is_xmind):
        raise HTTPException(status_code=400, detail="File must be an image or an .xmind file")
    
    # Generate unique filename
    ext = os.path.splitext(file.filename)[1] if file.filename else ""
    if not ext:
        ext = ".png" if is_image else ".xmind"
    unique_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    
    # Save file
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
        
    # Return the URL path
    return {"url": f"/api/v1/uploads/static/{unique_filename}"}


@router.get("/static/{filename}")
async def serve_upload(filename: str):
    """Serve an uploaded file (image / .xmind).

    Replaces the previous `app.mount("/api/v1/uploads/static", StaticFiles(...))`:
    with root_path="/tcms" set, the Starlette mount stopped matching behind the
    reverse proxy (regular routes still worked), so every stored
    `/api/v1/uploads/static/<file>` URL returned 404 while the file sat untouched
    on disk. A normal route shares the same routing path as the rest of the API,
    so it resolves correctly. Stored mindmap_url / image URLs are unchanged.
    """
    # Reject any path-traversal attempt: only a bare filename is allowed.
    if filename != os.path.basename(filename) or os.path.sep in filename or (os.path.altsep and os.path.altsep in filename):
        raise HTTPException(status_code=400, detail="Invalid filename")

    file_path = os.path.join(UPLOAD_DIR, filename)
    # Defensive: ensure the resolved path stays inside UPLOAD_DIR.
    real_root = os.path.realpath(UPLOAD_DIR)
    real_path = os.path.realpath(file_path)
    if os.path.commonpath([real_root, real_path]) != real_root:
        raise HTTPException(status_code=400, detail="Invalid filename")

    if not os.path.isfile(real_path):
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(real_path, filename=filename)
