import { HashRouter, Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { getToken, setToken } from "./api";
import Login from "./pages/Login";
import Scenarios from "./pages/Scenarios";
import ScenarioDetail from "./pages/ScenarioDetail";
import RunResult from "./pages/RunResult";

function Shell({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  if (!getToken()) return <Navigate to="/login" replace />;
  return (<>
    <header className="topbar">
      <Link to="/" className="brand">AgentFence</Link>
      <nav className="nav"><Link to="/">시나리오</Link></nav>
      <button className="link" onClick={() => { setToken(null); nav("/login"); }}>로그아웃</button>
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
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></HashRouter>);
}
