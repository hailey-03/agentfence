import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getToken, setToken } from "../api";
import type { Me, ScenarioBrief } from "../types";

/** JWT 가운데 조각(payload)의 exp(초)를 읽는다. 서명 검증은 서버 몫이고 여기서는 표시용 */
function tokenExpiry(token: string | null): Date | null {
  try {
    const payload = JSON.parse(atob(token!.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null;
  } catch { return null; }
}

const fmt = (d: Date) => d.toLocaleString("ko-KR", { dateStyle: "long", timeStyle: "short" });

export default function MyPage() {
  const nav = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [list, setList] = useState<ScenarioBrief[] | null>(null);
  const [error, setError] = useState("");
  const expiry = tokenExpiry(getToken());

  useEffect(() => {
    api<Me>("/users/me").then(setMe).catch((e) => setError(e.message));
    api<ScenarioBrief[]>("/scenarios").then(setList).catch(() => setList([]));
  }, []);

  if (!me) return error ? <p className="error">{error}</p> : <p className="muted">불러오는 중</p>;
  const confirmed = list?.filter((s) => s.plan_confirmed).length ?? 0;

  return (
    <div className="mypage stack-lg">
      <section className="profile">
        <span className="avatar" aria-hidden="true">{me.nickname.slice(0, 1)}</span>
        <div>
          <h1>{me.nickname}</h1>
          <p className="muted">{me.email}</p>
        </div>
      </section>

      <section className="panel">
        <h2>계정 정보</h2>
        <dl className="info">
          <dt>닉네임</dt><dd>{me.nickname}</dd>
          <dt>이메일</dt><dd>{me.email}</dd>
          <dt>가입일</dt><dd>{fmt(new Date(me.created_at))}</dd>
          <dt>로그인 유지</dt>
          <dd>{expiry ? <>{fmt(expiry)}까지 <span className="muted">(이후 다시 로그인)</span></> : "알 수 없음"}</dd>
        </dl>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>내 활동</h2>
          <Link to="/">시나리오로 가기 →</Link>
        </div>
        <div className="stats">
          <div><b>{list?.length ?? "-"}</b><span>만든 시나리오</span></div>
          <div><b>{list ? confirmed : "-"}</b><span>계획 확정</span></div>
        </div>
      </section>

      <div>
        <button onClick={() => { setToken(null); nav("/login"); }}>로그아웃</button>
      </div>
    </div>
  );
}
