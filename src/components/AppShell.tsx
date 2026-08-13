import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiStatus } from "./ApiStatus";
import { useAuth } from "../auth/AuthContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { session, logout } = useAuth();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  async function handleLogout() {
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError("No pudimos cerrar la sesión. Intentá nuevamente.");
    }
  }
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
          <button className="topbar__logout" type="button" onClick={() => void handleLogout()}>
            <span className="sr-only">Cerrar sesión de {session?.username}</span>
            <span aria-hidden="true">Salir</span>
          </button>
        </nav>
      </header>
      {logoutError && <p className="logout-error" role="alert">{logoutError}</p>}
      {children}
    </div>
  );
}
