const KEY = "af_token";
export const getToken = () => localStorage.getItem(KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY));

export class ApiError extends Error { constructor(public status: number, m: string) { super(m); } }

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // FormData·URLSearchParams(로그인 폼)는 브라우저가 Content-Type을 정한다
  if (typeof opts.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(`/api${path}`, { ...opts, headers });
  if (res.status === 401 && !path.startsWith("/auth")) { setToken(null); location.hash = "#/login"; }
  if (!res.ok) {
    let msg = `요청 실패 (${res.status})`;
    try { const b = await res.json(); if (typeof b.detail === "string") msg = b.detail;
      else if (Array.isArray(b.detail)) msg = b.detail.map((d: { msg: string }) => d.msg).join(", "); } catch { /**/ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const COND_LABEL: Record<string, string> = {
  A: "A 방어 없음", B: "B AWS식 권한표", C: "C AgentFence", D: "D Guardrails",
};
export const RULE_LABEL: Record<string, string> = { MUST: "꼭 호출", MAY: "호출 가능", FORBIDDEN: "호출 금지" };
