import os
import sqlite3
from contextlib import contextmanager
from typing import Generator

from agent.config import DB_FILE

def initialize_db():
    if not os.path.exists(DB_FILE):
        print(f"Initializing database {DB_FILE} from schema...")
        
    # We always run the schema to ensure IF NOT EXISTS tables are created
    schema_path = os.path.join(os.path.dirname(__file__), "..", "sql", "schema.sql")
    if os.path.exists(schema_path):
        with open(schema_path, "r", encoding="utf-8") as f:
            schema_script = f.read()
            
        with sqlite3.connect(DB_FILE) as conn:
            conn.executescript(schema_script)

@contextmanager
def get_connection() -> Generator[sqlite3.Connection, None, None]:
    conn = sqlite3.connect(DB_FILE, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()

# Initialize schema when this module is loaded
initialize_db()
