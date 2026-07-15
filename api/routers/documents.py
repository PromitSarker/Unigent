from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agent.rag import add_document, delete_document

router = APIRouter(prefix="/documents", tags=["documents"])

class DocumentCreateRequest(BaseModel):
	text: str
	metadata: dict = None

class DocumentResponse(BaseModel):
	id: str
	status: str

@router.post("", response_model=DocumentResponse)
def create_document(payload: DocumentCreateRequest) -> DocumentResponse:
	if not payload.text.strip():
		raise HTTPException(status_code=400, detail="Document text cannot be empty.")
	
	try:
		doc_id = add_document(payload.text, payload.metadata)
		return DocumentResponse(id=doc_id, status="created")
	except Exception as e:
		raise HTTPException(status_code=500, detail=f"Failed to add document: {str(e)}")

@router.delete("/{doc_id}")
def remove_document(doc_id: str):
	success = delete_document(doc_id)
	if not success:
		raise HTTPException(status_code=404, detail="Document not found or could not be deleted.")
	return {"id": doc_id, "status": "deleted"}
