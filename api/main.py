from fastapi import FastAPI

from api.routers.chat import router as chat_router
from api.routers.documents import router as documents_router


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
	return app


app = create_app()
