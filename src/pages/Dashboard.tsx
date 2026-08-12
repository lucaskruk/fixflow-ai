import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import { repairsApi } from "../api/repairs";
import { AppShell } from "../components/AppShell";
import { StatePanel } from "../components/StatePanel";
import { StatusBadge } from "../components/StatusBadge";
import type { Repair } from "../domain/schemas";
import {
  countRepairsByTab,
  filterRepairs,
  loadRepairViewMode,
  persistRepairViewMode,
  type RepairTab,
  type RepairViewMode,
} from "../ui/repair-dashboard";
import { formatDateTime, shortRepairId } from "../ui/repair-display";

function repairPath(repair: Repair): string {
  return `/repairs/${encodeURIComponent(repair.id)}`;
}

function RepairCards({ repairs }: { repairs: readonly Repair[] }) {
  return (
    <section className="repair-grid" aria-label={`${repairs.length} reparaciones`}>
      {repairs.map((repair) => (
        <Link className="repair-card" to={repairPath(repair)} key={repair.id}>
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
  );
}

function RepairTable({ repairs }: { repairs: readonly Repair[] }) {
  return (
    <div className="repair-table-wrap">
      <table className="repair-table">
        <caption className="sr-only">{repairs.length} reparaciones en vista de lista</caption>
        <thead>
          <tr>
            <th scope="col">Reparación</th>
            <th scope="col">Cliente</th>
            <th scope="col">Problema informado</th>
            <th scope="col">Estado</th>
            <th scope="col">Actualizada</th>
            <th scope="col"><span className="sr-only">Acciones</span></th>
          </tr>
        </thead>
        <tbody>
          {repairs.map((repair) => (
            <tr key={repair.id}>
              <td data-label="Reparación">
                <Link className="repair-table__device" to={repairPath(repair)}>
                  <span className="device-icon" aria-hidden="true">▰</span>
                  <span>
                    <strong>{repair.brand} {repair.model}</strong>
                    <small className="repair-id">{shortRepairId(repair.id)}</small>
                  </span>
                </Link>
              </td>
              <td data-label="Cliente">{repair.customerName}</td>
              <td className="repair-table__issue" data-label="Problema">{repair.reportedIssue}</td>
              <td data-label="Estado"><StatusBadge status={repair.status} /></td>
              <td data-label="Actualizada"><time dateTime={repair.updatedAt}>{formatDateTime(repair.updatedAt)}</time></td>
              <td className="repair-table__action">
                <Link aria-label={`Ver ficha de ${repair.brand} ${repair.model}, ${repair.customerName}`} to={repairPath(repair)}>
                  Ver ficha <span aria-hidden="true">→</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Dashboard() {
  const [repairs, setRepairs] = useState<Repair[]>([]);
  const [query, setQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState<RepairTab>("active");
  const [viewMode, setViewMode] = useState<RepairViewMode>(loadRepairViewMode);
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

  const counts = useMemo(() => countRepairsByTab(repairs), [repairs]);
  const visibleRepairs = useMemo(
    () => filterRepairs(repairs, selectedTab, query),
    [query, repairs, selectedTab],
  );
  const selectedTabCount = counts[selectedTab];

  function selectView(mode: RepairViewMode) {
    setViewMode(mode);
    persistRepairViewMode(mode);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let nextTab: RepairTab | null = null;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextTab = selectedTab === "active" ? "delivered" : "active";
    } else if (event.key === "Home") {
      nextTab = "active";
    } else if (event.key === "End") {
      nextTab = "delivered";
    }

    if (!nextTab) return;
    event.preventDefault();
    setSelectedTab(nextTab);
    event.currentTarget.ownerDocument.getElementById(`${nextTab}-repairs-tab`)?.focus();
  }

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
          <section className="dashboard-controls" aria-label="Filtros y visualización">
            <div className="repair-tabs" role="tablist" aria-label="Estado de las reparaciones">
              <button
                id="active-repairs-tab"
                type="button"
                role="tab"
                aria-selected={selectedTab === "active"}
                aria-controls="repair-results"
                tabIndex={selectedTab === "active" ? 0 : -1}
                onClick={() => setSelectedTab("active")}
                onKeyDown={handleTabKeyDown}
              >
                Activas <span aria-label={`${counts.active} reparaciones activas`}>{counts.active}</span>
              </button>
              <button
                id="delivered-repairs-tab"
                type="button"
                role="tab"
                aria-selected={selectedTab === "delivered"}
                aria-controls="repair-results"
                tabIndex={selectedTab === "delivered" ? 0 : -1}
                onClick={() => setSelectedTab("delivered")}
                onKeyDown={handleTabKeyDown}
              >
                Entregadas <span aria-label={`${counts.delivered} reparaciones entregadas`}>{counts.delivered}</span>
              </button>
            </div>

            <div className="dashboard-toolbar">
              <label className="search-field">
                <span className="sr-only">Buscar en reparaciones {selectedTab === "active" ? "activas" : "entregadas"}</span>
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar cliente, equipo, serie o problema…"
                />
              </label>
              <div className="view-switcher" role="group" aria-label="Modo de visualización">
                <button
                  type="button"
                  aria-pressed={viewMode === "cards"}
                  onClick={() => selectView("cards")}
                >
                  <span aria-hidden="true">▦</span> Tarjetas
                </button>
                <button
                  type="button"
                  aria-pressed={viewMode === "list"}
                  onClick={() => selectView("list")}
                >
                  <span aria-hidden="true">☷</span> Lista
                </button>
              </div>
            </div>
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

        {!loading && !error && repairs.length > 0 && (
          <div
            id="repair-results"
            role="tabpanel"
            aria-labelledby={`${selectedTab}-repairs-tab`}
          >
            <p className="results-summary" aria-live="polite">
              {visibleRepairs.length} de {selectedTabCount} reparaciones {selectedTab === "active" ? "activas" : "entregadas"}
            </p>

            {selectedTabCount === 0 && (
              <StatePanel title={selectedTab === "active" ? "No hay reparaciones activas" : "No hay reparaciones entregadas"}>
                <p>{selectedTab === "active"
                  ? "Las reparaciones nuevas y en curso aparecerán en esta pestaña."
                  : "Cuando marques una reparación como entregada, aparecerá acá."}</p>
              </StatePanel>
            )}

            {selectedTabCount > 0 && visibleRepairs.length === 0 && (
              <StatePanel title="No encontramos coincidencias">
                <p>Probá con otro cliente, marca, modelo, serie, ID o descripción.</p>
                <button className="text-button" onClick={() => setQuery("")}>Limpiar búsqueda</button>
              </StatePanel>
            )}

            {visibleRepairs.length > 0 && viewMode === "cards" && <RepairCards repairs={visibleRepairs} />}
            {visibleRepairs.length > 0 && viewMode === "list" && <RepairTable repairs={visibleRepairs} />}
          </div>
        )}
      </main>
    </AppShell>
  );
}
