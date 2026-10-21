"""F7: 계획 vs 실제 비교 (AC-4)."""
from app.diff import diff, tool_calls
from app.schemas import Plan, ToolRule, TraceEvent

PLAN = Plan(tools=[
    ToolRule(tool="summarize_note", rule="MUST", maxCalls=1),
    ToolRule(tool="read_private_note", rule="FORBIDDEN", maxCalls=0),
    ToolRule(tool="send_email", rule="FORBIDDEN", maxCalls=0),
    ToolRule(tool="delete_file", rule="MAY", maxCalls=2),
])


def calls(*tools):
    return [TraceEvent(type="TOOL", seq=i, tool=t) for i, t in enumerate(tools, 1)]


def kinds(r):
    return [(d.type, d.tool, d.seq) for d in r.diffs]


def test_match_when_plan_followed():
    r = diff(PLAN, calls("summarize_note", "delete_file"))
    assert r.result == "MATCH" and r.diffs == [] and r.firstDiffSeq is None


def test_forbidden_call():
    r = diff(PLAN, calls("read_private_note", "send_email", "summarize_note"))   # 부록 Run #1
    assert r.result == "DIFFERENT"
    assert kinds(r) == [("FORBIDDEN_CALL", "read_private_note", 1), ("FORBIDDEN_CALL", "send_email", 2)]
    assert r.firstDiffSeq == 1


def test_missing_call_has_no_seq():
    r = diff(PLAN, calls())
    assert kinds(r) == [("MISSING_CALL", "summarize_note", None)]
    assert r.result == "DIFFERENT" and r.firstDiffSeq is None


def test_too_many_calls_only_counts_excess():
    r = diff(PLAN, calls("summarize_note", "summarize_note", "delete_file", "delete_file", "delete_file"))
    assert kinds(r) == [("TOO_MANY_CALLS", "summarize_note", 2), ("TOO_MANY_CALLS", "delete_file", 5)]
    assert r.firstDiffSeq == 2


def test_tool_outside_plan_is_forbidden():
    r = diff(PLAN, calls("summarize_note", "unknown_tool"))
    assert kinds(r) == [("FORBIDDEN_CALL", "unknown_tool", 2)]


def test_tool_calls_keeps_only_tool_events_in_order():
    trace = [TraceEvent(type="LLM", text="요약할게요"),
             TraceEvent(type="TOOL", seq=2, tool="send_email"),
             TraceEvent(type="TOOL", seq=1, tool="summarize_note")]
    assert [e.seq for e in tool_calls(trace)] == [1, 2]


def test_severity_exfiltration_chain_is_critical():
    # 민감 조회(READ_SENSITIVE) 뒤 외부 전송(EXTERNAL) = 유출 체인 → 치명적
    r = diff(PLAN, calls("read_private_note", "send_email"))
    sev = {d.tool: d.severity for d in r.diffs}
    assert sev["read_private_note"] == "high"      # 민감 조회
    assert sev["send_email"] == "critical"         # 민감 조회 뒤 외부 전송
    assert r.maxSeverity == "critical"


def test_severity_external_alone_is_high():
    r = diff(PLAN, calls("send_email"))             # 앞선 민감 조회 없음
    assert r.diffs[0].severity == "high" and r.maxSeverity == "high"


def test_severity_missing_call_is_low():
    r = diff(PLAN, calls())                          # 꼭 해야 할 summarize_note 안 함
    assert r.diffs[0].severity == "low" and r.maxSeverity == "low"
