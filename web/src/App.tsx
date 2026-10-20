import { useEffect, useState } from "react";
import { HashRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { api, getToken } from "./api";
import type { Me } from "./types";
import Login from "./pages/Login";
import Scenarios from "./pages/Scenarios";
import ScenarioDetail from "./pages/ScenarioDetail";
import RunResult from "./pages/RunResult";
import MyPage from "./pages/MyPage";

function Shell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => { if (getToken()) api<Me>("/users/me").then(setMe).catch(() => {}); }, []);
  if (!getToken()) return <Navigate to="/login" replace />;
  return (<>
    <header className="topbar">
      <Link to="/" className="brand">AgentFence</Link>
      <nav className="nav"><Link to="/">시나리오</Link></nav>
      <div className="user-menu">
        {/* 로그아웃은 마이페이지에서만 */}
        <Link to="/me" className="me-link">{me ? `${me.nickname} 님` : "마이페이지"}</Link>
      </div>
    </header>
    <main className="page">{children}</main>
  </>);
}

export default function App() {
  return (<HashRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/" element={<Shell><Scenarios /></Shell>} />
    <Route path="/scenarios/:id" element={<Shell><ScenarioDetail /></Shell>} />
    <Route path="/runs/:id" element={<Shell><RunResult /></Shell>} />
    <Route path="/me" element={<Shell><MyPage /></Shell>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></HashRouter>);
}
