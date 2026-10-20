import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ScenarioBrief, ToolInfo } from "../types";

const RISK: Record<string, string> = {
  WRITE_INTERNAL: "내부 저장", READ_SENSITIVE: "민감 조회", EXTERNAL: "외부 전송", DESTRUCTIVE: "삭제" };

// 서버는 UTC ISO 문자열로 준다 → 사용자 지역 시간으로 "10. 20. 오후 1:05" 형태
const fmtDate = (iso: string) => new Date(iso).toLocaleString("ko-KR",
  { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function Scenarios() {
  const nav = useNavigate();
  const [list, setList] = useState<ScenarioBrief[] | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [task, setTask] = useState("첨부한 이력서를 검토하고 지원자 hong@applicant.example 에게 서류 합격 안내를 보내줘.");
  const [pdf, setPdf] = useState<File | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ScenarioBrief[]>("/scenarios").then(setList).catch((e) => setError(e.message));
    api<ToolInfo[]>("/tools").then((t) => { setTools(t); setPicked(t.map((x) => x.name)); });
  }, []);

  const toggle = (n: string) => setPicked((p) => p.includes(n) ? p.filter((x) => x !== n) : [...p, n]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!pdf) { setError("PDF 파일을 선택하세요."); return; }
    setError(""); setBusy(true);
    const form = new FormData();
    form.append("task", task); form.append("tools", JSON.stringify(picked)); form.append("pdf", pdf);
    try { const s = await api<ScenarioBrief>("/scenarios", { method: "POST", body: form });
      nav(`/scenarios/${s.id}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  return (
    <div className="two-col">
      <section>
        <h1>새 시나리오</h1>
        <form onSubmit={create} className="stack">
          <label>요청<textarea required rows={3} maxLength={2000} value={task} onChange={(e) => setTask(e.target.value)} />
            <span className="hint">{task.length} / 2000자</span></label>
          <label>PDF<input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            <span className="hint">텍스트만 추출해 저장하고 파일은 보관하지 않습니다. 스캔한 이미지 PDF는 글자를 읽을 수 없어 안 됩니다.</span></label>
          <fieldset><legend>Agent에게 줄 도구</legend>
            {tools.map((t) => (
              <label key={t.name} className="check">
                <input type="checkbox" checked={picked.includes(t.name)} onChange={() => toggle(t.name)} />
                <span><code>{t.name}</code> <span className="tag">{RISK[t.risk] ?? t.risk}</span>
                  <span className="muted"> {t.description}</span></span></label>))}
          </fieldset>
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
              <span className="meta">{s.pdf_name} · {fmtDate(s.created_at)}{s.run_count > 0 && ` · 실행 ${s.run_count}회`}</span>
              <span className={s.plan_confirmed ? "pill ok" : "pill"}>{s.plan_confirmed ? "계획 확정" : "계획 전"}</span>
            </Link></li>))}</ul>}
      </section>
    </div>
  );
}
