import os
from typing import List

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from agent.config import GEMINI_API_KEY

# Persist directory for ChromaDB
CHROMA_PERSIST_DIR = os.path.join(os.path.dirname(__file__), "..", "chroma_db")

# Initialize embeddings
try:
    _embeddings = GoogleGenerativeAIEmbeddings(
        model="models/text-embedding-004",
        google_api_key=GEMINI_API_KEY
    )

    # Initialize Chroma vector store
    _vectorstore = Chroma(
    	collection_name="rt_comm_knowledge_gemini",
    	embedding_function=_embeddings,
    	persist_directory=CHROMA_PERSIST_DIR
    )
except Exception as e:
    import traceback
    os.makedirs("data", exist_ok=True)
    with open("data/crash.log", "w") as f:
        f.write(traceback.format_exc())
    _vectorstore = None

def add_document(text: str, metadata: dict = None) -> str:
	"""Adds a document to the Chroma vector store and returns the ID."""
	if _vectorstore is None:
		raise RuntimeError("Vector store is not initialized. Check crash.log.")
	import uuid
	doc_id = str(uuid.uuid4())
	
	doc = Document(page_content=text, metadata=metadata or {})
	_vectorstore.add_documents(documents=[doc], ids=[doc_id])
	return doc_id

def delete_document(doc_id: str) -> bool:
	"""Deletes a document from the Chroma vector store by ID."""
	if _vectorstore is None:
		return False
	try:
		_vectorstore.delete(ids=[doc_id])
		return True
	except ValueError:
		# ID not found
		return False

def search_documents(query: str, k: int = 3) -> str:
	"""Searches the vector store and returns a formatted string of results."""
	if _vectorstore is None:
		return "Vector store is offline."
	results = _vectorstore.similarity_search(query, k=k)
	if not results:
		return "No relevant information found in the knowledge base."
	
	formatted = []
	for i, doc in enumerate(results, 1):
		formatted.append(f"Result {i}:\n{doc.page_content}")
	
	return "\n\n".join(formatted)

def list_documents() -> List[dict]:
	"""Returns all documents from the vector store."""
	if _vectorstore is None:
		return []
	results = _vectorstore.get()
	documents = []
	
	if not results or "ids" not in results:
		return documents
		
	for i in range(len(results["ids"])):
		doc_id = results["ids"][i]
		text = results["documents"][i] if "documents" in results and results["documents"] else ""
		metadata = results["metadatas"][i] if "metadatas" in results and results["metadatas"] else {}
		documents.append({
			"id": doc_id,
			"text": text,
			"metadata": metadata
		})
	
	return documents
