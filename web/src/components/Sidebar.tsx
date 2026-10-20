import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import type { ScenarioBrief } from "../types";

// 대화 기록처럼 날짜별로 묶는다 (사용자 지역 시간 기준)
function bucket(iso: string, now: Date): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return "지난 7일";
  if (diff < 30) return "지난 30일";
  return "이전";
}
const ORDER = ["오늘", "어제", "지난 7일", "지난 30일", "이전"];

export default function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { pathname } = useLocation();
  const [list, setList] = useState<ScenarioBrief[] | null>(null);
  const [q, setQ] = useState("");
  // 화면이 바뀔 때마다 다시 불러온다 (새로 만든 시나리오·실행 횟수 반영)
  useEffect(() => { api<ScenarioBrief[]>("/scenarios").then(setList).catch(() => setList([])); }, [pathname]);

  const active = pathname.match(/^\/scenarios\/(\d+)/)?.[1];
  const now = new Date();
  const shown = (list ?? []).filter((s) => !q.trim() || s.task.toLowerCase().includes(q.trim().toLowerCase())
    || s.pdf_name.toLowerCase().includes(q.trim().toLowerCase()));
  const groups = ORDER.map((g) => ({ g, items: shown.filter((s) => bucket(s.created_at, now) === g) }))
    .filter((x) => x.items.length > 0);

  return (
    <aside className={`sidebar${open ? " open" : ""}`} aria-label="내 시나리오">
      <Link to="/" className="new-scenario" onClick={onNavigate}>＋ 새 시나리오</Link>
      <input className="side-search" type="search" placeholder="시나리오 검색" value={q}
        onChange={(e) => setQ(e.target.value)} aria-label="시나리오 검색" />
      <nav className="side-list">
        {list === null ? <p className="muted side-empty">불러오는 중</p>
          : list.length === 0 ? <p className="muted side-empty">아직 시나리오가 없어요.</p>
          : groups.length === 0 ? <p className="muted side-empty">‘{q}’에 맞는 시나리오가 없어요.</p>
          : groups.map(({ g, items }) => (
            <div key={g} className="side-group">
              <h3>{g}</h3>
              <ul>{items.map((s) => (
                <li key={s.id}>
                  <Link to={`/scenarios/${s.id}`} onClick={onNavigate} title={`${s.task}\n${s.pdf_name}`}
                    className={String(s.id) === active ? "on" : undefined} aria-current={String(s.id) === active ? "page" : undefined}>
                    <span className="side-title">{s.task}</span>
                    <span className="side-meta">{s.pdf_name}{s.run_count > 0 ? ` · 실행 ${s.run_count}` : ""}
                      {!s.plan_confirmed && " · 계획 전"}</span>
                  </Link></li>))}</ul>
            </div>))}
      </nav>
    </aside>
  );
}
