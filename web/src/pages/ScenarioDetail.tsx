import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, COND_LABEL, RISK_LABEL, RISK_ORDER, RULE_LABEL } from "../api";
import ConfirmPlan, { planWarnings } from "../components/ConfirmPlan";
import PlanGuide from "../components/PlanGuide";
import { useLeaveGuard } from "../components/useLeaveGuard";
import type { Condition, Plan, Rule, RunDetail, ScenarioDetail as Detail, ToolInfo } from "../types";

const RULES: Rule[] = ["MUST", "MAY", "FORBIDDEN"];
const CONDS: Condition[] = ["A", "B", "C", "D"];
const COND_HINT: Record<Condition, string> = {
  A: "방어 없이 전부 실행", B: "AWS식 권한표만", C: "요청 기준 전체 검사", D: "문서를 Guardrails로 먼저 검사" };

export default function ScenarioDetail() {
  const { id } = useParams(); const nav = useNavigate();
  const [s, setS] = useState<Detail | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [dirty, setDirty] = useState(false);
  const [cond, setCond] = useState<Condition>("C");
  const [busy, setBusy] = useState(""); const [error, setError] = useState("");
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [asking, setAsking] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [guideOpen, setGuideOpen] = useState(false);               // 안내 박스 펼침 (기본 접힘)   // 위험 등급별 금지 항목 펼침

  useLeaveGuard(dirty, "확정하지 않은 계획 수정이 있어요. 페이지를 떠나면 고친 내용이 사라집니다. 떠날까요?");

  const load = () => api<Detail>(`/scenarios/${id}`).then((d) => { setS(d); setPlan(d.plan); setDirty(false); })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);
  useEffect(() => { api<ToolInfo[]>("/tools").then(setTools).catch(() => {}); }, []);

  async function act<T>(k: string, fn: () => Promise<T>) {
    setError(""); setBusy(k);
    try { return await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  // 고친 내용이나 확정한 계획이 있으면, 새 초안으로 덮어쓰기 전에 묻는다
  const remake = () => {
    if (!plan) { makePlan(); return; }          // 처음 만들 때는 묻지 않는다
    const lose = [dirty && "고친 내용", s?.plan_confirmed && "확정한 계획"].filter(Boolean).join("과 ");
    const msg = "AI가 요청 문장만 보고(PDF는 보지 않음) 계획 초안을 새로 만듭니다.\n\n"
      + (lose ? `⚠️ 지금의 ${lose}이 사라지고 새 초안으로 바뀝니다. 새 초안은 다시 확정해야 실행할 수 있어요.`
              : "지금 초안은 새 초안으로 바뀝니다.")
      + "\n\n이미 실행한 결과는 바뀌지 않아요. 계속할까요?";
    if (!window.confirm(msg)) return;
    makePlan();
  };
  const makePlan = () => act("plan", async () => { setPlan(await api<Plan>(`/scenarios/${id}/plan`, { method: "POST" })); setDirty(false); await load(); });
  const confirm = () => act("confirm", async () => {
    await api<Plan>(`/scenarios/${id}/plan`, { method: "PUT", body: JSON.stringify(plan) });
    setAsking(false); await load();
  });
  const confirmAndRun = () => act("confirm", async () => {
    await api<Plan>(`/scenarios/${id}/plan`, { method: "PUT", body: JSON.stringify(plan) });
    await load();                     // 확정 반영 (실행이 실패해도 화면이 확정 상태와 맞도록)
    const r = await api<RunDetail>(`/scenarios/${id}/runs`, { method: "POST", body: JSON.stringify({ condition: cond }) });
    nav(`/runs/${r.id}`);
  });
  const run = () => act("run", async () => {
    const r = await api<RunDetail>(`/scenarios/${id}/runs`, { method: "POST", body: JSON.stringify({ condition: cond }) });
    nav(`/runs/${r.id}`);
  });

  function edit(tool: string, patch: Partial<Plan["tools"][number]>) {
    if (!plan) return;
    const tools = plan.tools.map((t) => {
      if (t.tool !== tool) return t;
      const n = { ...t, ...patch };
      if (patch.rule === "FORBIDDEN") n.maxCalls = 0;
      if (patch.rule && patch.rule !== "FORBIDDEN" && n.maxCalls < 1) n.maxCalls = 1;
      return n;
    });
    setPlan({ ...plan, tools }); setDirty(true);
  }

  if (!s) return error ? <p className="error">{error}</p> : <p className="muted">불러오는 중</p>;
  const confirmed = s.plan_confirmed && !dirty;
  const baseLabel = s.plan_confirmed ? "확정된 계획" : "AI 초안";
  const revert = () => { setPlan(s.plan); setDirty(false); setOpen({}); };   // 저장된 계획으로 편집 취소
  const warnings = plan ? planWarnings(s.task, plan, tools) : [];
  const warnOf = (tool: string) => warnings.filter((w) => w.tools.includes(tool));
  const descOf = (tool: string) => tools.find((t) => t.name === tool)?.description.replace(/한다\.$/, "합니다.");
  const riskOf = (tool: string) => tools.find((t) => t.name === tool)?.risk ?? "OTHER";
  // 위험 등급별로 묶는다. 금지 항목은 접어 두되, 저장된 계획에서 바꾼 행은 항상 보인다
  const groups = plan ? [...RISK_ORDER, "OTHER"].map((r) => {
    const rows = plan.tools.filter((t) => (RISK_ORDER.includes(riskOf(t.tool)) ? riskOf(t.tool) : "OTHER") === r);
    const changed = (tool: string, rule: string) => s.plan?.tools.find((b) => b.tool === tool)?.rule !== rule;
    const hidden = rows.filter((t) => t.rule === "FORBIDDEN" && !changed(t.tool, t.rule));
    return { risk: r, rows, hidden, shown: open[r] ? rows : rows.filter((t) => !hidden.includes(t)) };
  }).filter((g) => g.rows.length > 0) : [];

  return (
    <div className="stack-lg">
      <Link to="/" className="back">← 시나리오 목록</Link>
      <section><h1 className="task-title">{s.task}</h1>
        <p className="meta">{s.pdf_name} · 추출 텍스트 {s.pdf_chars.toLocaleString()}자</p></section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>기대 행동 계획</h2>
            <p className="muted">PDF를 보지 않고 요청만 보고 정한 도구별 규칙입니다. 고친 뒤 확정하세요.</p></div>
          <button onClick={remake} disabled={!!busy}>{busy === "plan" ? "만드는 중" : plan ? "다시 만들기" : "계획 만들기"}</button>
        </div>
        {plan && <>
          <div className="plan-summary">
            <span>✅ 꼭 호출 <b>{plan.tools.filter((t) => t.rule === "MUST").length}</b></span>
            <span>🟡 호출 가능 <b>{plan.tools.filter((t) => t.rule === "MAY").length}</b></span>
            <span>⛔ 호출 금지 <b>{plan.tools.filter((t) => t.rule === "FORBIDDEN").length}</b></span>
            <button type="button" className="link" aria-expanded={guideOpen} onClick={() => setGuideOpen(!guideOpen)}>
              {guideOpen ? "안내 접기 ▾" : "안내 자세히 보기 ▸"}</button>
          </div>
          {guideOpen && <PlanGuide task={s.task} plan={plan} tools={tools} />}
          <div className="table-wrap"><table className="plan-table">
            <thead><tr><th>도구</th><th>규칙</th><th>최대</th><th>이유</th></tr></thead>
            {groups.map((g) => {
              const allowed = g.rows.filter((t) => t.rule !== "FORBIDDEN").length;
              return (
                <tbody key={g.risk}>
                  <tr className="group-row"><td colSpan={4}>
                    <b>{RISK_LABEL[g.risk] ?? "기타"}</b>
                    <span className="muted"> · 허용 {allowed} · 금지 {g.rows.length - allowed}</span>
                    {g.hidden.length > 0 && <button type="button" className="link"
                      aria-expanded={!!open[g.risk]} onClick={() => setOpen({ ...open, [g.risk]: !open[g.risk] })}>
                      {open[g.risk] ? "금지 항목 접기 ▾" : `금지 ${g.hidden.length}개 보기 ▸`}</button>}
                  </td></tr>
                  {g.shown.map((t) => {
                    const ws = warnOf(t.tool);
                    return (
                      <tr key={t.tool} className={ws.some((w) => w.level === "danger") ? "warn-row" : undefined}>
                        <td><code>{t.tool}</code>
                          {ws.length > 0 && <span className="warn-icon" title={ws.map((w) => w.text).join("\n")}
                            aria-label="경고 있음"> ⚠️</span>}
                          {descOf(t.tool) && <span className="tool-desc">{descOf(t.tool)}</span>}</td>
                        <td><select value={t.rule} onChange={(e) => edit(t.tool, { rule: e.target.value as Rule })}>
                          {RULES.map((r) => <option key={r} value={r}>{RULE_LABEL[r]}</option>)}</select></td>
                        <td><input type="number" min={t.rule === "FORBIDDEN" ? 0 : 1} max={8} value={t.maxCalls}
                          disabled={t.rule === "FORBIDDEN"} className="num"
                          onChange={(e) => edit(t.tool, { maxCalls: Number(e.target.value) })} /></td>
                        <td><input value={t.reason} onChange={(e) => edit(t.tool, { reason: e.target.value })} /></td></tr>);
                  })}
                </tbody>);
            })}
          </table></div>
          {warnings.length > 0 && <ul className="warnings live" aria-live="polite">{warnings.map((w) => (
            <li key={w.text} className={w.level}>{w.level === "danger" ? "⚠️" : "ℹ️"} {w.text}</li>))}</ul>}
          <label className="check cap">
            <input type="checkbox" checked={plan.allowSensitiveToExternal}
              onChange={(e) => { setPlan({ ...plan, allowSensitiveToExternal: e.target.checked }); setDirty(true); }} />
            <span>민감 데이터를 외부로 전송하는 것을 허용 (기본 꺼짐)</span></label>
          <div className="actions">
            <span className={confirmed ? "state ok" : "state"}>{confirmed ? "확정됨" : "확정 전"}</span>
            {dirty && s.plan && <button type="button" onClick={revert} disabled={!!busy}>↺ {baseLabel}으로 되돌리기</button>}
            <button onClick={() => { setError(""); setAsking(true); }} disabled={!!busy || confirmed}>{busy === "confirm" ? "저장 중" : "계획 확정"}</button>
          </div>
        </>}
        {asking && plan && <ConfirmPlan task={s.task} base={s.plan} plan={plan} tools={tools}
          baseLabel={baseLabel} busy={busy === "confirm"} error={error} runLabel={COND_LABEL[cond]}
          onCancel={() => setAsking(false)} onConfirm={confirm} onConfirmAndRun={confirmAndRun} />}
      </section>

      <section className="panel">
        <h2>실행</h2>
        <p className="muted">같은 문서를 방어 조건별로 실행해 비교합니다.</p>
        <div className="conds">{CONDS.map((cc) => (
          <label key={cc} className={cond === cc ? "cond on" : "cond"}>
            <input type="radio" name="cond" checked={cond === cc} onChange={() => setCond(cc)} />
            <b>{COND_LABEL[cc]}</b><span className="muted">{COND_HINT[cc]}</span></label>))}</div>
        <div className="actions">
          <button className="primary" onClick={run} disabled={!!busy || !confirmed}>
            {busy === "run" ? "실행 중" : `${COND_LABEL[cond]}로 실행`}</button>
          {!confirmed && <span className="hint">계획을 확정해야 실행할 수 있어요.</span>}
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {s.runs.length > 0 && <section><h2>실행 이력</h2>
        <ul className="list">{s.runs.map((r) => (
          <li key={r.id}><Link to={`/runs/${r.id}`}>
            <span className="row-title">{COND_LABEL[r.condition]}</span>
            <span className="meta">업무 {r.task_success ? "성공" : "실패"}</span>
            <span className={`pill ${r.status === "DONE" ? "ok" : "bad"}`}>{r.status}</span>
          </Link></li>))}</ul></section>}
    </div>
  );
}
