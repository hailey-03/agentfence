import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

const STEPS = [
  { title: "시나리오 만들기", body: "사용자 요청과 PDF 문서, Agent에게 줄 도구를 고릅니다." },
  { title: "계획 확정", body: "요청에 맞춰 도구마다 꼭 호출 · 호출 가능 · 호출 금지를 정합니다." },
  { title: "실행 전 검사", body: "AI가 도구를 부를 때마다 게이트가 계획과 비교해 허용하거나 막습니다." },
  { title: "방어 조건 비교", body: "같은 문서로 네 가지 조건을 돌려 공격 성공률과 업무 성공률을 봅니다." },
];
const CONDS = [
  ["A", "방어 없음"], ["B", "AWS식 권한표"], ["C", "AgentFence"], ["D", "Guardrails"],
];

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

  function switchMode(m: "login" | "signup") { setMode(m); setError(""); }

  return (
    <div className="split">
      <section className="intro" aria-label="AgentFence 소개">
        <div className="intro-inner">
          <p className="intro-brand">AgentFence</p>
          <h1 className="intro-title">AI 에이전트가 도구를 쓰기 전에,<br />사용자 요청 기준으로 먼저 검사합니다.</h1>
          <p className="intro-lead">
            문서 속에 숨은 지시(프롬프트 인젝션)가 메일 전송·파일 삭제 같은 도구 호출로 이어지지 않도록,
            요청에서 만든 계획을 벗어나는 호출을 실행 전에 막습니다.
          </p>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="step-num">{i + 1}</span>
                <div><b>{s.title}</b><p>{s.body}</p></div>
              </li>
            ))}
          </ol>
          <div className="intro-conds">
            <p className="intro-label">비교하는 방어 조건</p>
            <ul>
              {CONDS.map(([k, v]) => (
                <li key={k} className={k === "C" ? "on" : ""}><b>{k}</b>{v}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="auth-side">
        <div className="auth-card">
          <h2 className="auth-heading">{mode === "signup" ? "계정 만들기" : "다시 오신 걸 환영해요"}</h2>
          <p className="muted">{mode === "signup" ? "가입하면 바로 시나리오를 만들 수 있어요." : "이메일과 비밀번호로 로그인하세요."}</p>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "tab on" : "tab"}
              onClick={() => switchMode("signup")}>가입</button>
            <button role="tab" aria-selected={mode === "login"} className={mode === "login" ? "tab on" : "tab"}
              onClick={() => switchMode("login")}>로그인</button>
          </div>
          <form onSubmit={submit} className="stack">
            <label>이메일<input type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} /></label>
            {mode === "signup" && (
              <label>닉네임<input required maxLength={50} autoComplete="nickname" value={nickname}
                onChange={(e) => setNickname(e.target.value)} /></label>)}
            <label>비밀번호<input type="password" required minLength={8} value={password}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              onChange={(e) => setPassword(e.target.value)} />
              {mode === "signup" && <span className="hint">8자 이상 · 72바이트 이하 (한글 24자)</span>}</label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary wide" disabled={busy}>
              {busy ? "잠시만요…" : mode === "signup" ? "가입하고 시작" : "로그인"}</button>
          </form>
        </div>
      </section>
    </div>
  );
}
