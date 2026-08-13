import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

function safeReturnTo(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function Login() {
  const { loading, session, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const returnTo = safeReturnTo((location.state as { returnTo?: unknown } | null)?.returnTo);

  if (!loading && session) return <Navigate to={returnTo} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
      navigate(returnTo, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand" aria-label="FixFlow AI">
          <span className="brand__mark" aria-hidden="true">F</span>
          <span><strong>FixFlow</strong><small>AI</small></span>
        </div>
        <div>
          <p className="eyebrow">Acceso restringido</p>
          <h1 id="login-title">Iniciar sesión</h1>
          <p className="login-intro">Ingresá las credenciales de la prueba de concepto.</p>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field">
            Usuario
            <input
              name="username"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="field">
            Contraseña
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && <p className="notice notice--error" role="alert">{error}</p>}
          <button className="button button--primary button--full" disabled={submitting} type="submit">
            {submitting ? "Verificando…" : "Ingresar"}
          </button>
        </form>
      </section>
    </main>
  );
}
