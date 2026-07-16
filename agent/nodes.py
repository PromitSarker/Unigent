import re
from datetime import date
from typing import Any, Dict, List, Optional

from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage, ToolMessage

from agent.config import GROQ_API_KEY, GROQ_MODEL
from agent.state import AgentState
from agent.tools import (
	escalate,
	search_knowledge_base,
	save_collected_information,
	send_verification_email
)
from api.store import conversation_store


# Tool-calling LLM — used by call_model_node to decide which tool to invoke
_LLM_WITH_TOOLS: Optional[Any] = None
# Plain LLM (no tools) — used by format_response_node to produce friendly text
_LLM_PLAIN: Optional[Any] = None

CONTACT_INFO = """**Direct Contact**
Prefer WhatsApp or phone for quick response.

**Phone**
+880 1712-816563

**Email**
sales@rtcom.bd

**WhatsApp**
Start Chat

**Office**
Mannan Tower (3rd floor), Ka 96/3 Progati Sharani, Dhaka 1229, Bangladesh."""


def _get_llm_with_tools() -> Optional[Any]:
	"""Return the tool-bound LLM, initialising it once."""
	global _LLM_WITH_TOOLS
	if _LLM_WITH_TOOLS is not None:
		return _LLM_WITH_TOOLS

	if not GROQ_API_KEY:
		print("WARNING: GROQ_API_KEY is not set.")
		return None

	try:
		base = ChatGroq(
			model=GROQ_MODEL,
			api_key=GROQ_API_KEY,
			temperature=0,
			max_retries=3,
			timeout=60.0,
		)
		tools = [
			escalate,
			search_knowledge_base, 
			save_collected_information, 
			send_verification_email
		]
		_LLM_WITH_TOOLS = base.bind_tools(tools)
		return _LLM_WITH_TOOLS
	except Exception as e:
		print(f"ERROR: Failed to initialise tool-calling LLM: {str(e)}")
		return None


def _get_plain_llm() -> Optional[Any]:
	"""Return a plain LLM (no tools bound) used only to generate friendly text."""
	global _LLM_PLAIN
	if _LLM_PLAIN is not None:
		return _LLM_PLAIN

	if not GROQ_API_KEY:
		print("WARNING: GROQ_API_KEY is not set.")
		return None

	try:
		_LLM_PLAIN = ChatGroq(
			model=GROQ_MODEL,
			api_key=GROQ_API_KEY,
			temperature=0,
			max_retries=3,
			timeout=60.0,
		)
		return _LLM_PLAIN
	except Exception as e:
		print(f"ERROR: Failed to initialise plain LLM: {str(e)}")
		return None


# System prompt

_SYSTEM_PROMPT_TEMPLATE = """
You are a friendly customer service assistant for RT Communication.
Today's date is {today} ({weekday}).

PERSONALITY & TONE
- You are warm, professional, and conversational.
- Always acknowledge what the user told you before asking for more.
- Ask for missing information naturally, one or two things at a time, woven into a sentence.
- Keep replies concise.
- Never say "successfully saved" or explicitly mention that you are saving data. Just acknowledge what they said and naturally ask the next question.

WHAT YOU CAN HELP WITH
1. **General Enquiries & Knowledge**: If asked general questions, policies, or FAQs about RT Communication (e.g., masking SMS, non-masking SMS, pricing), ALWAYS use the `search_knowledge_base` tool first to find accurate answers.
2. **Bulk Message Services / Lead Generation**: If the user wants to buy SMS services, you must gather their information. Ask for their details naturally. You MUST save the data using EXACTLY these keys:
   - Type (e.g. Masking SMS or Non-masking SMS)
   - Name
   - Designation
   - Company Name & Address
   - Mobile
   - Email
   
   If the user specifically asks for **Masking SMS**, you must also inform them that the following documents will be required. If the user provides a link/URL to a document, you MUST save that URL under these EXACT keys:
   - Trade License
   - NID
   - Passport Size Photo
   - Masking Name
   
   When they provide details (or document URLs), you MUST save ALL of the provided information together in a SINGLE call to the `save_collected_information` tool. Pass a dictionary where the keys are exactly the requested field names, and the values are the user's details. Do not make multiple separate tool calls to save data.
   
   After all details are successfully collected and saved, inform the user of the next steps exactly as follows:
   1. Plan & Pricing - You can check our website to find out which plan suits you.
   2. Account Setup - We will send you an email with a temporary password that you can use to login to rtcom.it.com, our web portal, and browse to see what range of services does your job.
   Do NOT include any other steps (like Onboarding or Go-Live). Do NOT ask how many messages they plan to send each month.
3. **Login / Verification**: If the user needs to login or verify their identity, ask for their email address and use `send_verification_email` to generate and send a temporary password.

DATA RULES (non-negotiable)
- **Service Limitation**: RT Communication ONLY offers Bulk SMS service. We do not offer any other services. If a user asks for other services (internet, voice, marketing, software development, etc.), politely inform them that we strictly only offer Bulk SMS.
- NEVER answer from your own knowledge about policies or prices. ALWAYS call a tool first.
- Reply in plain text only. No markdown formatting.

ESCALATION
If you cannot handle a request, call the `escalate` tool.
""".strip()

_FUNCTION_TAG_RE = re.compile(r"<function=[^>]+>.*?</function>", re.DOTALL)


def _build_system_prompt(session_summary: str = "") -> str:
	"""Return the system prompt with today's real date and optional summary injected."""
	today = date.today()
	prompt = _SYSTEM_PROMPT_TEMPLATE.format(
		today=today.strftime("%Y-%m-%d"),
		weekday=today.strftime("%A"),
	)
	
	if session_summary:
		prompt += f"\n\n--- PREVIOUS SESSION SUMMARY ---\n{session_summary}\n--------------------------------\n"
		
	return prompt


def _clean_response(text: str) -> str:
	"""Strip any raw <function=...> markup the model may have leaked into content text."""
	return _FUNCTION_TAG_RE.sub("", text).strip()


# Graph nodes

def call_model_node(state: AgentState) -> Dict[str, Any]:
	"""Calls the LLM to decide on the next action (tool call or final response)."""
	llm = _get_llm_with_tools()

	if llm is None:
		return {
			"final_response": "The assistant is not available right now. Please try again later.",
			"escalate": True,
		}

	session_summary = state.get("session_summary") or ""
	system_prompt = _build_system_prompt(session_summary)
	messages = [SystemMessage(content=system_prompt)] + state.get("messages", [])

	try:
		response = llm.invoke(messages)
		raw_content = str(getattr(response, "content", "")).strip()
		
		updates: Dict[str, Any] = {
			"messages": [response],
			"final_response": _clean_response(raw_content),
		}

		lowered = updates["final_response"].lower()
		if any(phrase in lowered for phrase in ["human agent", "talk to a person", "connect you with a human"]):
			updates["escalate"] = True

		if hasattr(response, "tool_calls") and response.tool_calls:
			tool_call = response.tool_calls[0]
			tool_name = tool_call["name"]
			updates["extracted_params"] = tool_call.get("args", {})
			updates["missing_fields"] = []
			
			if tool_name == "search_knowledge_base":
				updates["intent"] = "inquiry"
			elif tool_name == "save_collected_information":
				updates["intent"] = "lead"

		return updates

	except Exception as e:
		print(f"ERROR in call_model_node: {e}")
		return {
			"final_response": "I had trouble processing that. Can you try again?",
		}


def execute_tool_node(state: AgentState) -> Dict[str, Any]:
	"""Executes tool calls generated by the LLM and appends ToolMessages to state."""
	messages = state.get("messages", [])
	if not messages:
		return {}

	last_message = messages[-1]

	if not hasattr(last_message, "tool_calls") or not last_message.tool_calls:
		return {}

	tools_map = {
		"escalate": escalate,
		"search_knowledge_base": search_knowledge_base,
		"save_collected_information": save_collected_information,
		"send_verification_email": send_verification_email,
	}

	new_messages: List[ToolMessage] = []
	primary_tool_result: Optional[str] = None

	for tool_call in last_message.tool_calls:
		tool_name = tool_call["name"]
		tool_args = tool_call["args"]
		
		if tool_name in ["save_collected_information", "send_verification_email"]:
			tool_args["session_id"] = state.get("conversation_id", "")
			
		tool_func = tools_map.get(tool_name)

		if tool_func:
			try:
				result = tool_func.invoke(tool_args)
				
				if primary_tool_result is None:
					primary_tool_result = result
				
				new_messages.append(
					ToolMessage(
						content=str(result),
						tool_call_id=tool_call["id"],
					)
				)
			except Exception as e:
				new_messages.append(
					ToolMessage(
						content=f"ERROR: Tool execution failed: {str(e)}",
						tool_call_id=tool_call["id"],
					)
				)

	updates: Dict[str, Any] = {"messages": new_messages}
	
	if any(tc["name"] == "escalate" for tc in last_message.tool_calls):
		updates["escalate"] = True

	if primary_tool_result is not None:
		updates["tool_result"] = primary_tool_result

	return updates


def format_response_node(state: AgentState) -> Dict[str, Any]:
	"""Called after tool execution — uses a plain LLM to convert raw tool output into a friendly reply."""
	if state.get("escalate"):
		return {"final_response": f"I am connecting you to a human agent who can assist with this request.\n\n{CONTACT_INFO}"}

	messages = state.get("messages", [])
	if not messages:
		return {}

	last_message = messages[-1]

	if not isinstance(last_message, ToolMessage):
		return {}

	llm = _get_plain_llm()
	
	if llm is None:
		return {"final_response": str(last_message.content)}

	session_summary = state.get("session_summary") or ""
	system_prompt = _build_system_prompt(session_summary)
	
	formatter_prompt = """You have just received the result of an internal system action.
Your task is to provide a conversational response to the user based on the conversation history.

RULES:
1. DO NOT output any tool calls or JSON. Provide a plain text conversational reply ONLY.
2. If the tool result says 'Successfully saved', DO NOT repeat this. Just naturally acknowledge their input and continue the conversation.
3. If collecting user details (Name, Designation, Company Name & Address, Mobile, Email), naturally ask for the next missing piece of information.
4. If the tool result indicates all details were successfully saved for Bulk Message Services, inform the user of the next steps exactly as follows:
   - Plan & Pricing - You can check our website to find out which plan suits you.
   - Account Setup - We will send you an email with a temporary password that you can use to login to rtcom.it.com, our web portal, and browse to see what range of services does your job.
   Do NOT include any other steps like Onboarding or Go-Live. Do NOT ask how many messages they plan to send each month.
5. STRICTLY ADHERE TO THE DATA RULES: RT Communication ONLY offers Bulk SMS service. Never offer or list any other services.
"""

	clean_messages = []
	for m in messages:
		if isinstance(m, ToolMessage):
			content = str(m.content)
			if "Successfully saved" in content:
				content = "The user's details were securely saved to the database. Acknowledge this naturally and proceed to the next step."
			clean_messages.append(SystemMessage(content=f"System Info: {content}"))
		elif isinstance(m, AIMessage):
			clean_content = str(m.content) if m.content else ""
			clean_messages.append(AIMessage(content=clean_content.strip() or "Processed action."))
		else:
			clean_messages.append(m)

	all_messages = [SystemMessage(content=system_prompt)] + clean_messages + [SystemMessage(content=formatter_prompt)]

	try:
		response = llm.invoke(all_messages)
		final_text = str(getattr(response, "content", "")).strip()
		
		if not final_text:
			# Fallback if LLM returns empty
			if "Successfully saved" in str(last_message.content):
				return {"final_response": "I've recorded that information. Let's move forward."}
			return {"final_response": "I have the information."}
		
		return {
			"messages": [response],
			"final_response": final_text,
		}
	except Exception as e:
		print(f"ERROR in format_response_node: {e}")
		if "Successfully saved" in str(last_message.content):
			return {"final_response": "I've recorded that information. Let's move forward."}
		return {"final_response": "I have the information."}


def escalate_to_human_node(state: AgentState) -> Dict[str, Any]:
	"""Hard handoff node — signals that a human agent should take over."""
	# If LLM failed, final_response is already set to "The assistant is not available..."
	current_response = state.get("final_response", "")
	if not current_response or "connecting you to a human" in current_response:
		prefix = "I am connecting you to a human agent who can assist with this request."
	else:
		prefix = current_response

	return {
		"escalate": True,
		"final_response": f"{prefix}\n\n{CONTACT_INFO}",
	}


def summarize_conversation_node(state: AgentState) -> Dict[str, Any]:
	"""Summarizes the conversation to maintain a rolling context."""
	messages = state.get("messages", [])
	# Only summarize if there are a reasonable number of messages
	if len(messages) < 6:
		return {}
		
	session_id = state.get("conversation_id")
	if not session_id:
		return {}
		
	current_summary = state.get("session_summary", "")
	
	llm = _get_plain_llm()
	if llm is None:
		return {}
		
	summary_prompt = (
		"Summarize the following conversation segment. Focus on user preferences, "
		"gathered information, and intent. If there is an existing summary, "
		"update it with the new details. Keep it concise.\n\n"
		f"Existing summary: {current_summary}\n\n"
		"New conversation lines:\n"
	)
	
	for m in messages:
		role = "User" if isinstance(m, HumanMessage) else "Assistant" if isinstance(m, AIMessage) else "Tool"
		summary_prompt += f"{role}: {m.content}\n"
		
	try:
		response = llm.invoke([HumanMessage(content=summary_prompt)])
		new_summary = str(getattr(response, "content", "")).strip()
		
		if new_summary:
			conversation_store.update_session_summary(session_id, new_summary)
			return {"session_summary": new_summary}
	except Exception as e:
		print(f"Failed to summarize: {e}")
		
	return {}
