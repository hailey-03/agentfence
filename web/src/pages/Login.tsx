import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      const { token } = await api<{ token: string }>(`/auth/${mode}`, {
        method: "POST", body: JSON.stringify({ email, password }) });
      setToken(token); nav("/");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="auth">
      <h1 className="auth-title">AgentFence</h1>
      <p className="muted">AI 에이전트의 도구 호출을 사용자 요청 기준으로 검사합니다.</p>
      <div className="tabs">
        <button className={mode === "signup" ? "tab on" : "tab"} onClick={() => setMode("signup")}>가입</button>
        <button className={mode === "login" ? "tab on" : "tab"} onClick={() => setMode("login")}>로그인</button>
      </div>
      <form onSubmit={submit} className="stack">
        <label>이메일<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>비밀번호<input type="password" required minLength={8} value={password}
          onChange={(e) => setPassword(e.target.value)} />
          {mode === "signup" && <span className="hint">8자 이상</span>}</label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{mode === "signup" ? "가입하고 시작" : "로그인"}</button>
      </form>
    </main>
  );
}
