import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

export default function Login() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(""); setBusy(true);
    try {
      // 가입은 사용자 정보만 돌려주므로, 가입 직후 같은 값으로 로그인해 토큰을 받는다
      if (mode === "signup")
        await api("/auth/signup", { method: "POST", body: JSON.stringify({ email, password, nickname }) });
      const { access_token } = await api<{ access_token: string }>("/auth/login", {
        method: "POST", body: new URLSearchParams({ username: email, password }) });
      setToken(access_token); nav("/");
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
        {mode === "signup" && (
          <label>닉네임<input required maxLength={50} value={nickname}
            onChange={(e) => setNickname(e.target.value)} /></label>)}
        <label>비밀번호<input type="password" required minLength={8} value={password}
          onChange={(e) => setPassword(e.target.value)} />
          {mode === "signup" && <span className="hint">8자 이상 · 72바이트 이하 (한글 24자)</span>}</label>
        {error && <p className="error">{error}</p>}
        <button className="primary" disabled={busy}>{mode === "signup" ? "가입하고 시작" : "로그인"}</button>
      </form>
    </main>
  );
}
