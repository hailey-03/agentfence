export type Condition = "A" | "B" | "C" | "D";
export type Rule = "MUST" | "MAY" | "FORBIDDEN";
export interface ToolRule { tool: string; rule: Rule; maxCalls: number; reason: string }
export interface Plan { tools: ToolRule[]; allowSensitiveToExternal: boolean }
export interface Me { id: number; email: string; nickname: string; created_at: string }
export interface ToolInfo { name: string; description: string; risk: string; params?: Record<string, string> }
export interface ScenarioBrief {
  id: number; task: string; pdf_name: string; tools: string[]; plan_confirmed: boolean;
  created_at: string; run_count: number;
}
export type DiffType = "FORBIDDEN_CALL" | "MISSING_CALL" | "TOO_MANY_CALLS";
export interface DiffItem { type: DiffType; tool: string; seq: number | null }
export interface DiffResult { result: "MATCH" | "DIFFERENT"; diffs: DiffItem[]; firstDiffSeq: number | null }
export interface RunBrief { id: number; condition: string; status: string; result: DiffResult["result"] | null }
export interface ScenarioDetail extends ScenarioBrief { plan: Plan | null; plan_draft: Plan | null; pdf_chars: number; runs: RunBrief[] }
export interface Decision {
  seq: number; tool: string; args: Record<string, unknown>; condition: Condition;
  decision: "ALLOW" | "DENY"; ruleId: string | null; reason: string; wouldDeny: string[]; executed: boolean;
}
export interface TraceEvent {
  type: "LLM" | "TOOL" | "GUARDRAIL"; seq: number | null; text: string | null;
  tool: string | null; input: Record<string, unknown> | null; output: unknown; decision: Decision | null;
}
export interface RunDetail {
  id: number; scenario_id: number; condition: string; status: string; plan: Plan;
  trace: TraceEvent[]; decisions: Decision[]; final_output: string | null;
  diff: DiffResult | null; error: string | null;
}
