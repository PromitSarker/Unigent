from fastapi import APIRouter
from typing import List, Dict, Any

from api.admin_store import admin_store

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/conversations")
def get_conversations() -> List[Dict[str, Any]]:
	return admin_store.get_conversations_summary()

@router.get("/collected_data")
def get_collected_data() -> List[Dict[str, Any]]:
	return admin_store.get_collected_data()

@router.get("/auth_codes")
def get_auth_codes() -> List[Dict[str, Any]]:
	return admin_store.get_auth_codes()
