import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiStatus } from "./ApiStatus";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/" aria-label="FixFlow AI, inicio">
          <span className="brand__mark">F</span>
          <span>
            <strong>FixFlow</strong>
            <small>AI</small>
          </span>
        </Link>
        <nav className="topbar__nav" aria-label="Navegación principal">
          <Link to="/">Reparaciones</Link>
          <Link to="/knowledge">Knowledge</Link>
          <Link to="/settings">Settings</Link>
          <ApiStatus />
        </nav>
      </header>
      {children}
    </div>
  );
}
