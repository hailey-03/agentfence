import { RISK_LABEL as RISK, RISK_ORDER } from "../api";
import type { Plan, ToolInfo, ToolRule } from "../types";

/** 계획을 사람이 읽는 안내로 풀어 쓴다. PDF를 보지 않고 요청만으로 정했다는 점을 먼저 알린다. */
export default function PlanGuide({ task, plan, tools }: { task: string; plan: Plan; tools: ToolInfo[] }) {
  const info = (n: string) => tools.find((t) => t.name === n);
  const desc = (n: string) => (info(n)?.description ?? "").replace(/한다\.$/, "합니다.");
  const must = plan.tools.filter((t) => t.rule === "MUST");
  const may = plan.tools.filter((t) => t.rule === "MAY");
  const forbidden = plan.tools.filter((t) => t.rule === "FORBIDDEN");
  const byRisk = RISK_ORDER.map((r) => [r, forbidden.filter((t) => info(t.tool)?.risk === r)] as const)
    .filter(([, ts]) => ts.length > 0);
  const etc = forbidden.filter((t) => !RISK_ORDER.includes(info(t.tool)?.risk ?? ""));

  const item = (t: ToolRule) => (
    <li key={t.tool}><span>{desc(t.tool) || t.tool}</span> <code>{t.tool}</code>
      {t.rule !== "FORBIDDEN" && <span className="tag">최대 {t.maxCalls}회</span>}
      {t.reason && <span className="muted"> — {t.reason}</span>}</li>);

  return (
    <div className="guide">
      <p className="guide-lead">
        <b>“{task}”</b><br />
        첨부 PDF의 내용은 보지 않고, <b>요청 문장만 보고</b> 아래처럼 처리할 계획이에요.
      </p>
      <div className="guide-group do">
        <h3>✅ 이렇게 처리합니다</h3>
        {must.length ? <ul>{must.map(item)}</ul> : <p className="muted">꼭 써야 하는 도구가 없어요.</p>}
      </div>
      {may.length > 0 && <div className="guide-group may">
        <h3>🟡 필요하면 쓸 수 있어요</h3><ul>{may.map(item)}</ul></div>}
      {forbidden.length > 0 && <div className="guide-group dont">
        <h3>⛔ 하지 않습니다 (요청에 없는 일)</h3>
        <ul>{byRisk.map(([r, ts]) => (
          <li key={r}><b>{RISK[r]}</b>: {ts.map((t) => <code key={t.tool}>{t.tool}</code>)}</li>))}
          {etc.length > 0 && <li><b>기타</b>: {etc.map((t) => <code key={t.tool}>{t.tool}</code>)}</li>}</ul>
      </div>}
      <p className="hint">
        첨부 문서에 이와 다른 지시가 숨어 있어 AI가 계획에서 벗어난 행동을 하면, 실행 결과에서 ‘차이’로 알려 드려요.
      </p>
    </div>
  );
}
