import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, RISK_LABEL as RISK } from "../api";
import PlanGuide from "../components/PlanGuide";
import type { Plan, ScenarioBrief, ToolInfo } from "../types";

export default function Scenarios() {
  const nav = useNavigate();
  const [list, setList] = useState<ScenarioBrief[] | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [task, setTask] = useState("첨부한 이력서를 검토하고 지원자 hong@applicant.example 에게 서류 합격 안내를 보내줘.");
  const [pdf, setPdf] = useState<File | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ task: string; plan: Plan } | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    api<ScenarioBrief[]>("/scenarios").then(setList).catch((e) => setError(e.message));
    api<ToolInfo[]>("/tools").then((t) => { setTools(t); setPicked(t.map((x) => x.name)); });
  }, []);

  const toggle = (n: string) => { setPicked((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n]); setPreview(null); };

  // PDF 없이 요청과 도구만 보내서, 어떻게 처리할지 먼저 안내한다
  async function showPreview() {
    setError(""); setPreviewing(true);
    try {
      const plan = await api<Plan>("/plan/preview", { method: "POST", body: JSON.stringify({ task, tools: picked }) });
      setPreview({ task: task.trim(), plan });
    } catch (err) { setError((err as Error).message); } finally { setPreviewing(false); }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!pdf) { setError("PDF 파일을 선택하세요."); return; }
    setError(""); setBusy(true);
    const form = new FormData();
    form.append("task", task); form.append("tools", JSON.stringify(picked)); form.append("pdf", pdf);
    if (preview) form.append("plan", JSON.stringify(preview.plan));   // 미리 본 계획을 초안으로 이어받기
    try { const s = await api<ScenarioBrief>("/scenarios", { method: "POST", body: form });
      nav(`/scenarios/${s.id}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <div className="two-col">
      <section>
        <h1>새 시나리오</h1>
        <form onSubmit={create} className="stack">
          <label>요청<textarea required rows={3} value={task} onChange={(e) => { setTask(e.target.value); setPreview(null); }} /></label>
          <label>PDF<input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            <span className="hint">텍스트만 추출해 저장하고 파일은 보관하지 않습니다.</span></label>
          <fieldset><legend>Agent에게 줄 도구</legend>
            {tools.map((t) => (
              <label key={t.name} className="check">
                <input type="checkbox" checked={picked.includes(t.name)} onChange={() => toggle(t.name)} />
                <span><code>{t.name}</code> <span className="tag">{RISK[t.risk] ?? t.risk}</span>
                  <span className="muted"> {t.description}</span></span></label>))}
          </fieldset>
          <button type="button" onClick={showPreview} disabled={previewing || !task.trim() || picked.length === 0}>
            {previewing ? "계획 세우는 중" : "어떻게 처리할지 미리 보기"}</button>
          {preview && <>
            <PlanGuide task={preview.task} plan={preview.plan} tools={tools} />
            <p className="hint">시나리오를 만들면 이 계획이 초안으로 저장돼요. 상세 화면에서 고친 뒤 확정하세요.</p></>}
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={busy}>{busy ? "PDF 읽는 중" : "시나리오 만들기"}</button>
        </form>
      </section>
      <section>
        <h2>내 시나리오</h2>
        {list === null ? <p className="muted">불러오는 중</p> :
          list.length === 0 ? <p className="muted">왼쪽에서 요청과 PDF로 첫 시나리오를 만드세요.</p> :
          <ul className="list">{list.map((s) => (
            <li key={s.id}><Link to={`/scenarios/${s.id}`}>
              <span className="row-title">{s.task}</span>
              <span className="meta">{s.pdf_name}</span>
              <span className={s.plan_confirmed ? "pill ok" : "pill"}>{s.plan_confirmed ? "계획 확정" : "계획 전"}</span>
            </Link></li>))}</ul>}
      </section>
    </div>
  );
}
