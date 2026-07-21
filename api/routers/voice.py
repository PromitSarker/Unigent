from fastapi import APIRouter, UploadFile, File, HTTPException
import google.generativeai as genai
from agent.config import GEMINI_API_KEY, GEMINI_MODEL
import os
import tempfile

router = APIRouter(prefix="/voice", tags=["voice"])

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Transcribes an uploaded audio file using Gemini API"""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    genai.configure(api_key=GEMINI_API_KEY)

    # Read file contents
    content = await file.read()
    
    # Save temporarily to pass to the API
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        temp_audio.write(content)
        temp_audio_path = temp_audio.name

    audio_file = None
    try:
        # Upload the file to Gemini API
        audio_file = genai.upload_file(path=temp_audio_path)
        
        model = genai.GenerativeModel(GEMINI_MODEL)
        response = model.generate_content([
            "Please transcribe this audio file accurately. Return only the exact transcription text without any other comments.",
            audio_file
        ])
        
        return {"text": response.text}
        
    except Exception as e:
        print(f"Gemini API Error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to transcribe audio")
        
    finally:
        # Clean up Gemini file
        if audio_file:
            try:
                genai.delete_file(audio_file.name)
            except Exception as cleanup_err:
                print(f"Failed to delete Gemini file: {cleanup_err}")
                
        # Clean up temp file
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
