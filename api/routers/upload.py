import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Request

router = APIRouter(prefix="/upload", tags=["upload"])

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("")
async def upload_file(request: Request, file: UploadFile = File(...)):
	try:
		# Generate a unique filename to prevent collisions
		ext = os.path.splitext(file.filename)[1] if file.filename else ""
		unique_filename = f"{uuid.uuid4().hex}{ext}"
		
		file_path = os.path.join(UPLOAD_DIR, unique_filename)
		
		with open(file_path, "wb") as buffer:
			shutil.copyfileobj(file.file, buffer)
			
		# Construct the public URL
		base_url = str(request.base_url).rstrip("/")
		file_url = f"{base_url}/uploads/{unique_filename}"
		
		return {"url": file_url, "filename": file.filename}
	except Exception as e:
		raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")
