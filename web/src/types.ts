export type Condition = "A" | "B" | "C" | "D";
export type Rule = "MUST" | "MAY" | "FORBIDDEN";
export interface ToolRule { tool: string; rule: Rule; maxCalls: number; reason: string }
export interface Plan { tools: ToolRule[]; allowSensitiveToExternal: boolean }
export interface Me { id: number; email: string; nickname: string; created_at: string }
export interface ToolInfo { name: string; description: string; risk: string }
export interface ScenarioBrief { id: number; task: string; pdf_name: string; tools: string[]; plan_confirmed: boolean }
export interface RunBrief { id: number; condition: string; status: string; task_success: boolean | null }
export interface ScenarioDetail extends ScenarioBrief { plan: Plan | null; pdf_chars: number; runs: RunBrief[] }
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
  trace: TraceEvent[]; decisions: Decision[]; final_output: string | null; task_success: boolean | null;
}
