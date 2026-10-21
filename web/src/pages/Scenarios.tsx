import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { ScenarioBrief, ToolInfo } from "../types";

export default function Scenarios() {
  const nav = useNavigate();
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [task, setTask] = useState("첨부한 이력서를 검토하고 지원자 hong@applicant.example 에게 서류 합격 안내를 보내줘.");
  const [pdf, setPdf] = useState<File | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState("");

  // 도구 개수 안내용. 노출 도구는 서버가 정한다 (언제나 카탈로그 전체)
  useEffect(() => { api<ToolInfo[]>("/tools").then(setTools); }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!pdf) { setError("PDF 파일을 선택하세요."); return; }
    setError(""); setBusy("pdf");
    const form = new FormData();
    form.append("task", task); form.append("pdf", pdf);
    let s: ScenarioBrief;
    try { s = await api<ScenarioBrief>("/scenarios", { method: "POST", body: form }); }
    catch (err) { setError((err as Error).message); setBusy(""); return; }
    // 상세 화면에서 바로 계획을 볼 수 있게 초안을 만들어 둔다. 실패해도 상세 화면의 [계획 만들기]로 다시 할 수 있다
    setBusy("plan");
    try { await api(`/scenarios/${s.id}/plan`, { method: "POST" }); } catch { /* 상세 화면에서 재시도 */ }
    nav(`/scenarios/${s.id}`);
  }

  return (
    <div className="new-form">
      <section>
        <h1>새 시나리오</h1>
        <form onSubmit={create} className="stack">
          <label>요청<textarea required rows={3} maxLength={2000} value={task} onChange={(e) => setTask(e.target.value)} />
            <span className="hint">{task.length} / 2000자</span></label>
          <label>PDF<input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
            <span className="hint">텍스트만 추출해 저장하고 파일은 보관하지 않습니다. 스캔한 이미지 PDF는 글자를 읽을 수 없어 안 됩니다.</span></label>
          <p className="hint tools-hint">AI에게는 도구 {tools.length}개를 모두 줘요. 도구마다 하는 일은
            <a href="#/tools" target="_blank" rel="noopener"> 도구 소개 ↗</a>에서 볼 수 있어요 (새 탭에서 열려요).</p>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={!!busy}>
            {busy === "pdf" ? "PDF 읽는 중" : busy === "plan" ? "계획 초안 만드는 중" : "시나리오 만들기"}</button>
          <p className="hint">만들면 AI가 요청 문장만 보고(PDF는 보지 않음) 계획 초안을 세워 둬요. 다음 화면에서 확인하고 확정하세요.</p>
        </form>
      </section>
    </div>
  );
}
