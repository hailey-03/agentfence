import { RISK_LABEL, RULE_LABEL } from "../api";
import type { Plan, Rule, ToolInfo } from "../types";

const STRICTNESS: Record<Rule, number> = { FORBIDDEN: 0, MAY: 1, MUST: 2 };   // 클수록 더 많이 허용

type Row = { tool: string; risk: string; from: string; to: string; note: string; kind: "wider" | "narrower" | "other" };

const show = (rule: Rule, max: number) => rule === "FORBIDDEN" ? RULE_LABEL[rule] : `${RULE_LABEL[rule]} (최대 ${max}회)`;

/** AI 초안과 확정 계획을 도구별로 비교하고, 바뀐 방향을 한 줄로 풀어 쓴다. */
export function compareDraft(draft: Plan, final: Plan, tools: ToolInfo[]): Row[] {
  const rows: Row[] = [];
  for (const f of final.tools) {
    const d = draft.tools.find((x) => x.tool === f.tool);
    if (!d || (d.rule === f.rule && d.maxCalls === f.maxCalls)) continue;
    const risk = tools.find((t) => t.name === f.tool)?.risk ?? "";
    const label = RISK_LABEL[risk] ?? "도구";
    let note: string, kind: Row["kind"];
    if (d.rule === "FORBIDDEN") {
      note = `AI가 금지한 ${label} 도구를 허용했어요.`; kind = "wider";
    } else if (f.rule === "FORBIDDEN") {
      note = `AI가 허용한 ${label} 도구를 금지했어요.`; kind = "narrower";
    } else if (d.rule !== f.rule) {
      const up = STRICTNESS[f.rule] > STRICTNESS[d.rule];
      note = up ? "‘필요하면 사용’에서 ‘꼭 사용’으로 바꿨어요. 호출하지 않으면 차이로 잡혀요."
                : "‘꼭 사용’에서 ‘필요하면 사용’으로 바꿨어요. 호출하지 않아도 괜찮아요.";
      kind = "other";
    } else {
      const more = f.maxCalls > d.maxCalls;
      note = `최대 호출 수를 ${more ? "늘렸어요" : "줄였어요"}.`; kind = more ? "wider" : "narrower";
    }
    rows.push({ tool: f.tool, risk, from: show(d.rule, d.maxCalls), to: show(f.rule, f.maxCalls), note, kind });
  }
  if (draft.allowSensitiveToExternal !== final.allowSensitiveToExternal) {
    rows.push({ tool: "민감 데이터 외부 전송", risk: "", kind: final.allowSensitiveToExternal ? "wider" : "narrower",
      from: draft.allowSensitiveToExternal ? "허용" : "허용 안 함", to: final.allowSensitiveToExternal ? "허용" : "허용 안 함",
      note: final.allowSensitiveToExternal ? "민감 데이터를 외부로 보내는 것을 허용했어요." : "민감 데이터 외부 전송을 막았어요." });
  }
  return rows;
}

export default function DraftCompare({ draft, final, tools }: { draft: Plan | null; final: Plan; tools: ToolInfo[] }) {
  if (!draft) {
    return <div className="draft-compare"><h3>AI 초안과 비교</h3>
      <p className="muted">이 계획은 AI 초안 기록이 없어서 비교할 수 없어요. [다시 만들기]로 초안을 새로 받으면 다음 확정부터 비교돼요.</p></div>;
  }
  const rows = compareDraft(draft, final, tools);
  const wider = rows.filter((r) => r.kind === "wider").length;
  const narrower = rows.filter((r) => r.kind === "narrower").length;
  return (
    <div className="draft-compare">
      <h3>AI 초안과 비교</h3>
      {rows.length === 0 ? <p className="ok-text">AI 초안을 그대로 확정했어요.</p> : <>
        <p>AI 초안에서 <b>{rows.length}곳</b>을 바꿔 확정했어요.
          {wider > 0 && <span className="pill-inline wider">허용 넓힘 {wider}</span>}
          {narrower > 0 && <span className="pill-inline narrower">허용 좁힘 {narrower}</span>}</p>
        <div className="table-wrap"><table>
          <thead><tr><th>도구</th><th>AI 초안</th><th></th><th>확정</th><th>변경점</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.tool} className={`change-${r.kind}`}>
              <td><code>{r.tool}</code>{r.risk && <span className="tag">{RISK_LABEL[r.risk]}</span>}</td>
              <td className="muted">{r.from}</td><td aria-hidden="true">→</td><td><b>{r.to}</b></td>
              <td>{r.note}</td></tr>))}
          </tbody></table></div>
        {wider > 0 && <p className="hint">허용을 넓힌 도구는 AI가 호출해도 ‘차이’로 잡히지 않아요. 요청에 정말 필요한지 확인하세요.</p>}
      </>}
    </div>
  );
}
