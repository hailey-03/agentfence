import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, COND_LABEL } from "../api";
import type { RunDetail } from "../types";

const show = (v: unknown) => typeof v === "string" ? v : JSON.stringify(v, null, 2);

export default function RunResult() {
  const { id } = useParams();
  const [r, setR] = useState<RunDetail | null>(null); const [error, setError] = useState("");
  useEffect(() => { api<RunDetail>(`/runs/${id}`).then(setR).catch((e) => setError(e.message)); }, [id]);
  if (!r) return error ? <p className="error">{error}</p> : <p className="muted">불러오는 중</p>;

  const executed = r.decisions.filter((d) => d.executed);
  const denied = r.decisions.filter((d) => d.decision === "DENY");
  return (
    <div className="stack-lg">
      <Link to={`/scenarios/${r.scenario_id}`} className="back">← 시나리오로</Link>
      <section className={`verdict ${denied.length ? "has-deny" : "clean"}`}>
        <h1>{COND_LABEL[r.condition]}</h1>
        <p>도구 호출 {r.decisions.length}건 중 <b>{executed.length}건 실행</b>, <b>{denied.length}건 차단</b>.
          업무 {r.task_success ? "성공" : "실패"}.</p>
      </section>

      <section><h2>도구 호출 하나하나</h2>
        <ol className="calls">{r.decisions.map((d) => (
          <li key={d.seq} className={d.decision === "DENY" ? "call bad" : "call ok"}>
            <div className="call-head">
              <span className="seq">{d.seq}</span><code>{d.tool}</code>
              <span className={d.decision === "DENY" ? "badge bad" : "badge ok"}>
                {d.decision === "DENY" ? "차단" : "실행"}</span>
              {d.ruleId && <span className="rule">{d.ruleId}</span>}
            </div>
            <p className="reason">{d.reason}</p>
            {r.condition !== "C" && d.wouldDeny.length > 0 &&
              <p className="would">C였다면 막혔을 규칙: {d.wouldDeny.join(", ")}</p>}
            <details><summary>인자 보기</summary><pre>{show(d.args)}</pre></details>
          </li>))}</ol>
      </section>

      {r.final_output && <section><h2>AI 최종 응답</h2><p className="final">{r.final_output}</p></section>}
    </div>
  );
}
