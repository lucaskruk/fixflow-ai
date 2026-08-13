import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLocalComputeStatus } from "../ai/local-compute-coordinator";
import { localAIService, useLocalAIStatus } from "../ai/local-ai";
import { repairsApi } from "../api/repairs";
import { AppShell } from "../components/AppShell";
import { LocalAIDebugPanel } from "../components/LocalAIDebugPanel";
import { LocalAIUnavailableNotice } from "../components/LocalAIUnavailableNotice";
import { SpeechInputControl } from "../components/SpeechInputControl";
import { repairStatuses, type RepairStatus } from "../domain/schemas";
import { statusLabels } from "../ui/repair-display";

type FormState = {
  customerName: string;
  customerPhone: string;
  brand: string;
  model: string;
  serialNumber: string;
  reportedIssue: string;
  accessories: string;
  status: RepairStatus;
};

const initialForm: FormState = {
  customerName: "",
  customerPhone: "",
  brand: "",
  model: "",
  serialNumber: "",
  reportedIssue: "",
  accessories: "",
  status: "RECEIVED",
};

export function NewRepair() {
  const navigate = useNavigate();
  const aiStatus = useLocalAIStatus();
  const computeStatus = useLocalComputeStatus();
  const [intakeText, setIntakeText] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [form, setForm] = useState<FormState>(initialForm);
  const [confirmationMode, setConfirmationMode] = useState<"manual" | "ai">("manual");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const aiBlocked =
    aiStatus.phase === "unsupported" ||
    Boolean(aiStatus.failure?.blocksAI);
  const speechBusy = computeStatus.activeTask === "speech-transcription";
  const localAIBusy = computeStatus.activeTask === "local-ai";

  useEffect(() => {
    void localAIService.probeCompatibility();
  }, []);

  function continueManually() {
    setManualMode(true);
    setConfirmationMode("manual");
    setError(null);
    setForm((current) => ({
      ...current,
      reportedIssue: current.reportedIssue || intakeText.trim(),
    }));
    window.setTimeout(() => document.querySelector<HTMLInputElement>("#customerName")?.focus(), 0);
  }

  async function processWithAI() {
    setError(null);
    try {
      const draft = await localAIService.extractRepair(intakeText);
      setForm({
        customerName: draft.customerName ?? "",
        customerPhone: "",
        brand: draft.brand ?? "",
        model: draft.model ?? "",
        serialNumber: draft.serialNumber ?? "",
        reportedIssue: draft.reportedIssue ?? "",
        accessories: draft.accessories.join(", "),
        status: draft.status ?? "RECEIVED",
      });
      setConfirmationMode("ai");
      setManualMode(true);
      window.setTimeout(
        () => document.querySelector<HTMLInputElement>("#customerName")?.focus(),
        0,
      );
    } catch (reason) {
      setError(
        localAIService.getSnapshot().failure
          ? null
          : reason instanceof Error
            ? reason.message
            : "No pudimos procesar el ingreso localmente.",
      );
    }
  }

  function setField<Key extends keyof FormState>(key: Key, value: FormState[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const repair = await repairsApi.create({
        customerName: form.customerName,
        customerPhone: form.customerPhone.trim() || null,
        brand: form.brand,
        model: form.model,
        serialNumber: form.serialNumber.trim() || null,
        reportedIssue: form.reportedIssue,
        accessories: form.accessories.split(",").map((item) => item.trim()).filter(Boolean),
        status: form.status,
      });
      navigate(`/repairs/${encodeURIComponent(repair.id)}`, {
        state: { notice: "Reparación creada correctamente." },
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos guardar la reparación.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <main className="workspace workspace--narrow">
        <Link className="back-link" to="/">← Volver a reparaciones</Link>
        <header className="page-heading page-heading--compact">
          <div>
            <p className="eyebrow">Ingreso de equipo</p>
            <h1>Nueva reparación</h1>
            <p>Describí el caso como lo contarías en la mesa de trabajo.</p>
          </div>
        </header>

        {!manualMode ? (
          <section className="form-card intake-card">
            <label className="field-label" htmlFor="intakeText">Descripción de ingreso</label>
            <p className="field-help" id="intake-help">Incluí cliente, equipo, problema y accesorios conocidos.</p>
            <textarea
              id="intakeText"
              className="intake-textarea"
              value={intakeText}
              onChange={(event) => setIntakeText(event.target.value)}
              aria-describedby="intake-help"
              placeholder={'Ejemplo: "Entró una Lenovo IdeaPad 3 de Martín. No enciende. Trajo cargador. El cliente dice que ayer funcionaba normalmente."'}
              autoFocus
            />
            <SpeechInputControl
              value={intakeText}
              onChange={setIntakeText}
              disabled={localAIBusy}
              describedBy="intake-help"
            />
            <section className={`ai-runtime ai-runtime--${aiStatus.phase}`} aria-live="polite">
              <div className="ai-runtime__heading">
                <div>
                  <strong>{aiStatus.modelLabel}</strong>
                  <span>≈{aiStatus.downloadMB} MB · ≈{aiStatus.vramMB} MB de VRAM</span>
                </div>
                <span className="ai-runtime__state">
                  {aiStatus.phase === "unsupported" ? "No compatible" :
                    aiStatus.phase === "loading" ? "Cargando" :
                    aiStatus.phase === "generating" ? "Procesando" :
                    aiStatus.phase === "ready" ? "Listo" :
                    aiStatus.phase === "error" ? (aiBlocked ? "No disponible" : "Con error") : "Local"}
                </span>
              </div>
              {aiStatus.phase === "loading" && (
                <div className="ai-progress">
                  <div className="ai-progress__track" role="progressbar" aria-label="Descarga del modelo local" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(aiStatus.progress * 100)}>
                    <span style={{ width: `${Math.round(aiStatus.progress * 100)}%` }} />
                  </div>
                  <div><span>{aiStatus.cached ? "Cargando desde caché" : "Descargando y guardando en este navegador"}</span><strong>{Math.round(aiStatus.progress * 100)}%</strong></div>
                  {aiStatus.progressText && <small>{aiStatus.progressText}</small>}
                </div>
              )}
              {aiStatus.phase === "generating" && <p>Extrayendo únicamente la información explícita…</p>}
              {aiStatus.compatibility?.supported && aiStatus.compatibility.adapterLabel && (
                <small>GPU: {aiStatus.compatibility.adapterLabel}</small>
              )}
              {aiStatus.failure && <LocalAIUnavailableNotice failure={aiStatus.failure} />}
              {(aiStatus.phase === "idle" || aiStatus.phase === "ready") && (
                <p>{aiStatus.phase === "ready" ? "Modelo cargado y almacenado en la caché del navegador." : "La primera ejecución descargará el modelo; las siguientes usarán la caché."}</p>
              )}
            </section>
            {error && <div className="notice notice--error" role="alert">{error}</div>}
            {error && aiStatus.debugOutput?.task === "repair-extraction" && (
              <LocalAIDebugPanel output={aiStatus.debugOutput} />
            )}
            <div className="form-actions form-actions--split">
              <button className="button button--ai" type="button" onClick={processWithAI} disabled={!intakeText.trim() || speechBusy || aiBlocked || aiStatus.phase === "checking" || aiStatus.phase === "loading" || aiStatus.phase === "generating"}>
                <span aria-hidden="true">✦</span> {speechBusy ? "Esperando transcripción…" : aiStatus.phase === "loading" ? "Cargando modelo…" : aiStatus.phase === "generating" ? "Procesando…" : aiBlocked ? "IA no disponible" : "Procesar con IA"}
              </button>
              <button className="button button--secondary" type="button" onClick={continueManually}>
                Continuar manualmente <span aria-hidden="true">→</span>
              </button>
            </div>
            <p className="privacy-note">El texto no sale de esta aplicación.</p>
          </section>
        ) : (
          <form className="form-card" onSubmit={submit}>
            <div className="form-card__heading">
              <div>
                <p className="eyebrow">{confirmationMode === "ai" ? "Extracción local completada" : "Confirmación manual"}</p>
                <h2>Revisá la información antes de guardar</h2>
              </div>
              <button className="text-button" type="button" onClick={() => setManualMode(false)}>Editar texto original</button>
            </div>

            {confirmationMode === "ai" && (
              <div className="notice notice--info" role="status">
                <strong>La IA sólo propuso un borrador.</strong>
                <span>Los campos ausentes permanecen vacíos. Confirmá o corregí todo antes de guardar.</span>
              </div>
            )}

            <div className="form-grid">
              <label className="field">
                <span>Cliente <b aria-hidden="true">*</b></span>
                <input id="customerName" required value={form.customerName} onChange={(e) => setField("customerName", e.target.value)} autoComplete="name" />
              </label>
              <label className="field">
                <span>Teléfono</span>
                <input value={form.customerPhone} onChange={(e) => setField("customerPhone", e.target.value)} autoComplete="tel" inputMode="tel" />
              </label>
              <label className="field">
                <span>Marca <b aria-hidden="true">*</b></span>
                <input required value={form.brand} onChange={(e) => setField("brand", e.target.value)} />
              </label>
              <label className="field">
                <span>Modelo <b aria-hidden="true">*</b></span>
                <input required value={form.model} onChange={(e) => setField("model", e.target.value)} />
              </label>
              <label className="field">
                <span>Número de serie</span>
                <input value={form.serialNumber} onChange={(e) => setField("serialNumber", e.target.value)} />
              </label>
              <label className="field">
                <span>Estado <b aria-hidden="true">*</b></span>
                <select value={form.status} onChange={(e) => setField("status", e.target.value as RepairStatus)}>
                  {repairStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
              </label>
              <label className="field field--full">
                <span>Problema reportado <b aria-hidden="true">*</b></span>
                <textarea required rows={4} value={form.reportedIssue} onChange={(e) => setField("reportedIssue", e.target.value)} />
                <small>Corresponde a lo informado por el cliente, no a un diagnóstico.</small>
              </label>
              <label className="field field--full">
                <span>Accesorios</span>
                <input value={form.accessories} onChange={(e) => setField("accessories", e.target.value)} placeholder="cargador, bolso (separados por coma)" />
              </label>
            </div>

            {error && <div className="notice notice--error" role="alert">{error}</div>}
            <div className="form-actions form-actions--end">
              <Link className="button button--ghost" to="/">Cancelar</Link>
              <button className="button button--primary" type="submit" disabled={submitting}>
                {submitting ? "Guardando…" : "Guardar reparación"}
              </button>
            </div>
          </form>
        )}
      </main>
    </AppShell>
  );
}
