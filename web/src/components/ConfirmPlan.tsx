import { RULE_LABEL } from "../api";
import type { Plan, ToolInfo } from "../types";

export type Warning = { level: "danger" | "info"; text: string; tools: string[] };   // tools: 경고에 걸린 도구

/** 저장된 계획과 지금 고친 계획을 비교해 바뀐 점을 문장으로 만든다. */
export function planChanges(base: Plan | null, next: Plan): string[] {
  if (!base) return [];
  const out: string[] = [];
  for (const t of next.tools) {
    const b = base.tools.find((x) => x.tool === t.tool);
    if (!b) continue;
    if (b.rule !== t.rule) {
      out.push(`${t.tool}: ${RULE_LABEL[b.rule]} → ${RULE_LABEL[t.rule]}${t.rule === "FORBIDDEN" ? "" : ` (최대 ${t.maxCalls}회)`}`);
    } else if (b.maxCalls !== t.maxCalls) {
      out.push(`${t.tool}: 최대 ${b.maxCalls}회 → ${t.maxCalls}회`);
    }
  }
  if (base.allowSensitiveToExternal !== next.allowSensitiveToExternal) {
    out.push(`민감 데이터 외부 전송: ${next.allowSensitiveToExternal ? "허용 안 함 → 허용" : "허용 → 허용 안 함"}`);
  }
  return out;
}

/** 확정하려는 계획에서 위험한 허용이나 비교가 무의미해지는 설정을 찾는다. */
export function planWarnings(task: string, plan: Plan, tools: ToolInfo[]): Warning[] {
  const risk = (n: string) => tools.find((t) => t.name === n)?.risk;
  const allowed = plan.tools.filter((t) => t.rule !== "FORBIDDEN");
  const names = (r: string) => allowed.filter((t) => risk(t.tool) === r).map((t) => t.tool);
  const sensitive = names("READ_SENSITIVE"), external = names("EXTERNAL"), destructive = names("DESTRUCTIVE");
  const w: Warning[] = [];

  if (sensitive.length && external.length) {
    w.push({ level: "danger", text: `민감 조회(${sensitive.join(", ")})와 외부 전송(${external.join(", ")})을 함께 허용했어요. 내부 정보를 읽어서 밖으로 보낼 수 있는, 정보 유출 경로가 됩니다.`, tools: [...sensitive, ...external] });
  }
  if (plan.allowSensitiveToExternal) {
    w.push({ level: "danger", text: "‘민감 데이터 외부 전송 허용’을 켰어요. 요청에 정말 필요한 경우에만 켜세요.", tools: [] });
  }
  if (destructive.length && !/삭제|지워|지우/.test(task)) {
    w.push({ level: "danger", text: `요청에 삭제가 없는데 ${destructive.join(", ")}을(를) 허용했어요.`, tools: destructive });
  }
  if (external.length && !/@|보내|전송|공유|발송|회신|안내|게시|올려/.test(task)) {
    w.push({ level: "danger", text: `요청에 보내는 대상이나 전송 요청이 없는데 외부 전송(${external.join(", ")})을 허용했어요.`, tools: external });
  }
  if (allowed.length === 0) {
    w.push({ level: "info", text: "모든 도구를 금지했어요. AI가 요청을 처리할 수 없어요.", tools: [] });
  } else if (!plan.tools.some((t) => t.rule === "MUST")) {
    w.push({ level: "info", text: "‘꼭 호출’ 도구가 없어요. AI가 아무것도 하지 않아도 결과가 ‘같음’으로 나와요.", tools: [] });
  }
  return w;
}

export default function ConfirmPlan({ task, base, plan, tools, baseLabel, busy, error, onCancel, onConfirm, onConfirmAndRun }: {
  task: string; base: Plan | null; plan: Plan; tools: ToolInfo[]; baseLabel: string;
  busy: boolean; error: string;
  onCancel: () => void; onConfirm: () => void; onConfirmAndRun: () => void;
}) {
  const changes = planChanges(base, plan);
  const warnings = planWarnings(task, plan, tools);
  const danger = warnings.some((w) => w.level === "danger");
  return (
    <div className="modal-back" role="presentation" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape" && !busy) onCancel(); }}>
        <h2 id="confirm-title">이 계획으로 확정할까요?</h2>

        <section>
          <h3>{baseLabel}에서 바뀐 점 {changes.length > 0 && <span className="count">{changes.length}개</span>}</h3>
          {changes.length ? <ul className="changes">{changes.map((c) => <li key={c}>{c}</li>)}</ul>
            : <p className="muted">바뀐 점이 없어요. {baseLabel} 그대로 확정합니다.</p>}
        </section>

        {warnings.length > 0 && <section>
          <h3>확인해 주세요</h3>
          <ul className="warnings">{warnings.map((w) => (
            <li key={w.text} className={w.level}>{w.level === "danger" ? "⚠️" : "ℹ️"} {w.text}</li>))}</ul>
        </section>}

        <p className="hint">확정하면 AI는 이 계획대로만 행동해야 하고, 벗어나면 실행 결과에 ‘차이’로 표시됩니다.</p>
        {error && <p className="error">{error}</p>}
        <div className="actions">
          <button onClick={onCancel} disabled={busy} autoFocus>다시 고치기</button>
          <button className={danger ? "danger" : undefined} onClick={onConfirm} disabled={busy}>
            {danger ? "경고를 확인했고 확정" : "확정"}</button>
          <button className={danger ? "danger" : "primary"} onClick={onConfirmAndRun} disabled={busy}>
            {busy ? "처리 중" : "확정 후 실행"}</button>
        </div>
      </div>
    </div>
  );
}
