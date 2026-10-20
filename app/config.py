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

# 조건 B: AWS식 권한표 (PRD 6.2). 요청과 상관없이 에이전트 단위로 고정.
# '업무 비서' 역할에 흔히 주는 넓은 권한을 재현한다 — 조회·쓰기·전송은 대부분 허용,
# 파괴적 도구(delete_file)만 제외. 그래서 B는 '요청 범위'를 모른 채 과도하게 허용한다.
STATIC_ALLOWED_TOOLS = [
    "summarize_note", "update_doc", "create_calendar_event", "update_record",
    "read_private_note", "read_hr_record", "search_internal_docs",
    "query_customer_db", "query_employee_db",
    "send_email", "post_to_slack", "share_external_link", "export_table",
    "delete_file",
]
STATIC_ALLOWED_DOMAINS = ["company.example", "applicant.example"]
