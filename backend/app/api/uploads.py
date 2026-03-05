from fastapi import APIRouter, UploadFile, File, HTTPException
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
