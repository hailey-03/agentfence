import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, COND_LABEL, RULE_LABEL } from "../api";
import type { Condition, Plan, Rule, RunDetail, ScenarioDetail as Detail } from "../types";

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

  const load = () => api<Detail>(`/scenarios/${id}`).then((d) => { setS(d); setPlan(d.plan); setDirty(false); })
    .catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]);

  async function act<T>(k: string, fn: () => Promise<T>) {
    setError(""); setBusy(k);
    try { return await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(""); }
  }
  const makePlan = () => act("plan", async () => { setPlan(await api<Plan>(`/scenarios/${id}/plan`, { method: "POST" })); setDirty(false); await load(); });
  const confirm = () => act("confirm", async () => { await api<Plan>(`/scenarios/${id}/plan`, { method: "PUT", body: JSON.stringify(plan) }); await load(); });
  const run = () => act("run", async () => {
    const r = await api<RunDetail>(`/scenarios/${id}/runs`, { method: "POST", body: JSON.stringify({ condition: cond }) });
    nav(`/runs/${r.id}`);
  });

  function edit(i: number, patch: Partial<Plan["tools"][number]>) {
    if (!plan) return;
    const tools = plan.tools.map((t, j) => {
      if (j !== i) return t;
      const n = { ...t, ...patch };
      if (patch.rule === "FORBIDDEN") n.maxCalls = 0;
      if (patch.rule && patch.rule !== "FORBIDDEN" && n.maxCalls < 1) n.maxCalls = 1;
      return n;
    });
    setPlan({ ...plan, tools }); setDirty(true);
  }

  if (!s) return error ? <p className="error">{error}</p> : <p className="muted">불러오는 중</p>;
  const confirmed = s.plan_confirmed && !dirty;

  return (
    <div className="stack-lg">
      <Link to="/" className="back">← 시나리오 목록</Link>
      <section><h1 className="task-title">{s.task}</h1>
        <p className="meta">{s.pdf_name} · 추출 텍스트 {s.pdf_chars.toLocaleString()}자 · {new Date(s.created_at).toLocaleString("ko-KR")}</p></section>

      <section className="panel">
        <div className="panel-head">
          <div><h2>기대 행동 계획</h2>
            <p className="muted">PDF를 보지 않고 요청만 보고 정한 도구별 규칙입니다. 고친 뒤 확정하세요.</p></div>
          <button onClick={makePlan} disabled={!!busy}>{busy === "plan" ? "만드는 중" : plan ? "다시 만들기" : "계획 만들기"}</button>
        </div>
        {plan && <>
          <div className="table-wrap"><table>
            <thead><tr><th>도구</th><th>규칙</th><th>최대</th><th>이유</th></tr></thead>
            <tbody>{plan.tools.map((t, i) => (
              <tr key={t.tool}><td><code>{t.tool}</code></td>
                <td><select value={t.rule} onChange={(e) => edit(i, { rule: e.target.value as Rule })}>
                  {RULES.map((r) => <option key={r} value={r}>{RULE_LABEL[r]}</option>)}</select></td>
                <td><input type="number" min={t.rule === "FORBIDDEN" ? 0 : 1} max={8} value={t.maxCalls}
                  disabled={t.rule === "FORBIDDEN"} className="num"
                  onChange={(e) => edit(i, { maxCalls: Number(e.target.value) })} /></td>
                <td><input value={t.reason} onChange={(e) => edit(i, { reason: e.target.value })} /></td></tr>))}
            </tbody></table></div>
          <label className="check cap">
            <input type="checkbox" checked={plan.allowSensitiveToExternal}
              onChange={(e) => { setPlan({ ...plan, allowSensitiveToExternal: e.target.checked }); setDirty(true); }} />
            <span>민감 데이터를 외부로 전송하는 것을 허용 (기본 꺼짐)</span></label>
          <div className="actions">
            <span className={confirmed ? "state ok" : "state"}>{confirmed ? "확정됨" : "확정 전"}</span>
            <button onClick={confirm} disabled={!!busy || confirmed}>{busy === "confirm" ? "저장 중" : "계획 확정"}</button>
          </div>
        </>}
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
