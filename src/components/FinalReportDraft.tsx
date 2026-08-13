import { useEffect, useState } from "react";
import { createSafeFinalReportText, canSaveOrExportFinalReport } from "../ai/final-report";
import { useLocalComputeStatus } from "../ai/local-compute-coordinator";
import { localAIService, useLocalAIStatus } from "../ai/local-ai";
import type { Repair, RepairEvent } from "../domain/schemas";
import { LocalAIDebugPanel } from "./LocalAIDebugPanel";
import { LocalAIUnavailableNotice } from "./LocalAIUnavailableNotice";

type FinalReportDraftProps = {
  repair: Repair;
  events: RepairEvent[];
};

const storagePrefix = "fixflow.final-report-draft.";

function storageKey(repairId: string): string {
  return `${storagePrefix}${repairId}`;
}

export function FinalReportDraft({ repair, events }: FinalReportDraftProps) {
  const aiStatus = useLocalAIStatus();
  const computeStatus = useLocalComputeStatus();
  const [draft, setDraft] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDraft(localStorage.getItem(storageKey(repair.id)) ?? "");
    } catch {
      setDraft("");
    }
    setReviewed(false);
    setMessage(null);
    setError(null);
  }, [repair.id]);

  async function generateDraft() {
    if (busy) return;
    setBusy(true);
    setReviewed(false);
    setMessage(null);
    setError(null);
    try {
      const safeFallback = createSafeFinalReportText(repair, events);
      const generated = await localAIService.generateFinalReport(repair, events);
      setDraft(generated);
      setMessage(
        generated === safeFallback
          ? "Se preparó un borrador seguro sólo con los registros confirmados. Revisalo y completalo manualmente."
          : "Borrador generado localmente. Revisalo y corregilo antes de guardarlo o exportarlo.",
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos preparar el informe.");
    } finally {
      setBusy(false);
    }
  }

  function saveDraft() {
    if (!canSaveOrExportFinalReport(draft, reviewed)) return;
    try {
      localStorage.setItem(storageKey(repair.id), draft);
      setMessage("Borrador revisado guardado en este navegador.");
      setError(null);
    } catch {
      setError("El navegador no permitió guardar el borrador localmente.");
    }
  }

  function exportDraft() {
    if (!canSaveOrExportFinalReport(draft, reviewed)) return;
    const blob = new Blob([draft], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `informe-${repair.id.replace(/[^a-z0-9_-]+/gi, "-")}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Informe revisado exportado como archivo de texto.");
    setError(null);
  }

  const canFinalize = canSaveOrExportFinalReport(draft, reviewed);
  const generationUnavailable =
    busy ||
    computeStatus.activeTask === "speech-transcription" ||
    aiStatus.phase === "checking" ||
    aiStatus.phase === "loading" ||
    aiStatus.phase === "generating";

  return (
    <section className="panel final-report-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Entrega al cliente</p>
          <h2>Informe final</h2>
        </div>
        <span>Borrador editable</span>
      </div>
      <p className="final-report-panel__intro">
        La IA resume los registros, pero no confirma diagnósticos. Las sugerencias de IA se excluyen de la evidencia del informe.
      </p>
      <button
        className="button button--ai"
        type="button"
        onClick={generateDraft}
        disabled={generationUnavailable}
      >
        <span aria-hidden="true">✦</span>
        {computeStatus.activeTask === "speech-transcription"
          ? "Esperando transcripción…"
          : busy || aiStatus.phase === "generating"
          ? "Preparando informe…"
          : aiStatus.failure?.blocksAI || aiStatus.phase === "unsupported"
            ? "Preparar borrador seguro"
            : draft
              ? "Volver a generar borrador"
              : "Generar borrador del informe"}
      </button>
      {aiStatus.phase === "loading" && (
        <p className="inline-feedback" role="status">
          Cargando {aiStatus.modelLabel}: {Math.round(aiStatus.progress * 100)}%
        </p>
      )}
      {draft && (
        <>
          <label className="field">
            <span>Contenido del informe</span>
            <textarea
              rows={22}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setReviewed(false);
                setMessage(null);
              }}
            />
          </label>
          <label className="final-report-review">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(event) => setReviewed(event.target.checked)}
            />
            <span>Revisé el informe completo y confirmé que refleja el trabajo técnico registrado.</span>
          </label>
          <div className="final-report-actions">
            <button className="button button--secondary" type="button" onClick={saveDraft} disabled={!canFinalize}>
              Guardar borrador revisado
            </button>
            <button className="button button--primary" type="button" onClick={exportDraft} disabled={!canFinalize}>
              Exportar .txt
            </button>
          </div>
          {!reviewed && (
            <small className="inline-feedback">La revisión manual es obligatoria para guardar o exportar.</small>
          )}
        </>
      )}
      {aiStatus.failure && <LocalAIUnavailableNotice failure={aiStatus.failure} />}
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      {error && aiStatus.debugOutput?.task === "final-report" && (
        <LocalAIDebugPanel output={aiStatus.debugOutput} />
      )}
      {message && <div className="notice notice--info" role="status">{message}</div>}
    </section>
  );
}
