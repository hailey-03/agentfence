import { useEffect, useState } from "react";
import { HashRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { api, getToken } from "./api";
import type { Me } from "./types";
import Login from "./pages/Login";
import Scenarios from "./pages/Scenarios";
import ScenarioDetail from "./pages/ScenarioDetail";
import RunResult from "./pages/RunResult";
import MyPage from "./pages/MyPage";
import ToolsGuide from "./pages/ToolsGuide";

function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [sideOpen, setSideOpen] = useState(false);   // 좁은 화면에서만 쓰는 사이드바 열림
  useEffect(() => { if (getToken()) api<Me>("/users/me").then(setMe).catch(() => {}); }, []);
  if (!getToken()) return <Navigate to="/login" replace />;
  return (<>
    <header className="topbar">
      <button className="side-toggle" aria-label="시나리오 목록 열기" aria-expanded={sideOpen}
        onClick={() => setSideOpen(!sideOpen)}>☰</button>
      <Link to="/" className="brand">AgentFence</Link>
      <nav className="nav"><Link to="/">시나리오</Link><Link to="/tools">도구 소개</Link></nav>
      <div className="user-menu">
        {/* 로그아웃은 마이페이지에서만 */}
        <Link to="/me" className="me-link">{me ? `${me.nickname} 님` : "마이페이지"}</Link>
      </div>
    </header>
    <div className="app-body">
      <Sidebar open={sideOpen} onNavigate={() => setSideOpen(false)} />
      <main className="page">{children}</main>
    </div>
  </>);
}

export default function App() {
  return (<HashRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Shell><Scenarios /></Shell>} />
    <Route path="/scenarios/:id" element={<Shell><ScenarioDetail /></Shell>} />
    <Route path="/runs/:id" element={<Shell><RunResult /></Shell>} />
    <Route path="/me" element={<Shell><MyPage /></Shell>} />
    <Route path="/tools" element={<Shell><ToolsGuide /></Shell>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></HashRouter>);
}
