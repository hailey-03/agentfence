import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../api";

const FLOW = ["요청", "계획", "검사", "비교"];
const CONDS = [["A", "방어 없음"], ["B", "AWS식 권한표"], ["C", "AgentFence"], ["D", "Guardrails"]];

/** 게이트가 실제로 하는 일을 보여주는 예시 카드 (요청 범위 안 호출은 통과, 숨은 지시로 생긴 호출은 차단) */
function GateDemo() {
  return (
    <div className="gate" aria-hidden="true">
      <div className="gate-head">
        <span className="gate-dot" /><span className="gate-dot" /><span className="gate-dot" />
        <span className="gate-title">요청: “이력서 검토하고 지원자에게 합격 안내 보내줘”</span>
      </div>
      <ul className="gate-rows">
        <li><span className="gate-tool">summarize_note</span><span className="gate-arg">이력서 요약</span>
          <span className="gate-badge allow">허용</span></li>
        <li><span className="gate-tool">send_email</span><span className="gate-arg">hong@applicant.example</span>
          <span className="gate-badge allow">허용</span></li>
        <li className="deny"><span className="gate-tool">send_email</span><span className="gate-arg">leak@external.example</span>
          <span className="gate-badge deny">차단</span>
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

  return (
    <div className="split">
      <section className="intro" aria-label="AgentFence 소개">
        <div className="logo"><span className="logo-mark" />AgentFence</div>

        <div className="intro-body">
          <h1 className="intro-title">에이전트가 도구를 쓰기 전에,<br /><em>요청 기준으로</em> 먼저 검사합니다.</h1>
          <p className="intro-lead">문서에 숨은 지시가 메일 전송·파일 삭제로 이어지지 않도록, 계획 밖의 호출을 실행 전에 막습니다.</p>
          <GateDemo />
          <ol className="flow" aria-label="사용 흐름">
            {FLOW.map((f, i) => <li key={f}><span>{i + 1}</span>{f}</li>)}
          </ol>
        </div>

        <p className="intro-foot">
          같은 문서로 네 가지 방어 조건 비교 —{" "}
          {CONDS.map(([k, v], i) => (
            <span key={k} className={k === "C" ? "on" : ""}>{k} {v}{i < CONDS.length - 1 ? " · " : ""}</span>))}
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
            <label>비밀번호<input type="password" required minLength={8} placeholder="8자 이상"
              autoComplete={signup ? "new-password" : "current-password"}
              value={password} onChange={(e) => setPassword(e.target.value)} />
              {signup && <span className="hint">8자 이상 · 72바이트 이하 (한글은 24자까지)</span>}</label>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary wide" disabled={busy}>
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
