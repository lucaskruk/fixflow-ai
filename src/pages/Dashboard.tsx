import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { repairsApi } from "../api/repairs";
import { AppShell } from "../components/AppShell";
import { StatePanel } from "../components/StatePanel";
import { StatusBadge } from "../components/StatusBadge";
import type { Repair } from "../domain/schemas";
import { shortRepairId } from "../ui/repair-display";

export function Dashboard() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    repairsApi.list(controller.signal).then(setRepairs).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "No pudimos cargar las reparaciones.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [reloadKey]);

  const visibleRepairs = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    if (!normalized) return repairs;
    return repairs.filter((repair) =>
      [repair.id, repair.customerName, repair.brand, repair.model, repair.reportedIssue]
        .some((value) => value.toLocaleLowerCase("es").includes(normalized)),
    );
  }, [query, repairs]);

  const activeCount = repairs.filter((repair) => repair.status !== "DELIVERED").length;

  return (
    <AppShell>
      <main className="workspace dashboard">
        <header className="page-heading">
          <div>
            <p className="eyebrow">Mesa de trabajo</p>
            <h1>Reparaciones</h1>
            <p>Seguimiento claro desde la recepción hasta la entrega.</p>
          </div>
          <Link className="button button--primary" to="/repairs/new">
            <span aria-hidden="true">＋</span> Nueva reparación
          </Link>
        </header>

        {!loading && !error && repairs.length > 0 && (
          <section className="dashboard-toolbar" aria-label="Resumen y búsqueda">
            <div className="summary-stat">
              <strong>{activeCount}</strong>
              <span>equipos activos</span>
            </div>
            <div className="summary-stat">
              <strong>{repairs.length}</strong>
              <span>casos registrados</span>
            </div>
            <label className="search-field">
              <span className="sr-only">Buscar reparaciones</span>
              <span aria-hidden="true">⌕</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar cliente, equipo o problema…"
              />
            </label>
          </section>
        )}

        {loading && (
          <div className="loading-grid" aria-live="polite" aria-label="Cargando reparaciones">
            {Array.from({ length: 6 }, (_, index) => <div className="repair-card skeleton" key={index} />)}
          </div>
        )}

        {!loading && error && (
          <StatePanel
            title="No pudimos cargar las reparaciones"
            tone="error"
            action={<button className="button button--secondary" onClick={() => setReloadKey((key) => key + 1)}>Reintentar</button>}
          >
            <p>{error}</p>
          </StatePanel>
        )}

        {!loading && !error && repairs.length === 0 && (
          <StatePanel
            title="Todavía no hay reparaciones"
            action={<Link className="button button--primary" to="/repairs/new">Crear la primera</Link>}
          >
            <p>Registrá el primer equipo para comenzar a seguir su diagnóstico.</p>
          </StatePanel>
        )}

        {!loading && !error && repairs.length > 0 && visibleRepairs.length === 0 && (
          <StatePanel title="No encontramos coincidencias">
            <p>Probá con otro cliente, marca, modelo, ID o descripción.</p>
            <button className="text-button" onClick={() => setQuery("")}>Limpiar búsqueda</button>
          </StatePanel>
        )}

        {!loading && !error && visibleRepairs.length > 0 && (
          <section className="repair-grid" aria-label={`${visibleRepairs.length} reparaciones`}>
            {visibleRepairs.map((repair) => (
              <Link className="repair-card" to={`/repairs/${encodeURIComponent(repair.id)}`} key={repair.id}>
                <div className="repair-card__topline">
                  <span className="repair-id">{shortRepairId(repair.id)}</span>
                  <StatusBadge status={repair.status} />
                </div>
                <div className="repair-card__device">
                  <span className="device-icon" aria-hidden="true">▰</span>
                  <div>
                    <h2>{repair.brand} {repair.model}</h2>
                    <p>{repair.customerName}</p>
                  </div>
                </div>
                <p className="repair-card__issue">{repair.reportedIssue}</p>
                <div className="repair-card__footer">
                  <span>Ver ficha</span><span aria-hidden="true">→</span>
                </div>
              </Link>
            ))}
          </section>
        )}
      </main>
    </AppShell>
  );
}
