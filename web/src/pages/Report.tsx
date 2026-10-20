import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, COND_LABEL } from "../api";

interface Metrics { attack_success: string; task_success_normal: string; false_positive: string }
interface Summary {
  conditions: Record<string, Metrics>;
  examples: { b_pass_c_block: string[]; c_cannot_block: string[] };
  cells: Record<string, { runs: number; attack: number; task: number; denied: number }>;
  repeats: number; docs: number;
}
interface Report { id: number; created_at: string; settings: { repeats: number; llm: string }; summary: Summary }

const CONDS = ["A", "B", "C", "D"];
const DOC_IDS = ["N1", "N2", "X1", "X2", "N3", "N4", "X3", "X4", "N5", "N6", "X5", "X6"];
const pct = (s: string) => Number((s.match(/\((\d+)%\)/) ?? [])[1] ?? NaN);

export default function Report() {
  const { id } = useParams();
  const [list, setList] = useState<{ id: number; created_at: string }[] | null>(null);
  const [rep, setRep] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (id) { api<Report>(`/eval/reports/${id}`).then(setRep).catch((e) => setError(e.message)); }
    else { api<{ id: number; created_at: string }[]>("/eval/reports").then(setList).catch((e) => setError(e.message)); }
  }, [id]);

  if (error) return <p className="error">{error}</p>;

  if (!id) {
    if (!list) return <p className="muted">불러오는 중</p>;
    return (
      <div className="stack-lg">
        <h1>실험 리포트</h1>
        {list.length === 0
          ? <p className="muted">아직 리포트가 없어요. 터미널에서 <code>python -m eval.run_eval</code> 을 실행하세요.</p>
          : <ul className="list">{list.map((r) => (
              <li key={r.id}><Link to={`/report/${r.id}`}>
                <span className="row-title">리포트 #{r.id}</span>
                <span className="meta">{r.created_at}</span></Link></li>))}</ul>}
      </div>
    );
  }

  if (!rep) return <p className="muted">불러오는 중</p>;
  const s = rep.summary;

  const barColor = (cond: string) => cond === "C" ? "var(--ok)" : "var(--bad)";

  return (
    <div className="stack-lg">
      <Link to="/report" className="back">← 리포트 목록</Link>
      <section>
        <h1>실험 리포트 #{rep.id}</h1>
        <p className="meta">문서 {s.docs}개 · 조건 4개 · 반복 {s.repeats}회 · 모델 {rep.settings.llm}</p>
      </section>

      {/* 공격 성공률 막대: 낮을수록 좋다 */}
      <section className="panel">
        <h2>공격 성공률 (낮을수록 좋음)</h2>
        <div className="bars">{CONDS.map((c) => {
          const v = pct(s.conditions[c].attack_success);
          return (
            <div className="bar-row" key={c}>
              <span className="bar-label">{COND_LABEL[c]}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${v}%`, background: barColor(c) }} /></div>
              <span className="bar-val">{s.conditions[c].attack_success}</span>
            </div>);
        })}</div>
      </section>

      <section className="panel">
        <h2>조건별 지표</h2>
        <div className="table-wrap"><table>
          <thead><tr><th>조건</th><th>공격 성공률</th><th>정상 업무 성공</th><th>오탐률</th></tr></thead>
          <tbody>{CONDS.map((c) => (
            <tr key={c} className={c === "C" ? "highlight" : ""}>
              <td><b>{COND_LABEL[c]}</b></td>
              <td>{s.conditions[c].attack_success}</td>
              <td>{s.conditions[c].task_success_normal}</td>
              <td>{s.conditions[c].false_positive}</td></tr>))}
          </tbody></table></div>
      </section>

      {/* 문서 × 조건 격자 */}
      <section className="panel">
        <h2>문서 × 조건 (공격이 실행되면 빨강, 막히면 초록)</h2>
        <div className="grid-wrap">
          <table className="grid"><thead><tr><th>문서</th>{CONDS.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>{DOC_IDS.map((d) => (
              <tr key={d}>
                <td className={d.startsWith("X") ? "doc attack" : "doc"}>{d}</td>
                {CONDS.map((c) => {
                  const cell = s.cells[`${c}|${d}`];
                  const attack = cell?.attack > 0;
                  const denied = cell?.denied > 0;
                  const cls = d.startsWith("X")
                    ? (attack ? "cell bad" : "cell ok")
                    : (denied ? "cell warn" : "cell neutral");
                  const mark = d.startsWith("X") ? (attack ? "뚫림" : "막음") : (denied ? "오탐" : "정상");
                  return <td key={c} className={cls} title={`${c}|${d}`}>{mark}</td>;
                })}
              </tr>))}
            </tbody></table>
        </div>
      </section>

      <section className="panel">
        <h2>핵심 사례</h2>
        <p><b className="ok-text">B는 뚫렸지만 C가 막은 공격:</b> {s.examples.b_pass_c_block.join(", ") || "없음"}</p>
        <p><b className="bad-text">C도 못 막은 공격(한계):</b> {[...new Set(s.examples.c_cannot_block)].join(", ") || "없음"}
          <span className="muted"> — 허용된 도구 안에서 내용만 조작하는 공격은 행동 검사로 막기 어렵습니다.</span></p>
      </section>
    </div>
  );
}
