from os import getenv

from dotenv import load_dotenv

load_dotenv()

DB_FILE = (getenv("DB_FILE") or "data/stayease.db").strip()
GEMINI_API_KEY = (getenv("GEMINI_API_KEY") or "").strip()
GEMINI_MODEL = (getenv("GEMINI_MODEL") or "gemini-1.5-flash").strip()

SMTP_SERVER = getenv("SMTP_SERVER", "")
SMTP_PORT = int(getenv("SMTP_PORT", "587"))
SMTP_USERNAME = getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = getenv("SMTP_PASSWORD", "")
RESEND_API_KEY = getenv("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = getenv("RESEND_FROM_EMAIL", "onboarding@resend.dev")

if not GEMINI_MODEL:
    raise RuntimeError("GEMINI_MODEL must be a non-empty string.")
