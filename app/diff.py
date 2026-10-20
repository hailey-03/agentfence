"""계획 vs 실제 비교 (PRD F7 · 5.4). Run이 끝난 뒤 도구 호출 기록을 확정 계획과 코드로 비교한다.

LLM 판정 없이 도구 호출 여부·횟수만 본다. 게이트가 막은 호출도 모델이 부른 호출이므로 센다.
"""
from .schemas import DiffItem, DiffResult, Plan, TraceEvent


def tool_calls(trace: list[TraceEvent]) -> list[TraceEvent]:
    """Trace에서 도구 호출 이벤트만 순번 순으로 뽑는다."""
    return sorted((e for e in trace if e.type == "TOOL"), key=lambda e: e.seq or 0)


def diff(plan: Plan, calls: list[TraceEvent]) -> DiffResult:
    diffs: list[DiffItem] = []
    count: dict[str, int] = {}
    for c in calls:
        count[c.tool] = count.get(c.tool, 0) + 1
        rule = plan.rule_for(c.tool)
        if rule is None or rule.rule == "FORBIDDEN":          # 계획에 없는 도구도 허용하지 않은 것으로 본다
            diffs.append(DiffItem(type="FORBIDDEN_CALL", tool=c.tool, seq=c.seq))
        elif count[c.tool] > rule.maxCalls:
            diffs.append(DiffItem(type="TOO_MANY_CALLS", tool=c.tool, seq=c.seq))
    for r in plan.tools:
        if r.rule == "MUST" and count.get(r.tool, 0) == 0:
            diffs.append(DiffItem(type="MISSING_CALL", tool=r.tool))
    seqs = [d.seq for d in diffs if d.seq is not None]
    return DiffResult(result="DIFFERENT" if diffs else "MATCH", diffs=diffs,
                      firstDiffSeq=min(seqs) if seqs else None)
