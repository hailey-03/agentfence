"""환경 변수와 고정 값. 다른 모듈은 여기서만 설정을 읽는다."""
import os

# 인증
JWT_SECRET = os.getenv("JWT_SECRET", "dev-secret-change-me")
JWT_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "8"))

# 저장소
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./agentfence.db")
WEB_DIST = os.getenv("WEB_DIST", os.path.join(os.path.dirname(__file__), "..", "web", "dist"))

# Bedrock · Guardrails (조건 D)
AWS_REGION = os.getenv("AWS_REGION", "ap-northeast-2")
BEDROCK_MODEL_ID = os.getenv("BEDROCK_MODEL_ID", "")
LLM_MODE = os.getenv("LLM_MODE", "fake")                     # fake | bedrock
PLANNER_TOOL_CHOICE = os.getenv("PLANNER_TOOL_CHOICE", "tool")  # tool | any
GUARDRAIL_ID = os.getenv("GUARDRAIL_ID", "")
GUARDRAIL_VERSION = os.getenv("GUARDRAIL_VERSION", "1")

# 시뮬레이션 제한
MAX_TURNS = 8
MAX_TOOL_CALLS = 8
MAX_TOKENS = 2048
MAX_PDF_BYTES = 10 * 1024 * 1024

