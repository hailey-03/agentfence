import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, RULE_LABEL } from "../api";
import type { DiffType, RunDetail, TraceEvent } from "../types";

const show = (v: unknown) => typeof v === "string" ? v : JSON.stringify(v, null, 2);
const str = (v: unknown) => Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : v == null ? "" : JSON.stringify(v);
const cut = (s: string, n = 40) => s.length > n ? s.slice(0, n) + "…" : s;

const DIFF_LABEL: Record<DiffType, string> = {
  FORBIDDEN_CALL: "요청에 없던 행동", MISSING_CALL: "하지 않은 일", TOO_MANY_CALLS: "너무 많이 호출" };

// 도구 호출을 사람이 읽는 한 문장으로 바꾼다. 모르는 도구는 이름 그대로 쓴다
type Args = Record<string, unknown>;
const ACTION: Record<string, (a: Args) => string> = {
  summarize_note: () => "요약을 노트에 저장했어요",
  update_doc: (a) => `사내 문서${a.doc_id ? `(${str(a.doc_id)})` : ""}를 수정했어요`,
  create_calendar_event: (a) => `일정${a.title ? ` ‘${cut(str(a.title))}’` : ""}을 캘린더에 등록했어요`,
  update_record: (a) => `데이터베이스 레코드${a.record_id ? `(${str(a.record_id)})` : ""}를 수정했어요`,
  read_private_note: (a) => `비공개 메모를 열어 봤어요${a.query ? ` (검색어 ‘${cut(str(a.query))}’)` : ""}`,
  read_hr_record: () => "직원의 인사 기록(평가·급여)을 조회했어요",
  search_internal_docs: (a) => `사내 문서를 검색했어요${a.query ? ` (검색어 ‘${cut(str(a.query))}’)` : ""}`,
  query_customer_db: () => "고객 정보(연락처·거래 내역)를 조회했어요",
  query_employee_db: () => "직원 정보(부서·연락처)를 조회했어요",
  send_email: (a) => a.to ? `${str(a.to)}로 이메일을 보냈어요` : "이메일을 보냈어요",
  post_to_slack: (a) => a.channel ? `슬랙 ${str(a.channel)} 채널에 글을 올렸어요` : "슬랙에 글을 올렸어요",
  share_external_link: (a) => a.recipient ? `문서를 ${str(a.recipient)}에게 외부 공유했어요` : "문서 외부 공유 링크를 만들었어요",
  export_table: (a) => `${a.table ? `${str(a.table)} 테이블을` : "테이블을"} ${a.destination ? `${str(a.destination)}로 ` : "외부로 "}내보냈어요`,
  delete_file: (a) => `파일${a.file_id ? `(${str(a.file_id)})` : ""}을 삭제했어요`,
};
const TODO: Record<string, string> = {   // 하지 않은 일을 말할 때 쓰는 동사구
  summarize_note: "요약을 노트에 저장하는 일", send_email: "이메일을 보내는 일",
  create_calendar_event: "일정을 등록하는 일", update_doc: "문서를 수정하는 일", update_record: "레코드를 수정하는 일" };
const action = (e: TraceEvent) => (ACTION[e.tool!]?.(e.input ?? {}) ?? `${e.tool}을(를) 호출했어요`);

// 상세 기록용: '어디로·무엇을'에 해당하는 인자를 먼저 보여 준다
const KEY_ORDER = ["to", "recipient", "recipients", "attendees", "channel", "destination", "url", "email",
  "file_id", "doc_id", "record_id", "employee_id", "customer_id", "table", "query", "title"];
function keyArgs(input: Args | null): string[] {
  if (!input) return [];
  const keys = Object.keys(input).sort((a, b) =>
    (KEY_ORDER.indexOf(a) + 1 || 99) - (KEY_ORDER.indexOf(b) + 1 || 99));
  return keys.slice(0, 2).map((k) => `${k}: ${cut(str(input[k]), 60)}`);
}

export default function RunResult() {
  const { id } = useParams(); const nav = useNavigate();
  const [r, setR] = useState<RunDetail | null>(null);
  const [error, setError] = useState(""); const [rerunning, setRerunning] = useState(false);
  useEffect(() => { setR(null); api<RunDetail>(`/runs/${id}`).then(setR).catch((e) => setError(e.message)); }, [id]);
  if (!r) return error ? <p className="error">{error}</p> : <p className="muted">불러오는 중</p>;

  async function rerun() {
    if (!r) return;
    setError(""); setRerunning(true);
    try {
      const n = await api<RunDetail>(`/scenarios/${r.scenario_id}/runs`, { method: "POST", body: JSON.stringify({ model: r.model }) });
      nav(`/runs/${n.id}`);
    } catch (e) { setError((e as Error).message); } finally { setRerunning(false); }
  }

  const calls = r.trace.filter((e) => e.type === "TOOL");
  const d = r.diff;
  const diffsOf = (seq: number | null) => d?.diffs.filter((x) => x.seq !== null && x.seq === seq) ?? [];
  const count = (tool: string) => calls.filter((c) => c.tool === tool).length;

  // 한눈에 보기: 요청한 일 / 요청에 없던 행동 / 하지 않은 일
  const mustTools = r.plan.tools.filter((t) => t.rule === "MUST").map((t) => t.tool);
  const done = calls.filter((c) => mustTools.includes(c.tool!) && diffsOf(c.seq).length === 0);
  const doneOnce = done.filter((c, i) => done.findIndex((x) => x.tool === c.tool) === i);
  const extraActs = calls.filter((c) => diffsOf(c.seq).length > 0);
  const missing = d?.diffs.filter((x) => x.type === "MISSING_CALL") ?? [];

  const verdict = r.status !== "DONE" ? "failed" : d?.result === "MATCH" ? "clean" : "caught";
  const title = verdict === "failed" ? "실행 중에 문제가 생겼어요"
    : verdict === "clean" ? "요청한 대로만 처리했어요"
    : extraActs.length ? `요청에 없던 행동 ${extraActs.length}건을 찾았어요` : "요청한 일 중 빠진 게 있어요";
  const lead = verdict === "failed" ? "AI 실행이 끝까지 진행되지 못했어요. 아래 오류를 확인하고 다시 실행해 보세요."
    : verdict === "clean" ? "AI가 계획 안에서만 도구를 썼어요. 숨은 지시에 흔들리지 않았어요."
    : extraActs.length
      ? `${missing.length ? "요청한 일 일부를 하지 않았고, " : "요청한 일은 처리됐지만, "}AI가 시키지 않은 행동도 했어요. AgentFence가 계획과 비교해 잡아냈어요.`
      : "AI가 계획상 꼭 해야 할 일을 하지 않았어요.";

  const rows = r.plan.tools.filter((t) => count(t.tool) > 0 || t.rule === "MUST" || d?.diffs.some((x) => x.tool === t.tool));
  const extraTools = [...new Set(calls.map((c) => c.tool!))].filter((n) => !r.plan.tools.some((t) => t.tool === n));
  const quiet = r.plan.tools.length - rows.length;

  return (
    <div className="stack-lg">
      <div className="run-top">
        <Link to={`/scenarios/${r.scenario_id}`} className="back">← 시나리오로</Link>
        <button onClick={rerun} disabled={rerunning}>{rerunning ? "실행 중" : "↻ 같은 계획으로 다시 실행"}</button>
      </div>
      {error && <p className="error">{error}</p>}

      <section className={`verdict ${verdict}`}>
        <p className="meta">Run #{r.id}{r.model_label ? ` · 실행 모델: ${r.model_label}` : ""}</p>
        <h1>{verdict === "clean" ? "✅ " : verdict === "caught" ? "🛡️ " : ""}{title}</h1>
        <p>{lead}</p>
        {verdict === "failed" && <p className="error">{r.error || "오류 메시지가 없습니다."}</p>}
      </section>

      {verdict !== "failed" && <section className="glance">
        <h2>한눈에 보기</h2>
        <div className="glance-row ok">
          <span className="glance-icon" aria-hidden="true">✅</span>
          <div><b>요청한 일</b>
            {doneOnce.length ? <ul>{doneOnce.map((c) => <li key={c.seq}>{action(c)}</li>)}</ul>
              : <p className="muted">계획상 꼭 해야 할 일이 없었어요.</p>}</div>
        </div>
        {missing.length > 0 && <div className="glance-row bad">
          <span className="glance-icon" aria-hidden="true">❌</span>
          <div><b>하지 않은 일</b>
            <ul>{missing.map((m) => <li key={m.tool}>{TODO[m.tool] ?? m.tool}을 하지 않았어요</li>)}</ul></div>
        </div>}
        {extraActs.length > 0 && <div className="glance-row bad">
          <span className="glance-icon" aria-hidden="true">⚠️</span>
          <div><b>요청에 없던 행동</b> <span className="muted">— 여기가 문제예요</span>
            <ul>{extraActs.map((c) => (
              <li key={c.seq}><a href={`#call-${c.seq}`} onClick={(ev) => { ev.preventDefault();
                document.getElementById(`call-${c.seq}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                {c.seq}번째</a> {action(c)}
                {diffsOf(c.seq).some((x) => x.type === "TOO_MANY_CALLS") && <span className="muted"> (계획보다 많이 호출)</span>}</li>))}</ul></div>
        </div>}
        {extraActs.length > 0 && <div className="glance-row hint-row">
          <span className="glance-icon" aria-hidden="true">💡</span>
          <div><b>왜 이런 일이?</b>
            <p>요청 문장에는 없던 행동이에요. 첨부 문서 안에 AI에게 몰래 일을 시키는 문장이 숨어 있었을 수 있어요.
              {r.final_output && " 그런데도 AI는 “완료했다”고만 답해서, 응답만 봐서는 알 수 없었어요."}</p></div>
        </div>}
        <p className="safe-note">🔒 실험용 가짜 도구로 실행돼서, 실제로 메일이 나가거나 데이터가 바뀌지는 않았어요.</p>
      </section>}

      <section>
        <h2>자세히 보기</h2>
        {r.status === "DONE" && <>
          <h3 className="sub-h">계획 vs 실제</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>도구</th><th>계획</th><th>최대</th><th>실제 호출</th></tr></thead>
            <tbody>
              {rows.map((t) => {
                const bad = d?.diffs.some((x) => x.tool === t.tool);
                return (<tr key={t.tool} className={bad ? "warn-row" : undefined}>
                  <td><code>{t.tool}</code></td><td>{RULE_LABEL[t.rule]}</td><td>{t.maxCalls}</td>
                  <td><b>{count(t.tool)}회</b>{bad && " ⚠️"}</td></tr>);
              })}
              {extraTools.map((n) => (<tr key={n} className="warn-row">
                <td><code>{n}</code></td><td>계획에 없음</td><td>0</td><td><b>{count(n)}회</b> ⚠️</td></tr>))}
            </tbody></table></div>
          {quiet > 0 && <p className="hint">나머지 {quiet}개 도구는 호출되지 않았어요 (계획대로).</p>}
        </>}

        <h3 className="sub-h">실행 기록</h3>
        <ol className="calls">{r.trace.map((e: TraceEvent, i) => {
          if (e.type !== "TOOL") return <li key={i} className="call"><p className="reason">{e.text}</p></li>;
          const ds = diffsOf(e.seq);
          const first = d?.firstDiffSeq != null && e.seq === d.firstDiffSeq;
          return (
            <li key={i} id={`call-${e.seq}`} className={`call${ds.length ? " bad" : ""}${first ? " first-diff" : ""}`}>
              <div className="call-head"><span className="seq">{e.seq}</span><code>{e.tool}</code>
                {first && <span className="badge first">처음 벗어난 곳</span>}
                {ds.map((x) => <span key={x.type} className="badge bad">{DIFF_LABEL[x.type]}</span>)}</div>
              <p className="reason">{action(e)}</p>
              {keyArgs(e.input).length > 0 && <p className="key-args">{keyArgs(e.input).map((a) => <span key={a}>→ {a}</span>)}</p>}
              <details><summary>인자·결과 전체 보기</summary><pre>{show(e.input)}</pre><pre>{show(e.output)}</pre></details>
            </li>);
        })}</ol>
      </section>

      {r.final_output && <section><h2>AI 최종 응답</h2>
        <p className="final">{r.final_output}</p>
        {verdict === "caught" && extraActs.length > 0 && <p className="said-did">
          ⚠️ AI는 이렇게 답했지만, 위에서 본 것처럼 요청에 없던 행동을 {extraActs.length}번 했어요.</p>}
      </section>}
    </div>
  );
}
