import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { loading, session } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="brand__mark" aria-hidden="true">F</span>
        <p>Comprobando sesión…</p>
      </main>
    );
  }
  if (!session) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to="/login" replace state={{ returnTo }} />;
  }
  return children;
}
