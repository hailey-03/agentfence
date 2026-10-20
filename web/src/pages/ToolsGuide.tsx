import { useEffect, useState } from "react";
import { api, RISK_LABEL, RISK_ORDER } from "../api";
import type { ToolInfo } from "../types";

// 위험 등급이 무엇을 뜻하는지 한 줄씩. 계획을 세울 때 무엇을 조심해야 하는지 알려 준다
const RISK_HELP: Record<string, string> = {
  WRITE_INTERNAL: "회사 안의 노트·문서·일정·데이터에 기록하거나 고칩니다. 밖으로 나가지는 않아요.",
  READ_SENSITIVE: "개인 메모, 인사·고객 정보처럼 민감한 내용을 읽습니다. 읽은 내용이 밖으로 나가면 유출이 돼요.",
  EXTERNAL: "메일·슬랙·외부 링크처럼 회사 밖으로 데이터를 보냅니다. 민감 조회와 함께 쓰이면 가장 위험해요.",
  DESTRUCTIVE: "파일을 지웁니다. 실제 환경이라면 되돌리기 어려워요.",
};

export default function ToolsGuide() {
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<ToolInfo[]>("/tools").then(setTools).catch((e) => setError(e.message)); }, []);

  if (!tools) return error ? <p className="error">{error}</p> : <p className="muted">불러오는 중</p>;
  const groups = [...RISK_ORDER, "OTHER"].map((r) => ({
    risk: r, items: tools.filter((t) => (RISK_ORDER.includes(t.risk) ? t.risk : "OTHER") === r),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="stack-lg">
      <section>
        <h1>도구 소개</h1>
        <p className="muted">시나리오에서 AI에게 줄 수 있는 도구 {tools.length}개예요.
          모두 실험용 가짜 도구라, AI가 불러도 실제로 메일이 나가거나 데이터가 바뀌지는 않아요.</p>
      </section>
      <nav className="tool-jump" aria-label="위험 등급으로 이동">
        {groups.map((g) => <a key={g.risk} href={`#tools-${g.risk}`} onClick={(e) => { e.preventDefault();
          document.getElementById(`tools-${g.risk}`)?.scrollIntoView({ behavior: "smooth" }); }}>
          {RISK_LABEL[g.risk] ?? "기타"} {g.items.length}</a>)}
      </nav>
      {groups.map((g) => (
        <section key={g.risk} id={`tools-${g.risk}`} className={`tool-group risk-${g.risk}`}>
          <h2>{RISK_LABEL[g.risk] ?? "기타"} <span className="muted">{g.items.length}개</span></h2>
          {RISK_HELP[g.risk] && <p className="muted">{RISK_HELP[g.risk]}</p>}
          <div className="tool-cards">{g.items.map((t) => (
            <article key={t.name} className="tool-card">
              <code>{t.name}</code>
              <p>{t.description.replace(/한다\./g, "합니다.")}</p>
              {t.params && Object.keys(t.params).length > 0 && <dl>{Object.entries(t.params).map(([k, v]) => (
                <div key={k}><dt><code>{k}</code></dt><dd>{v}</dd></div>))}</dl>}
            </article>))}</div>
        </section>))}
    </div>
  );
}
