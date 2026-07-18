from fastapi import FastAPI

from api.routers.chat import router as chat_router
from api.routers.documents import router as documents_router
from api.routers.admin import router as admin_router
from api.routers.upload import router as upload_router
from api.routers.voice import router as voice_router

from fastapi.staticfiles import StaticFiles
import os


from fastapi.middleware.cors import CORSMiddleware

def create_app() -> FastAPI:
	app = FastAPI(
		title="RT Communication API",
		version="1.0.0",
		description="Minimal chat API backed by RT Communication LangGraph agent.",
	)

	app.add_middleware(
		CORSMiddleware,
		allow_origins=["*"],
		allow_credentials=True,
		allow_methods=["*"],
		allow_headers=["*"],
	)

	app.include_router(chat_router, prefix="/api")
	app.include_router(documents_router, prefix="/api")
	app.include_router(admin_router, prefix="/api")
	app.include_router(upload_router, prefix="/api")
	app.include_router(voice_router, prefix="/api")
	
	uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
	os.makedirs(uploads_dir, exist_ok=True)
	app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
	
	return app


app = create_app()
