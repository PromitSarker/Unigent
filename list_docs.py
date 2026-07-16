import sys
sys.path.append('.')
from agent.rag import list_documents
docs = list_documents()
for d in docs:
	print(f"ID: {d['id']}")
	print(f"Text: {d['text']}")
	print("---")
