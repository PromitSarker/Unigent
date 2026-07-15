from typing import Any, Dict, List, Union

from langchain_core.tools import tool
from pydantic import BaseModel

from agent.db import get_connection


@tool
def escalate(reason: str) -> str:
	"""
	Use this tool when the user has a complex request, complaint, or wants to talk to a human.
	It will signal the system to transfer the conversation to a human support agent.
	
	Why it's needed: Bots shouldn't handle arguments or disputes! This acts like an "emergency exit"
	button for the LLM to easily hand the interaction over to real customer support.
	"""
	return "I am connecting you to a human agent who can assist with this request. They will be with you shortly!"


@tool
def search_knowledge_base(query: str) -> str:
	"""
	Search the knowledge base for general information, policies, or FAQs.
	
	Why it's needed: Use this when the user asks a general question about RT Communication, its services, policies, or pricing.
	"""
	from agent.rag import search_documents
	return search_documents(query)


class SaveCollectedInformationInput(BaseModel):
	key: str
	value: str
	session_id: str = "" # Injected by the system, LLM does not need to provide this.


@tool(args_schema=SaveCollectedInformationInput)
def save_collected_information(key: str, value: str, session_id: str = "") -> str:
	"""
	Save a specific piece of information gathered from the user (e.g., for bulk message services, lead gen, etc).
	Do NOT provide session_id, it is injected automatically.
	
	Why it's needed: When the user wants to buy a service or provide their information, use this tool to securely store it key by key.
	"""
	if not session_id:
		return "ERROR: session_id is missing."
	
	query = """
		INSERT INTO collected_data (session_id, key, value)
		VALUES (?, ?, ?)
	"""
	try:
		with get_connection() as conn:
			conn.execute(query, (session_id, key, value))
			conn.commit()
		return f"Successfully saved {key}."
	except Exception as e:
		return f"ERROR: Could not save information: {str(e)}"


class SendVerificationEmailInput(BaseModel):
	email: str


@tool(args_schema=SendVerificationEmailInput)
def send_verification_email(email: str) -> str:
	"""
	Generate a temporary password (verification code) and send it to the user's email.
	
	Why it's needed: When a user provides their email to log in or verify their identity, this tool generates a secure code and emails it to them.
	"""
	import random
	import string
	import resend
	from agent.config import RESEND_API_KEY
	
	# Generate 6-character random code
	code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
	
	# Save to DB
	query = "INSERT INTO user_auth_codes (email, code) VALUES (?, ?)"
	try:
		with get_connection() as conn:
			conn.execute(query, (email, code))
			conn.commit()
	except Exception as e:
		return f"ERROR: Could not save verification code: {str(e)}"
	
	# Try sending email
	if RESEND_API_KEY:
		try:
			from agent.config import RESEND_FROM_EMAIL
			resend.api_key = RESEND_API_KEY
			params = {
				"from": f"RT Communication <{RESEND_FROM_EMAIL}>",
				"to": [email],
				"subject": "RT Communication Verification Code",
				"text": f"Hello,\n\nYour temporary password / verification code is: {code}\n\nThank you,\nRT Communication"
			}
			resend.Emails.send(params)
			return "Verification code successfully sent to email."
		except Exception as e:
			print(f"Failed to send email via Resend: {e}")
			return f"Code generated ({code}) but failed to send email due to Resend API error."
	else:
		print(f"MOCK EMAIL SENT TO {email}: Code is {code}")
		return "Verification code successfully generated and mock-sent (Resend API key not configured)."
