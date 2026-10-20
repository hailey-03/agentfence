"""5번 모듈: Planner (AC-2, AC-3)."""
import inspect

import pytest

from app.llm import FakeClient
from app.planner import PlannerError, generate_plan, validate_plan
from app.schemas import Plan

ALL = ["summarize_note", "read_private_note", "send_email", "delete_file"]


def rules(plan):
    return {r.tool: (r.rule, r.maxCalls) for r in plan.tools}


def test_planner_never_takes_pdf():                                  # AC-2
    for fn in (generate_plan, validate_plan):
        assert not any("pdf" in p for p in inspect.signature(fn).parameters)


def test_t1_summary_plan():                                          # AC-3
    p = generate_plan("첨부한 용역 계약서를 요약해서 내 노트에 저장해줘.", ALL, FakeClient())
    assert rules(p) == {"summarize_note": ("MUST", 1), "read_private_note": ("FORBIDDEN", 0),
                        "send_email": ("FORBIDDEN", 0), "delete_file": ("FORBIDDEN", 0)}
    assert p.allowSensitiveToExternal is False


def test_t2_reply_plan():
    p = generate_plan("첨부한 이력서를 검토하고 지원자 hong@applicant.example 에게 서류 합격 안내를 보내줘.",
                      ALL, FakeClient())
    assert rules(p)["send_email"] == ("MUST", 1)
    assert rules(p)["read_private_note"] == ("FORBIDDEN", 0)


def test_validate_fixes_counts_and_order():
    p = validate_plan(Plan.model_validate({"tools": [
        {"tool": "send_email", "rule": "FORBIDDEN", "maxCalls": 3},
        {"tool": "summarize_note", "rule": "MUST", "maxCalls": 0}]}), ["summarize_note", "send_email"])
    assert [(r.tool, r.maxCalls) for r in p.tools] == [("summarize_note", 1), ("send_email", 0)]


def test_validate_rejects_missing_or_extra_tool():
    with pytest.raises(ValueError):
        validate_plan(Plan.model_validate({"tools": [{"tool": "summarize_note", "rule": "MUST", "maxCalls": 1}]}),
                      ["summarize_note", "send_email"])


class Flaky:
    """처음엔 도구를 빠뜨리고, 두 번째엔 제대로 내는 가짜 모델."""
    def __init__(self, fail_times):
        self.calls, self.fail_times = 0, fail_times

    def converse(self, **kw):
        self.calls += 1
        good = [{"tool": "summarize_note", "rule": "MUST", "maxCalls": 1, "reason": "r"}]
        tools = [] if self.calls <= self.fail_times else good
        return {"output": {"message": {"content": [
            {"toolUse": {"toolUseId": "t", "name": "submit_plan", "input": {"tools": tools}}}]}}}


def test_retries_once_then_succeeds():
    m = Flaky(fail_times=1)
    assert generate_plan("요약해서 저장해줘", ["summarize_note"], m).tools[0].rule == "MUST" and m.calls == 2


def test_gives_up_after_two_failures():
    with pytest.raises(PlannerError):
        generate_plan("요약해서 저장해줘", ["summarize_note"], Flaky(fail_times=2))
