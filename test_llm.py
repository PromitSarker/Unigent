import os
from dotenv import load_dotenv
load_dotenv()
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import SecretStr

try:
    print("API KEY:", os.getenv('GEMINI_API_KEY'))
    llm = ChatGoogleGenerativeAI(
        model=os.getenv('GEMINI_MODEL') or 'gemini-1.5-flash',
        api_key=os.getenv('GEMINI_API_KEY')
    )
    res = llm.invoke('Hello')
    print('Response:', res.content)
except Exception as e:
    import traceback
    traceback.print_exc()
