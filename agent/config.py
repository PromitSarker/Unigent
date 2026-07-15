from os import getenv

from dotenv import load_dotenv

load_dotenv()

DB_FILE = (getenv("DB_FILE") or "stayease.db").strip()
GROQ_API_KEY = (getenv("GROQ_API_KEY") or "").strip()
GROQ_MODEL = (getenv("GROQ_MODEL") or "llama-3.3-70b-versatile").strip()

SMTP_SERVER = getenv("SMTP_SERVER", "")
SMTP_PORT = int(getenv("SMTP_PORT", "587"))
SMTP_USERNAME = getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = getenv("SMTP_PASSWORD", "")
RESEND_API_KEY = getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")

if not GROQ_MODEL:
    raise RuntimeError("GROQ_MODEL must be a non-empty string.")
