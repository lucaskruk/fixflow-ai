import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { parseDiagnosticAnalysisEvent, serializeDiagnosticAnalysis } from "../ai/diagnostic-analysis";
import { retrieveKnowledgeDocuments } from "../ai/knowledge-base";
import { useLocalComputeStatus } from "../ai/local-compute-coordinator";
import { localAIService, useLocalAIStatus } from "../ai/local-ai";
import { knowledgeApi } from "../api/knowledge";
import { ApiError, repairsApi } from "../api/repairs";
import { AppShell } from "../components/AppShell";
import { FinalReportDraft } from "../components/FinalReportDraft";
import {
  KnowledgeCitationList,
  KnowledgeRetrievalPreview,
} from "../components/KnowledgeRetrievalPreview";
import { LocalAIDebugPanel } from "../components/LocalAIDebugPanel";
import { LocalAIUnavailableNotice } from "../components/LocalAIUnavailableNotice";
import { SpeechInputControl } from "../components/SpeechInputControl";
import { StatePanel } from "../components/StatePanel";
import { StatusBadge } from "../components/StatusBadge";
import {
  repairStatuses,
  type KnowledgeDocument,
  type Repair,
  type RepairEvent,
  type RepairStatus,
  type TechnicianRepairEventType,
} from "../domain/schemas";
import {
  eventLabels,
  formatDateTime,
  statusLabels,
  technicianEventGuidance,
  technicianEventTypes,
} from "../ui/repair-display";

type LocationState = { notice?: string } | null;

function AISuggestion({
  event,
  knowledgeDocuments,
}: {
  event: RepairEvent;
  knowledgeDocuments: readonly KnowledgeDocument[];
}) {
  const analysis = parseDiagnosticAnalysisEvent(event.content);
  if (!analysis) return <p>{event.content}</p>;

  return (
    <div className="diagnostic-analysis">
      <p className="diagnostic-analysis__assessment">{analysis.assessment}</p>
      {analysis.hypotheses.length > 0 && (
        <section>
          <h3>Hipótesis para comprobar</h3>
          <ul className="diagnostic-analysis__hypotheses">
            {analysis.hypotheses.map((hypothesis, index) => (
              <li key={`${hypothesis.description}-${index}`}>
                <span className={`confidence confidence--${hypothesis.confidence}`}>
                  {hypothesis.confidence === "high" ? "Alta" : hypothesis.confidence === "medium" ? "Media" : "Baja"}
                </span>
                {hypothesis.description}
              </li>
            ))}
          </ul>
        </section>
      )}
      {analysis.nextSteps.length > 0 && (
        <section>
          <h3>Próximos pasos</h3>
          <ol className="diagnostic-analysis__steps">
            {analysis.nextSteps.map((step, index) => (
              <li key={`${step.action}-${index}`}>
                <strong>{step.action}</strong>
                <span>{step.reason}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {analysis.missingInformation.length > 0 && (
        <section>
          <h3>Información pendiente</h3>
          <ul>
            {analysis.missingInformation.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </section>
      )}
      <KnowledgeCitationList
        sourceIds={analysis.sources}
        documents={knowledgeDocuments}
      />
    </div>
  );
}

export function RepairDetail() {
  const { id = "" } = useParams();
  const location = useLocation();
  const aiStatus = useLocalAIStatus();
  const computeStatus = useLocalComputeStatus();
  const initialNotice = (location.state as LocationState)?.notice;
  const [repair, setRepair] = useState<Repair | null>(null);
  const [events, setEvents] = useState<RepairEvent[]>([]);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [statusDraft, setStatusDraft] = useState<RepairStatus>("RECEIVED");
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(initialNotice ?? null);
  const [eventType, setEventType] = useState<TechnicianRepairEventType>("MEASUREMENT");
  const [eventContent, setEventContent] = useState("");
  const [eventSubmitting, setEventSubmitting] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventMessage, setEventMessage] = useState<string | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const [retrievalRefreshing, setRetrievalRefreshing] = useState(false);
  const [retrievalError, setRetrievalError] = useState<string | null>(null);
  const [retrievalMessage, setRetrievalMessage] = useState<string | null>(null);
  const retrievedKnowledgeDocuments = useMemo(
    () => repair
      ? retrieveKnowledgeDocuments(knowledgeDocuments, repair, events)
      : [],
    [events, knowledgeDocuments, repair],
  );
  const aiBlocked =
    aiStatus.phase === "unsupported" ||
    Boolean(aiStatus.failure?.blocksAI);
  const speechBusy = computeStatus.activeTask === "speech-transcription";
  const localAIBusy = computeStatus.activeTask === "local-ai";

  useEffect(() => {
    void localAIService.probeCompatibility();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setNotFound(false);
    Promise.all([
      repairsApi.get(id, controller.signal),
      repairsApi.listEvents(id, controller.signal),
      knowledgeApi.list({}, controller.signal),
    ]).then(([loadedRepair, loadedEvents, loadedKnowledgeDocuments]) => {
      setRepair(loadedRepair);
      setStatusDraft(loadedRepair.status);
      setEvents(loadedEvents);
      setKnowledgeDocuments(loadedKnowledgeDocuments);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      if (reason instanceof ApiError && reason.status === 404) setNotFound(true);
      else setLoadError(reason instanceof Error ? reason.message : "No pudimos cargar esta reparación.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [id, reloadKey]);

  async function saveStatus() {
    if (!repair || repair.status === statusDraft) return;
    setStatusSaving(true);
    setStatusMessage(null);
    try {
      const updated = await repairsApi.update(repair.id, { status: statusDraft });
      setRepair(updated);
      setStatusMessage(`Estado actualizado a “${statusLabels[updated.status]}”.`);
    } catch (reason) {
      setStatusDraft(repair.status);
      setStatusMessage(reason instanceof Error ? reason.message : "No pudimos actualizar el estado.");
    } finally {
      setStatusSaving(false);
    }
  }

  async function addEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!repair) return;
    setEventSubmitting(true);
    setEventError(null);
    setEventMessage(null);
    try {
      const created = await repairsApi.addEvent(repair.id, {
        type: eventType,
        content: eventContent,
      });
      setEvents((current) => [...current, created]);
      setEventContent("");
      setEventMessage(`Registro agregado al historial: ${eventLabels[created.type]}.`);
    } catch (reason) {
      setEventError(reason instanceof Error ? reason.message : "No pudimos guardar el evento.");
    } finally {
      setEventSubmitting(false);
    }
  }

  async function analyzeDiagnosis() {
    if (!repair || analysisBusy) return;
    setAnalysisBusy(true);
    setAnalysisError(null);
    setAnalysisMessage(null);

    try {
      const analysis = await localAIService.analyzeDiagnosis(
        repair,
        events,
        retrievedKnowledgeDocuments,
      );
      const created = await repairsApi.addAISuggestion(repair.id, {
        content: serializeDiagnosticAnalysis(analysis),
      });
      setEvents((current) => [...current, created]);
      setAnalysisMessage(
        `Sugerencia guardada con ${analysis.sources.length} fuente${analysis.sources.length === 1 ? "" : "s"}. No modificó el diagnóstico confirmado.`,
      );
    } catch (reason) {
      setAnalysisError(
        localAIService.getSnapshot().failure
          ? null
          : reason instanceof Error
            ? reason.message
            : "No pudimos generar el análisis local.",
      );
    } finally {
      setAnalysisBusy(false);
    }
  }

  async function refreshKnowledgeRetrieval() {
    if (retrievalRefreshing) return;
    setRetrievalRefreshing(true);
    setRetrievalError(null);
    setRetrievalMessage(null);
    try {
      const loadedKnowledgeDocuments = await knowledgeApi.list({});
      setKnowledgeDocuments(loadedKnowledgeDocuments);
      setRetrievalMessage("Selección actualizada con la base local vigente.");
    } catch (reason) {
      setRetrievalError(
        reason instanceof Error
          ? reason.message
          : "No pudimos actualizar la selección de documentos.",
      );
    } finally {
      setRetrievalRefreshing(false);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <main className="workspace" aria-live="polite">
          <div className="detail-loading skeleton" aria-label="Cargando ficha de reparación" />
        </main>
      </AppShell>
    );
  }

  if (notFound) {
    return (
      <AppShell>
        <main className="workspace workspace--narrow">
          <StatePanel title="Reparación no encontrada" action={<Link className="button button--primary" to="/">Volver al dashboard</Link>}>
            <p>El ID solicitado no existe o la reparación fue eliminada.</p>
          </StatePanel>
        </main>
      </AppShell>
    );
  }

  if (loadError || !repair) {
    return (
      <AppShell>
        <main className="workspace workspace--narrow">
          <StatePanel title="No pudimos abrir la ficha" tone="error" action={<button className="button button--secondary" onClick={() => setReloadKey((key) => key + 1)}>Reintentar</button>}>
            <p>{loadError}</p>
          </StatePanel>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="workspace detail-page">
        <Link className="back-link" to="/">← Volver a reparaciones</Link>
        <header className="detail-header">
          <div>
            <div className="detail-header__meta">
              <span className="repair-id">{repair.id}</span>
              <StatusBadge status={repair.status} />
            </div>
            <h1>{repair.brand} {repair.model}</h1>
            <p>{repair.customerName}</p>
          </div>
          <div className="status-control">
            <label htmlFor="repair-status">Estado del equipo</label>
            <div>
              <select id="repair-status" value={statusDraft} onChange={(e) => setStatusDraft(e.target.value as RepairStatus)} disabled={statusSaving}>
                {repairStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
              <button className="button button--secondary button--compact" onClick={saveStatus} disabled={statusSaving || statusDraft === repair.status}>
                {statusSaving ? "Guardando…" : "Actualizar"}
              </button>
            </div>
            <span className="inline-feedback" aria-live="polite">{statusMessage}</span>
          </div>
        </header>

        <div className="detail-layout">
          <div className="detail-main">
            <section className="panel issue-panel">
              <p className="section-kicker">Informado por el cliente</p>
              <h2>Problema reportado</h2>
              <blockquote>{repair.reportedIssue}</blockquote>
            </section>

            {(repair.diagnosis || repair.solution) && (
              <section className="panel confirmed-panel">
                <p className="section-kicker">Registro técnico confirmado</p>
                {repair.diagnosis && <div><h2>Diagnóstico</h2><p>{repair.diagnosis}</p></div>}
                {repair.solution && <div><h2>Solución</h2><p>{repair.solution}</p></div>}
              </section>
            )}

            <FinalReportDraft repair={repair} events={events} />

            <section className="panel timeline-panel">
              <div className="section-heading">
                <div>
                  <p className="section-kicker">Historial del caso</p>
                  <h2>Línea de tiempo</h2>
                </div>
                <span>{events.length} eventos</span>
              </div>
              {events.length === 0 ? (
                <p className="empty-copy">Todavía no hay registros técnicos en el historial.</p>
              ) : (
                <ol className="timeline">
                  {events.map((event) => (
                    <li className={`timeline-event timeline-event--${event.type.toLowerCase()}`} key={event.id}>
                      <span className="timeline-event__marker" aria-hidden="true" />
                      <div className="timeline-event__card">
                        <div className="timeline-event__heading">
                          <strong>{eventLabels[event.type]}</strong>
                          <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
                        </div>
                        {event.type === "AI_SUGGESTION" && (
                          <p className="hypothesis-warning">Hipótesis generada por IA · No es un diagnóstico confirmado</p>
                        )}
                        {event.type === "AI_SUGGESTION" ? (
                          <AISuggestion
                            event={event}
                            knowledgeDocuments={knowledgeDocuments}
                          />
                        ) : <p>{event.content}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>

          <aside className="detail-sidebar">
            <section className="panel device-panel">
              <p className="section-kicker">Ficha de ingreso</p>
              <h2>Datos del equipo</h2>
              <dl className="data-list">
                <div><dt>Cliente</dt><dd>{repair.customerName}</dd></div>
                {repair.customerPhone && <div><dt>Teléfono</dt><dd>{repair.customerPhone}</dd></div>}
                <div><dt>Dispositivo</dt><dd>{repair.brand} {repair.model}</dd></div>
                <div><dt>Serie</dt><dd>{repair.serialNumber ?? "No informado"}</dd></div>
                <div><dt>Accesorios</dt><dd>{repair.accessories.length ? repair.accessories.join(", ") : "Sin accesorios"}</dd></div>
                <div><dt>Ingresó</dt><dd>{formatDateTime(repair.createdAt)}</dd></div>
              </dl>
            </section>

            <form className="panel event-form" onSubmit={addEvent}>
              <p className="section-kicker">Trabajo técnico</p>
              <h2>Agregar al historial</h2>
              <label className="field">
                <span>Tipo de registro</span>
                <select
                  value={eventType}
                  onChange={(event) => {
                    setEventType(event.target.value as TechnicianRepairEventType);
                    setEventError(null);
                    setEventMessage(null);
                  }}
                  aria-describedby="event-type-guidance"
                >
                  {technicianEventTypes.map((type) => (
                    <option key={type} value={type}>{eventLabels[type]}</option>
                  ))}
                </select>
                <small id="event-type-guidance">{technicianEventGuidance[eventType].description}</small>
              </label>
              <label className="field">
                <span>Detalle</span>
                <textarea
                  required
                  rows={6}
                  value={eventContent}
                  onChange={(e) => setEventContent(e.target.value)}
                  placeholder={technicianEventGuidance[eventType].placeholder}
                />
              </label>
              <SpeechInputControl
                value={eventContent}
                onChange={setEventContent}
                disabled={localAIBusy || eventSubmitting}
              />
              {(eventType === "DIAGNOSIS" || eventType === "REPAIR") && (
                <div className="notice notice--caution event-confirmation-note">
                  <strong>Registro técnico confirmado</strong>
                  <span>
                    Esta entrada se guardará en el historial. No modifica automáticamente
                    el diagnóstico ni la solución resumidos en la ficha.
                  </span>
                </div>
              )}
              {eventError && <div className="notice notice--error" role="alert">{eventError}</div>}
              {eventMessage && <div className="notice notice--info" role="status">{eventMessage}</div>}
              <button className="button button--primary button--full" type="submit" disabled={speechBusy || eventSubmitting || !eventContent.trim()}>
                {eventSubmitting ? "Guardando…" : "Agregar al historial"}
              </button>
              <div className="ai-action-placeholder">
                <button
                  className="button button--ai button--full"
                  type="button"
                  onClick={analyzeDiagnosis}
                  disabled={
                    analysisBusy ||
                    speechBusy ||
                    aiBlocked ||
                    aiStatus.phase === "checking" ||
                    aiStatus.phase === "loading" ||
                    aiStatus.phase === "generating"
                  }
                >
                  <span aria-hidden="true">✦</span>
                  {speechBusy
                    ? "Esperando transcripción…"
                    : aiStatus.phase === "loading"
                    ? "Cargando modelo…"
                    : analysisBusy || aiStatus.phase === "generating"
                      ? "Analizando…"
                      : aiBlocked
                        ? "IA no disponible"
                        : "Analizar diagnóstico"}
                </button>
                <KnowledgeRetrievalPreview
                  documents={retrievedKnowledgeDocuments}
                  onRefresh={() => void refreshKnowledgeRetrieval()}
                  refreshing={retrievalRefreshing}
                  error={retrievalError}
                  message={retrievalMessage}
                />
                {aiStatus.provider === "local" && aiStatus.phase === "loading" && (
                  <div className="ai-progress ai-progress--compact">
                    <div className="ai-progress__track" role="progressbar" aria-label="Carga del modelo local" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(aiStatus.progress * 100)}>
                      <span style={{ width: `${Math.round(aiStatus.progress * 100)}%` }} />
                    </div>
                    <div><span>{aiStatus.cached ? "Cargando desde caché" : "Descargando modelo local"}</span><strong>{Math.round(aiStatus.progress * 100)}%</strong></div>
                  </div>
                )}
                {aiStatus.failure && <LocalAIUnavailableNotice failure={aiStatus.failure} />}
                {analysisError && <div className="notice notice--error" role="alert">{analysisError}</div>}
                {analysisError && aiStatus.debugOutput?.task === "diagnostic-analysis" && (
                  <LocalAIDebugPanel output={aiStatus.debugOutput} />
                )}
                {analysisMessage && <div className="notice notice--info" role="status">{analysisMessage}</div>}
                <small>Usa hasta 3 documentos de la base técnica. La sugerencia se guarda separada del diagnóstico confirmado.</small>
              </div>
            </form>
          </aside>
        </div>
      </main>
    </AppShell>
  );
}
