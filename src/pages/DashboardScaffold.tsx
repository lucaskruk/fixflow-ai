import { ApiStatus } from "../components/ApiStatus";

export function DashboardScaffold() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="FixFlow AI, inicio">
          <span className="brand__mark">F</span>
          <span>
            <strong>FixFlow</strong>
            <small>AI</small>
          </span>
        </a>
        <ApiStatus />
      </header>

      <main className="workspace">
        <section className="hero-card">
          <div>
            <p className="eyebrow">Primera entrega</p>
            <h1>Base lista para el flujo de reparaciones</h1>
            <p className="hero-card__description">
              React, Hono y Cloudflare Workers ya comparten una aplicación
              desplegable. Los contratos del dominio están listos para conectar
              D1 en la siguiente entrega.
            </p>
          </div>
          <div className="hero-card__badge" aria-hidden="true">
            01
          </div>
        </section>

        <section className="milestone-grid" aria-label="Estado de la entrega">
          <article className="milestone-card">
            <span className="milestone-card__icon">UI</span>
            <h2>Cliente preparado</h2>
            <p>React, Vite, rutas SPA y una base visual responsive.</p>
          </article>
          <article className="milestone-card">
            <span className="milestone-card__icon">API</span>
            <h2>Worker conectado</h2>
            <p>Hono atiende las rutas de API dentro del runtime de Cloudflare.</p>
          </article>
          <article className="milestone-card">
            <span className="milestone-card__icon">Z</span>
            <h2>Contratos validados</h2>
            <p>Reparaciones, eventos, documentos y análisis usan esquemas Zod.</p>
          </article>
        </section>
      </main>
    </div>
  );
}

