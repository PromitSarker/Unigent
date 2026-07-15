from fastapi import FastAPI

from api.routers.chat import router as chat_router
from api.routers.documents import router as documents_router


def create_app() -> FastAPI:
	app = FastAPI(
		title="RT Communication API",
		version="1.0.0",
		description="Minimal chat API backed by RT Communication LangGraph agent.",
	)

	app.include_router(chat_router, prefix="/api")
	app.include_router(documents_router, prefix="/api")
	return app


app = create_app()
