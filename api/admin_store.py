from typing import List, Dict, Any
from agent.db import get_connection

class AdminStore:
	def get_conversations_summary(self) -> List[Dict[str, Any]]:
		# Get latest state of each conversation
		query = """
			SELECT 
				c.conversation_id,
				COUNT(c.id) as message_count,
				MAX(c.created_at) as last_updated,
				MAX(c.escalate) as escalated,
				(SELECT intent FROM conversations c2 WHERE c2.conversation_id = c.conversation_id AND c2.intent IS NOT NULL ORDER BY created_at DESC LIMIT 1) as last_intent,
				(SELECT summary FROM session_summaries s WHERE s.session_id = c.conversation_id) as session_summary
			FROM conversations c
			GROUP BY c.conversation_id
			ORDER BY last_updated DESC
		"""
		with get_connection() as conn:
			cur = conn.execute(query)
			rows = cur.fetchall()

		return [dict(row) for row in rows]

	def get_collected_data(self) -> List[Dict[str, Any]]:
		query = """
			SELECT id, session_id, key, value, created_at
			FROM collected_data
			ORDER BY created_at DESC
		"""
		with get_connection() as conn:
			cur = conn.execute(query)
			rows = cur.fetchall()
		
		return [dict(row) for row in rows]
		
	def get_auth_codes(self) -> List[Dict[str, Any]]:
		query = """
			SELECT id, email, code, created_at
			FROM user_auth_codes
			ORDER BY created_at DESC
		"""
		with get_connection() as conn:
			cur = conn.execute(query)
			rows = cur.fetchall()
			
		return [dict(row) for row in rows]

admin_store = AdminStore()
