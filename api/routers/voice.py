from fastapi import APIRouter, UploadFile, File, HTTPException
import httpx
from agent.config import GROQ_API_KEY
import os
import tempfile

router = APIRouter(prefix="/voice", tags=["voice"])

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribes an uploaded audio file using Groq Whisper API"""
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured")

    # Read file contents
    content = await file.read()
    
    # Save temporarily to pass to the API
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        temp_audio.write(content)
        temp_audio_path = temp_audio.name

    try:
        # Use httpx to call Groq Whisper API (OpenAI compatible)
        async with httpx.AsyncClient() as client:
            with open(temp_audio_path, "rb") as f:
                files = {"file": (file.filename or "audio.webm", f, file.content_type or "audio/webm")}
                data = {"model": "whisper-large-v3"}
                headers = {"Authorization": f"Bearer {GROQ_API_KEY}"}
                
                response = await client.post(
                    "https://api.groq.com/openai/v1/audio/transcriptions",
                    files=files,
                    data=data,
                    headers=headers,
                    timeout=30.0
                )
                
        if response.status_code != 200:
            print(f"Groq API Error: {response.text}")
            raise HTTPException(status_code=500, detail="Failed to transcribe audio")
            
        result = response.json()
        return {"text": result.get("text", "")}
        
    finally:
        # Clean up temp file
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
