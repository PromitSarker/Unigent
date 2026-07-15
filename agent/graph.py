from langgraph.graph import END, StateGraph
from agent.nodes import (
	call_model_node,
	execute_tool_node,
	format_response_node,
	escalate_to_human_node,
	summarize_conversation_node,
)
from agent.state import AgentState


def should_continue(state: AgentState) -> str:
	"""Route after the agent node: tool call → execute_tool, escalate flag → escalate, otherwise summarize."""
	messages = state.get("messages", [])
	if not messages:
		return "summarize"

	last_message = messages[-1]

	# If the LLM produced tool calls, execute them
	if hasattr(last_message, "tool_calls") and last_message.tool_calls:
		return "execute_tool"

	# If escalation was flagged during model call, hand off
	if state.get("escalate"):
		return "escalate"

	return "summarize"


from langgraph.graph.state import CompiledStateGraph

def build_graph() -> CompiledStateGraph:
	"""Build and compile the StayEase agent graph."""
	graph = StateGraph(AgentState)

	graph.add_node("agent", call_model_node)
	graph.add_node("execute_tool", execute_tool_node)
	graph.add_node("format_response", format_response_node)
	graph.add_node("escalate", escalate_to_human_node)
	graph.add_node("summarize", summarize_conversation_node)

	graph.set_entry_point("agent")

	# After the agent decides what to do:
	graph.add_conditional_edges(
		"agent",
		should_continue,
		{
			"execute_tool": "execute_tool",
			"escalate": "escalate",
			"summarize": "summarize",
		},
	)

	# After tools run, format the response into natural language
	graph.add_edge("execute_tool", "format_response")
	graph.add_edge("format_response", "summarize")

	# Escalation goes to summarize before ending
	graph.add_edge("escalate", "summarize")
	
	# Summarize is the final step before END
	graph.add_edge("summarize", END)

	return graph.compile()


agent = build_graph()
