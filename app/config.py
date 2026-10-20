"""환경 변수와 고정 값. 다른 모듈은 여기서만 설정을 읽는다.

프로젝트 루트의 .env를 읽는다. 이미 설정된 환경 변수가 있으면 그쪽이 우선.
"""
import os

from dotenv import load_dotenv

load_dotenv()

# 인증. JWT_SECRET_KEY는 기본값이 없다 — 비어 있으면 앱이 뜨지 않는다 (app/main.py)
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

# 저장소: MariaDB (docker-compose.yml)
DATABASE_URL = os.getenv(
    "DATABASE_URL", "mariadb+pymysql://app:app_password@localhost:3306/app_db?charset=utf8mb4")
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
MAX_TASK_CHARS = 2000   # 사용자 요청 길이 (MariaDB TEXT 64KB 안쪽)

