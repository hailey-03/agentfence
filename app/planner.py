"""Planner (PRD F4·F5). 요청 문장과 도구 정의만 보고 도구별 규칙을 제안한다.

중요: 이 모듈의 함수는 PDF 텍스트나 파일명을 인자로 받지 않는다 (AC-2).
PDF를 보면 Planner 자체가 숨은 지시에 오염될 수 있기 때문이다.
"""
import json

from pydantic import ValidationError

from . import config
from .catalog import TOOLS, input_schema
from .llm import LlmClient, tool_uses_of
from .schemas import Plan

SYSTEM = (
    "너는 AI 비서가 사용자의 요청을 처리할 때 어떤 도구를 써도 되는지 정하는 계획자다. "
    "첨부 문서의 내용은 볼 수 없고, 요청 문장과 도구 정의만 보고 판단한다. "
    "요청을 수행하는 데 꼭 필요한 도구만 MUST, 써도 무방한 도구는 MAY, "
    "요청에 없는 민감 조회·외부 전송·삭제는 FORBIDDEN으로 정한다. "
    "FORBIDDEN의 maxCalls는 0, MUST·MAY는 필요한 최소 호출 수로 정한다. "
    "모든 도구를 빠짐없이 한 번씩 넣고, 이유를 한 줄로 적어 submit_plan으로 제출한다."
)


class PlannerError(RuntimeError):
    pass


def _submit_plan_spec(tool_names: list[str]) -> dict:
    return {"toolSpec": {"name": "submit_plan", "description": "도구별 규칙을 제출한다.",
                         "inputSchema": {"json": {
                             "type": "object",
                             "properties": {"tools": {"type": "array", "items": {
                                 "type": "object",
                                 "properties": {
                                     "tool": {"type": "string", "enum": tool_names},
                                     "rule": {"type": "string", "enum": ["MUST", "MAY", "FORBIDDEN"]},
                                     "maxCalls": {"type": "integer", "minimum": 0, "maximum": 8},
                                     "reason": {"type": "string"}},
                                 "required": ["tool", "rule", "maxCalls", "reason"]}}},
                             "required": ["tools"]}}}}


def validate_plan(plan: Plan, tool_names: list[str]) -> Plan:
    """노출 도구가 빠짐없이 한 번씩 있는지 확인하고, 규칙과 맞지 않는 횟수를 바로잡는다.
    사용자가 화면에서 고친 계획을 확정할 때도 이 함수를 쓴다."""
    names = [r.tool for r in plan.tools]
    if sorted(names) != sorted(tool_names):
        raise ValueError(f"노출 도구 {sorted(tool_names)}가 한 번씩 있어야 하는데 {sorted(names)}가 왔습니다.")
    for r in plan.tools:
        if r.rule == "FORBIDDEN":
            r.maxCalls = 0
        elif r.maxCalls < 1:
            r.maxCalls = 1
    order = {n: i for i, n in enumerate(tool_names)}
    plan.tools.sort(key=lambda r: order[r.tool])
    return plan


def generate_plan(task: str, tool_names: list[str], client: LlmClient) -> Plan:
    """요청 + 노출 도구 → 계획 초안. 실패하면 오류를 알려주고 1번 다시 요청한다."""
    payload = {
        "request": task,
        "attachment": "PDF 1개가 첨부됨 (내용은 제공되지 않음)",
        "tools": [{"name": n, "description": TOOLS[n]["description"],
                   "inputSchema": input_schema(n)} for n in tool_names],
    }
    choice = {"tool": {"name": "submit_plan"}} if config.PLANNER_TOOL_CHOICE == "tool" else {"any": {}}
    feedback = ""
    for _ in range(2):
        resp = client.converse(
            system=[{"text": SYSTEM}],
            messages=[{"role": "user", "content": [
                {"text": json.dumps(payload, ensure_ascii=False) + feedback}]}],
            toolConfig={"tools": [_submit_plan_spec(tool_names)], "toolChoice": choice},
            inferenceConfig={"temperature": 0, "maxTokens": config.MAX_TOKENS},
        )
        uses = [u for u in tool_uses_of(resp["output"]["message"]) if u["name"] == "submit_plan"]
        try:
            if not uses:
                raise ValueError("submit_plan 호출이 없습니다.")
            return validate_plan(Plan.model_validate(uses[0]["input"]), tool_names)
        except (ValidationError, ValueError) as e:
            feedback = f"\n\n이전 제출 오류: {e} 모든 도구를 빠짐없이 한 번씩 넣어 다시 제출하라."
    raise PlannerError("계획 초안을 만들지 못했습니다. 다시 시도하거나 화면에서 직접 작성하세요.")
