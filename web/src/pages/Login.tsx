import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

const FLOW = ["요청", "계획", "모의 실행", "비교"];
// 가입 비밀번호 규칙 — 서버(app/auth.py PASSWORD_RULES)와 같게 유지
const PW_RULES: [string, (p: string) => boolean][] = [
  ["8자 이상", (p) => p.length >= 8],
  ["영문 대문자", (p) => /[A-Z]/.test(p)],
  ["영문 소문자", (p) => /[a-z]/.test(p)],
  ["숫자", (p) => /[0-9]/.test(p)],
  ["특수문자", (p) => /[^A-Za-z0-9\s]/.test(p)],
];
const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** 점검 결과 예시 카드: 모의 실행한 호출을 계획과 비교 — 요청 범위 안은 "요청대로", 숨은 지시로 생긴 호출은 "요청에 없던 행동" */
function GateDemo() {
  return (
    <div className="gate" aria-hidden="true">
      <div className="gate-head">
        <span className="gate-dot" /><span className="gate-dot" /><span className="gate-dot" />
        <span className="gate-title">요청: “이력서 검토하고 지원자에게 합격 안내 보내줘”</span>
      </div>
      <ul className="gate-rows">
        <li><span className="gate-tool">summarize_note</span><span className="gate-arg">이력서 요약</span>
          <span className="gate-badge allow">요청대로</span></li>
        <li><span className="gate-tool">send_email</span><span className="gate-arg">hong@applicant.example</span>
          <span className="gate-badge allow">요청대로</span></li>
        <li className="deny"><span className="gate-tool">send_email</span><span className="gate-arg">leak@external.example</span>
          <span className="gate-badge deny">요청에 없던 행동</span>
          <span className="gate-why">PDF에 숨은 지시 · 요청에 없는 외부 전송</span></li>
      </ul>
    </div>
  );
}

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
  const signup = mode === "signup";
  const pwChecks = PW_RULES.map(([label, test]) => ({ label, ok: test(password) }));
  const pwTooLong = utf8Bytes(password) > 72;
  const pwOk = pwChecks.every((c) => c.ok) && !pwTooLong;

  return (
    <div className="split">
      <section className="intro" aria-label="AgentFence 소개">
        <div className="logo"><span className="logo-mark" />AgentFence</div>

        <div className="intro-body">
          <h1 className="intro-title">에이전트를 실제로 쓰기 전에,<br /><em>요청에 없던 행동</em>을 먼저 찾아냅니다.</h1>
          <p className="intro-lead">문서에 숨은 지시를 따라 메일 전송·파일 삭제 같은 일을 하는지, 가짜 도구로 미리 실행해 보고 요청에서 만든 계획과 비교합니다.</p>
          <GateDemo />
          <ol className="flow" aria-label="사용 흐름">
            {FLOW.map((f, i) => <li key={f}><span>{i + 1}</span>{f}</li>)}
          </ol>
        </div>

        <p className="intro-foot">
          <span className="on">모의 실행</span> — 도구 호출은 모두 가짜(Mock)로 실행되어 실제 메일·파일은 건드리지 않습니다.
        </p>
      </section>

      <section className="auth-side">
        <div className="auth-card">
          <div className="logo auth-logo"><span className="logo-mark" />AgentFence</div>
          <h2 className="auth-heading">{signup ? "계정 만들기" : "다시 오신 걸 환영해요"}</h2>
          <p className="muted">{signup ? "가입하면 바로 첫 시나리오를 만들 수 있어요." : "이메일과 비밀번호로 로그인하세요."}</p>

          <div className="seg" role="tablist">
            <button type="button" role="tab" aria-selected={signup} className={signup ? "on" : ""}
              onClick={() => switchMode("signup")}>가입</button>
            <button type="button" role="tab" aria-selected={!signup} className={!signup ? "on" : ""}
              onClick={() => switchMode("login")}>로그인</button>
          </div>

          <form onSubmit={submit} className="auth-form">
            <label>이메일<input type="email" required autoComplete="email" placeholder="name@company.com"
              value={email} onChange={(e) => setEmail(e.target.value)} /></label>
            {signup && (
              <label>닉네임<input required maxLength={50} autoComplete="nickname" placeholder="화면에 표시될 이름"
                value={nickname} onChange={(e) => setNickname(e.target.value)} /></label>)}
            <label>비밀번호<input type="password" required placeholder={signup ? "대·소문자, 숫자, 특수문자 포함 8자 이상" : "비밀번호"}
              autoComplete={signup ? "new-password" : "current-password"} aria-describedby={signup ? "pw-rules" : undefined}
              value={password} onChange={(e) => setPassword(e.target.value)} /></label>
            {signup && (
              <ul id="pw-rules" className="pw-rules" aria-live="polite">
                {pwChecks.map((c) => <li key={c.label} className={c.ok ? "ok" : ""}>{c.label}</li>)}
                {pwTooLong && <li className="bad">72바이트 이하 (한글은 글자당 3바이트)</li>}
              </ul>)}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary wide" disabled={busy || (signup && !pwOk)}>
              {busy ? "잠시만요…" : signup ? "가입하고 시작하기" : "로그인"}</button>
          </form>

          <p className="switch">
            {signup ? "이미 계정이 있나요?" : "처음이신가요?"}{" "}
            <button type="button" className="text-link" onClick={() => switchMode(signup ? "login" : "signup")}>
              {signup ? "로그인" : "가입하기"}</button>
          </p>
        </div>
      </section>
    </div>
  );
}
