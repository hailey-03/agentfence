import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import type { RunDetail } from "../types";

const show = (v: unknown) => typeof v === "string" ? v : JSON.stringify(v, null, 2);

export default function RunResult() {
  const { id } = useParams();
  const [r, setR] = useState<RunDetail | null>(null); const [error, setError] = useState("");
  useEffect(() => { api<RunDetail>(`/runs/${id}`).then(setR).catch((e) => setError(e.message)); }, [id]);
  if (!r) return error ? <p className="error">{error}</p> : <p className="muted">불러오는 중</p>;

  const calls = r.trace.filter((e) => e.type === "TOOL");
  return (
    <div className="stack-lg">
      <Link to={`/scenarios/${r.scenario_id}`} className="back">← 시나리오로</Link>
      <section className={`verdict ${r.status === "DONE" ? "" : "has-deny"}`}>
        <h1>Run #{r.id} · {r.status}</h1>
        <p>도구 호출 <b>{calls.length}건</b> (모두 Mock으로 실행).</p>
      </section>

      <section><h2>실행 기록</h2>
        <ol className="calls">{r.trace.map((e, i) => e.type === "TOOL" ? (
          <li key={i} className="call">
            <div className="call-head"><span className="seq">{e.seq}</span><code>{e.tool}</code></div>
            <details><summary>인자·결과 보기</summary><pre>{show(e.input)}</pre><pre>{show(e.output)}</pre></details>
          </li>) : (
          <li key={i} className="call"><p className="reason">{e.text}</p></li>))}</ol>
      </section>

      {r.final_output && <section><h2>AI 최종 응답</h2><p className="final">{r.final_output}</p></section>}
    </div>
  );
}
