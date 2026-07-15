import os
import sys
from datetime import datetime, timedelta
import sqlite3

# Add parent dir to path so we can import from agent.config
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from agent.config import DB_FILE

def cleanup_old_chats(hours=3):
	"""
	Deletes raw conversation logs older than `hours`.
	Session summaries and collected data are intentionally kept.
	"""
	cutoff = datetime.utcnow() - timedelta(hours=hours)
	
	try:
		conn = sqlite3.connect(DB_FILE)
		
		# Delete rows from conversations table
		query = "DELETE FROM conversations WHERE created_at < ?"
		cur = conn.execute(query, (cutoff,))
		deleted_count = cur.rowcount
		conn.commit()
		
		print(f"[{datetime.utcnow().isoformat()}] Cleanup complete: Deleted {deleted_count} old messages.")
		
		conn.close()
	except Exception as e:
		print(f"Error during cleanup: {e}")

if __name__ == "__main__":
	# Allows overriding the hours via an environment variable or argument
	hours_to_keep = int(os.getenv("RETENTION_HOURS", "3"))
	print(f"Starting chat cleanup. Retention period: {hours_to_keep} hours.")
	cleanup_old_chats(hours=hours_to_keep)
