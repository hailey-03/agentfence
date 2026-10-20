"""도구 카탈로그 (PRD 5.2). Mock 도구·Bedrock 도구 정의·도구 목록 API가 모두 이 목록을 쓴다.

설계 원칙:
- AI에게 '날것의 SQL' 같은 넓은 권한을 주지 않는다. 대상을 인자로 콕 집어 받는 '좁은 도구'만 노출한다.
- run_sql·drop_table 같은 위험 도구는 카탈로그에 아예 없어서, 호출하려 해도 실행되지 않고 '알 수 없는 도구' 오류만 돌아간다.
- 위험 등급(risk)은 화면 표시와 분류용이다: 내부 쓰기 / 민감 읽기 / 외부 전송 / 파괴적.
"""
from typing import Any

TOOLS: dict[str, dict[str, Any]] = {
    # ---------- 내부 쓰기 (WRITE_INTERNAL) ----------
    "summarize_note": {
        "risk": "WRITE_INTERNAL",
        "description": "요약을 사용자의 노트에 저장한다.",
        "params": {"title": "노트 제목", "content": "저장할 내용"},
    },
    "update_doc": {
        "risk": "WRITE_INTERNAL",
        "description": "사내 문서나 위키 페이지에 내용을 추가·수정한다.",
        "params": {"doc_id": "문서 ID", "content": "추가·수정할 내용"},
    },
    "create_calendar_event": {
        "risk": "WRITE_INTERNAL",
        "description": "일정을 캘린더에 등록한다.",
        "params": {"title": "일정 제목", "date": "날짜(YYYY-MM-DD)", "attendees": "참석자 이메일"},
    },
    "update_record": {
        "risk": "WRITE_INTERNAL",
        "description": "데이터베이스의 특정 레코드 한 건을 수정한다.",
        "params": {"record_id": "레코드 ID", "field": "바꿀 필드", "value": "새 값"},
    },
    # ---------- 민감 읽기 (READ_SENSITIVE) ----------
    "read_private_note": {
        "risk": "READ_SENSITIVE",
        "description": "사용자의 비공개 메모를 검색해 내용을 돌려준다.",
        "params": {"query": "찾을 메모 이름이나 키워드"},
    },
    "read_hr_record": {
        "risk": "READ_SENSITIVE",
        "description": "직원의 인사 기록(평가·급여 등)을 조회한다.",
        "params": {"employee_id": "직원 ID"},
    },
    "search_internal_docs": {
        "risk": "READ_SENSITIVE",
        "description": "사내 문서를 검색해 관련 내용을 돌려준다.",
        "params": {"query": "검색어"},
    },
    "query_customer_db": {
        "risk": "READ_SENSITIVE",
        "description": "고객 한 명의 정보(연락처·거래 내역)를 조회한다.",
        "params": {"customer_id": "고객 ID"},
    },
    "query_employee_db": {
        "risk": "READ_SENSITIVE",
        "description": "직원 한 명의 정보(부서·연락처)를 조회한다.",
        "params": {"employee_id": "직원 ID"},
    },
    # ---------- 외부 전송 (EXTERNAL) ----------
    "send_email": {
        "risk": "EXTERNAL",
        "description": "지정한 주소로 이메일을 보낸다. 여러 주소는 쉼표로 구분한다.",
        "params": {"to": "받는 사람 이메일", "subject": "제목", "body": "본문"},
    },
    "post_to_slack": {
        "risk": "EXTERNAL",
        "description": "지정한 슬랙 채널에 메시지를 올린다.",
        "params": {"channel": "채널 이름", "text": "올릴 내용"},
    },
    "share_external_link": {
        "risk": "EXTERNAL",
        "description": "문서의 외부 공유 링크를 만든다.",
        "params": {"doc_id": "문서 ID", "recipient": "공유 대상 이메일"},
    },
    "export_table": {
        "risk": "EXTERNAL",
        "description": "데이터베이스 테이블을 파일로 내보내 외부 저장소로 보낸다.",
        "params": {"table": "테이블 이름", "destination": "보낼 위치(이메일·URL)"},
    },
    # ---------- 파괴적 (DESTRUCTIVE) ----------
    "delete_file": {
        "risk": "DESTRUCTIVE",
        "description": "지정한 파일을 삭제한다.",
        "params": {"file_id": "삭제할 파일 ID"},
    },
}


def input_schema(tool: str) -> dict:
    """JSON Schema. 모든 인자는 필수 문자열이다."""
    params = TOOLS[tool]["params"]
    return {
        "type": "object",
        "properties": {k: {"type": "string", "description": d} for k, d in params.items()},
        "required": list(params),
        "additionalProperties": False,
    }


def tool_spec(tool: str) -> dict:
    """Bedrock Converse의 toolConfig.tools 항목 형식."""
    return {"toolSpec": {"name": tool, "description": TOOLS[tool]["description"],
                         "inputSchema": {"json": input_schema(tool)}}}

