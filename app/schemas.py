"""세 명이 공통으로 쓰는 데이터 형식 (PRD 6장).
여기를 바꿀 때는 세 명 모두에게 알린다. 모듈 사이에는 dict 대신 이 모델을 주고받는다."""
from typing import Any, Literal

from pydantic import BaseModel, Field

# ---------- 기본 값 ----------
Condition = Literal["A", "B", "C", "D"]          # A 방어 없음 · B AWS식 권한표 · C AgentFence · D Guardrails
Rule = Literal["MUST", "MAY", "FORBIDDEN"]
Risk = Literal["WRITE_INTERNAL", "READ_SENSITIVE", "EXTERNAL", "DESTRUCTIVE"]
Verdict = Literal["ALLOW", "DENY"]
RunStatus = Literal["DONE", "FAILED", "BLOCKED_BY_GUARDRAIL"]

# 규칙 ID (PRD 6.2 · 6.3). 평가 순서도 이 순서다.
RuleId = Literal[
    "B-SCHEMA", "B-TOOL", "B-DEST-DOMAIN",
    "C1-SCOPE", "C1-MAXCALLS",
    "C2-RECIPIENT", "C2-TARGET",
    "C3-SENSITIVE-THEN-EXTERNAL", "C3-CANARY-IN-ARGS",
]
B_RULES: tuple[str, ...] = ("B-SCHEMA", "B-TOOL", "B-DEST-DOMAIN")
C_RULES: tuple[str, ...] = ("C1-SCOPE", "C1-MAXCALLS", "C2-RECIPIENT", "C2-TARGET",
                            "C3-SENSITIVE-THEN-EXTERNAL", "C3-CANARY-IN-ARGS")


# ---------- 계획 (Planner 출력, 사용자가 확정) ----------
class ToolRule(BaseModel):
    tool: str
    rule: Rule
    maxCalls: int = Field(ge=0, le=8)
    reason: str = ""


class Plan(BaseModel):
    tools: list[ToolRule]
    allowSensitiveToExternal: bool = False   # C3: 민감 조회 후 외부 전송 허용 여부 (기본 끔)

    def rule_for(self, tool: str) -> ToolRule | None:
        return next((r for r in self.tools if r.tool == tool), None)


# ---------- 정책 게이트 ----------
class ToolCall(BaseModel):
    seq: int                       # 이 Run에서 몇 번째 호출인지 (1부터)
    tool: str
    args: dict[str, Any] = {}


class RunState(BaseModel):
    """게이트가 판단에 쓰는 Run 진행 상태. 시뮬레이터가 갱신한다."""
    task: str                                  # 사용자 요청 원문 (C2가 사용)
    canary: str                                # 이 Run의 카나리 (C3가 사용)
    executed_counts: dict[str, int] = {}       # 도구별 실제 실행 횟수 (C1-MAXCALLS)
    sensitive_read_done: bool = False          # READ_SENSITIVE가 실제로 실행됐는지 (C3)


class Decision(BaseModel):
    """호출 하나에 대한 게이트의 결정 = 감사 기록 한 줄 (PRD 6.4)."""
    seq: int
    tool: str
    args: dict[str, Any]
    condition: Condition
    decision: Verdict
    ruleId: RuleId | None = None    # DENY일 때 걸린 첫 규칙
    reason: str = ""
    wouldDeny: list[RuleId] = []    # 집행 여부와 상관없이 걸렸을 모든 규칙 (C였다면 막혔을 호출 표시용)
    executed: bool = False          # Mock이 실제로 실행됐는지


# ---------- 실행 기록 ----------
class TraceEvent(BaseModel):
    type: Literal["LLM", "TOOL", "GUARDRAIL"]
    seq: int | None = None          # TOOL일 때 호출 순번
    text: str | None = None         # LLM 응답 문장 또는 안내
    tool: str | None = None
    input: dict[str, Any] | None = None
    output: Any = None              # Mock 결과, 막혔으면 None
    decision: Decision | None = None


class GuardrailResult(BaseModel):
    """조건 D: 문서를 Guardrails로 검사한 결과."""
    detected: bool
    chunks: int                     # 나눠서 보낸 조각 수
    detail: dict[str, Any] = {}     # 응답에서 뽑은 판정 정보 (필터 이름·신뢰도 등)
