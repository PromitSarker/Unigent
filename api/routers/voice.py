from fastapi import APIRouter, UploadFile, File, HTTPException, WebSocket, WebSocketDisconnect
import google.generativeai as genai
from agent.config import GEMINI_API_KEY, GEMINI_MODEL
import os
import tempfile
import json
import asyncio
import base64
import websockets

router = APIRouter(prefix="/voice", tags=["voice"])

LIVE_MODEL = "models/gemini-2.0-flash-exp"
HOST = "generativelanguage.googleapis.com"
WS_URL = f"wss://{HOST}/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key={GEMINI_API_KEY}"

@router.websocket("/stream")
async def websocket_endpoint(websocket: WebSocket):
    if not GEMINI_API_KEY:
        await websocket.close(code=1011, reason="GEMINI_API_KEY is not configured")
        return

    await websocket.accept()

    try:
        async with websockets.connect(WS_URL) as gemini_ws:
            setup_msg = {
                "setup": {
                    "model": LIVE_MODEL,
                    "generationConfig": {
                        "responseModalities": ["AUDIO"],
                        "speechConfig": {
                            "voiceConfig": {
                                "prebuiltVoiceConfig": {
                                    "voiceName": "Aoede" 
                                }
                            }
                        }
                    }
                }
            }
            await gemini_ws.send(json.dumps(setup_msg))
            setup_response = await gemini_ws.recv()
            
            async def receive_from_frontend():
                try:
                    while True:
                        data = await websocket.receive()
                        if "bytes" in data:
                            base64_audio = base64.b64encode(data["bytes"]).decode("utf-8")
                            realtime_input = {
                                "realtimeInput": {
                                    "mediaChunks": [
                                        {
                                            "mimeType": "audio/pcm;rate=16000",
                                            "data": base64_audio
                                        }
                                    ]
                                }
                            }
                            await gemini_ws.send(json.dumps(realtime_input))
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    print(f"Error receiving from frontend: {e}")

            async def receive_from_gemini():
                try:
                    async for message in gemini_ws:
                        msg_data = json.loads(message)
                        if "serverContent" in msg_data:
                            server_content = msg_data["serverContent"]
                            if "modelTurn" in server_content:
                                parts = server_content["modelTurn"].get("parts", [])
                                for part in parts:
                                    if "inlineData" in part and part["inlineData"]["mimeType"].startswith("audio/pcm"):
                                        audio_base64 = part["inlineData"]["data"]
                                        audio_bytes = base64.b64decode(audio_base64)
                                        await websocket.send_bytes(audio_bytes)
                            if server_content.get("interrupted"):
                                await websocket.send_json({"type": "interrupted"})
                except Exception as e:
                    print(f"Error receiving from Gemini: {e}")

            await asyncio.gather(
                receive_from_frontend(),
                receive_from_gemini()
            )
            
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        try:
            await websocket.close()
        except:
            pass

@router.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    """Legacy endpoint for transcription"""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is not configured")

    genai.configure(api_key=GEMINI_API_KEY)
    content = await file.read()
    
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio:
        temp_audio.write(content)
        temp_audio_path = temp_audio.name

    audio_file = None
    try:
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
        if audio_file:
            try:
                genai.delete_file(audio_file.name)
            except Exception as cleanup_err:
                pass
        if os.path.exists(temp_audio_path):
            os.remove(temp_audio_path)
