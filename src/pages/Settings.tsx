import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useLocalComputeStatus } from "../ai/local-compute-coordinator";
import { localAIService, useLocalAIStatus } from "../ai/local-ai";
import {
  getLocalAIModel,
  isLocalAIModelId,
  localAIModels,
  type LocalAIModelId,
} from "../ai/model-config";
import {
  gatewayAIModels,
  getGatewayAIModel,
  isGatewayAIModelId,
} from "../ai/gateway-model-config";
import type { AIModelId } from "../ai/model-preferences";
import { AppShell } from "../components/AppShell";
import { LocalAIUnavailableNotice } from "../components/LocalAIUnavailableNotice";

type CacheState = Record<LocalAIModelId, boolean | null>;

function emptyCacheState(): CacheState {
  return Object.fromEntries(
    localAIModels.map((model) => [model.id, null]),
  ) as CacheState;
}

export function Settings() {
  const aiStatus = useLocalAIStatus();
  const computeStatus = useLocalComputeStatus();
  const [cacheState, setCacheState] = useState<CacheState>(emptyCacheState);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelToDelete, setModelToDelete] = useState<LocalAIModelId | null>(null);
  const [deleting, setDeleting] = useState(false);
  const runtimeBusy = aiStatus.phase === "loading" || aiStatus.phase === "generating";
  const selectedLocalModel = isLocalAIModelId(aiStatus.modelId)
    ? getLocalAIModel(aiStatus.modelId)
    : null;
  const selectedGatewayModel = isGatewayAIModelId(aiStatus.modelId)
    ? getGatewayAIModel(aiStatus.modelId)
    : null;

  const refreshCacheState = useCallback(async () => {
    const results = await Promise.all(
      localAIModels.map(async (model) => [
        model.id,
        await localAIService.isModelCached(model.id),
      ] as const),
    );
    setCacheState(Object.fromEntries(results) as CacheState);
  }, []);

  useEffect(() => {
    void localAIService.probeCompatibility();
    void refreshCacheState().catch(() => {
      // Cache inspection is advisory and must not affect model selection.
    });
  }, [refreshCacheState]);

  async function chooseModel(modelId: AIModelId) {
    setError(null);
    setMessage(null);
    setModelToDelete(null);
    try {
      await localAIService.selectModel(modelId);
      if (isLocalAIModelId(modelId)) {
        await localAIService.probeCompatibility();
      }
      const model = isLocalAIModelId(modelId)
        ? getLocalAIModel(modelId)
        : getGatewayAIModel(modelId);
      setMessage(
        `${model.label} quedó seleccionado para ingresos, análisis e informes.`,
      );
      await refreshCacheState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos cambiar el modelo.");
    }
  }

  async function downloadSelectedModel() {
    if (!selectedLocalModel) return;
    setError(null);
    setMessage(null);
    try {
      await localAIService.loadSelectedModel();
      setMessage(`${selectedLocalModel.label} está listo en este navegador.`);
      await refreshCacheState();
    } catch (reason) {
      setError(
        localAIService.getSnapshot().failure
          ? null
          : reason instanceof Error
            ? reason.message
            : "No pudimos preparar el modelo local.",
      );
    }
  }

  async function confirmCacheDeletion() {
    if (!modelToDelete) return;
    const model = getLocalAIModel(modelToDelete);
    setDeleting(true);
    setError(null);
    setMessage(null);
    try {
      await localAIService.clearModelCache(modelToDelete);
      setCacheState((current) => ({ ...current, [modelToDelete]: false }));
      setMessage(`Se borró la caché local de ${model.label}.`);
      setModelToDelete(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos borrar la caché.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <main className="workspace settings-page">
        <header className="page-heading page-heading--compact">
          <div>
            <p className="eyebrow">Configuración de IA</p>
            <h1>Settings</h1>
            <p>Elegí entre procesamiento privado en el navegador o modelos remotos mediante Vercel AI Gateway.</p>
          </div>
        </header>

        <section className="panel settings-knowledge" aria-labelledby="settings-knowledge-heading">
          <div>
            <p className="section-kicker">Documentación técnica</p>
            <h2 id="settings-knowledge-heading">Base Knowledge administrable</h2>
            <p>
              Revisá fuentes, editá tags y publicá sólo los documentos que pueden
              participar en nuevos análisis.
            </p>
          </div>
          <Link className="button button--secondary" to="/knowledge">
            Administrar Knowledge
          </Link>
        </section>

        <section className="panel settings-runtime" aria-labelledby="local-ai-heading">
          <div className="settings-runtime__copy">
            <p className="section-kicker">
              {selectedLocalModel ? "Motor WebLLM local" : "Vercel AI Gateway"}
            </p>
            <h2 id="local-ai-heading">{aiStatus.modelLabel}</h2>
            <p>{selectedLocalModel
              ? "La selección se guarda sólo en este navegador. La descarga comienza al presionar el botón y se reutiliza desde la caché."
              : "Las solicitudes se envían al modelo elegido a través del Worker. La clave del Gateway nunca se expone al navegador y el uso puede generar costos."
            }</p>
            {selectedLocalModel && aiStatus.compatibility?.supported && (
              <dl className="hardware-summary">
                <div>
                  <dt>GPU detectada</dt>
                  <dd>{aiStatus.compatibility.adapterLabel || "Adaptador WebGPU"}</dd>
                </div>
                <div>
                  <dt>shader-f16</dt>
                  <dd>{aiStatus.compatibility.shaderF16 ? "Disponible" : "No disponible"}</dd>
                </div>
              </dl>
            )}
          </div>
          <div className="settings-runtime__action">
            {selectedLocalModel ? (
              <>
                <strong>≈{selectedLocalModel.downloadMB} MB de descarga</strong>
                <span>≈{selectedLocalModel.vramMB} MB de VRAM estimada</span>
                <button
                  className="button button--ai button--full"
                  type="button"
                  onClick={downloadSelectedModel}
                  disabled={
                    runtimeBusy ||
                    computeStatus.activeTask === "speech-transcription" ||
                    aiStatus.phase === "unsupported" ||
                    Boolean(aiStatus.failure?.blocksAI)
                  }
                >
                  {computeStatus.activeTask === "speech-transcription"
                    ? "Esperando transcripción…"
                    : aiStatus.phase === "loading"
                    ? "Preparando modelo…"
                    : aiStatus.phase === "ready"
                      ? "Modelo listo"
                    : cacheState[selectedLocalModel.id]
                      ? "Cargar desde caché"
                      : "Descargar y probar"}
                </button>
              </>
            ) : (
              <>
                <strong>Procesamiento remoto</strong>
                <span>{selectedGatewayModel?.providerLabel}</span>
                <span>Contexto: {selectedGatewayModel?.contextWindowSize.toLocaleString("es-AR")} tokens</span>
              </>
            )}
          </div>
          {selectedLocalModel && aiStatus.phase === "loading" && (
            <div className="ai-progress settings-runtime__progress" aria-live="polite">
              <div
                className="ai-progress__track"
                role="progressbar"
                aria-label="Descarga del modelo local"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(aiStatus.progress * 100)}
              >
                <span style={{ width: `${Math.round(aiStatus.progress * 100)}%` }} />
              </div>
              <div>
                <span>{aiStatus.cached ? "Cargando desde caché" : "Descargando en este navegador"}</span>
                <strong>{Math.round(aiStatus.progress * 100)}%</strong>
              </div>
              {aiStatus.progressText && <small>{aiStatus.progressText}</small>}
            </div>
          )}
          {aiStatus.failure && (
            <div className="settings-runtime__feedback">
              <LocalAIUnavailableNotice failure={aiStatus.failure} />
            </div>
          )}
        </section>

        {message && <div className="notice notice--info" role="status">{message}</div>}
        {error && <div className="notice notice--error" role="alert">{error}</div>}

        <section className="model-section" aria-labelledby="model-catalog-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Catálogo compatible</p>
              <h2 id="model-catalog-heading">Modelos locales oficiales</h2>
            </div>
            <span>WebLLM 0.2.84 · contexto 4096</span>
          </div>
          <div className="model-grid">
            {localAIModels.map((model) => {
              const selected = model.id === aiStatus.modelId;
              const cached = cacheState[model.id];
              return (
                <article
                  className={`model-card${selected ? " model-card--selected" : ""}`}
                  key={model.id}
                >
                  <div className="model-card__heading">
                    <span className={`model-tier model-tier--${model.category}`}>
                      {model.categoryLabel}
                    </span>
                    <span className="cache-badge">
                      {cached === null ? "Revisando caché" : cached ? "En caché" : "No descargado"}
                    </span>
                  </div>
                  <label className="model-choice">
                    <input
                      type="radio"
                      name="ai-model"
                      value={model.id}
                      checked={selected}
                      disabled={runtimeBusy}
                      onChange={() => void chooseModel(model.id)}
                    />
                    <span>
                      <strong>{model.label}</strong>
                      <small>{model.id}</small>
                    </span>
                  </label>
                  <dl className="model-specs">
                    <div><dt>Descarga</dt><dd>≈{model.downloadMB} MB</dd></div>
                    <div><dt>VRAM estimada</dt><dd>≈{model.vramMB} MB</dd></div>
                    <div><dt>Contexto</dt><dd>{model.contextWindowSize} tokens</dd></div>
                    <div>
                      <dt>Requisito</dt>
                      <dd>{model.requiredFeatures.length ? model.requiredFeatures.join(", ") : "WebGPU; sin shader-f16 obligatorio"}</dd>
                    </div>
                  </dl>
                  <div className="model-hardware">
                    <p><strong>Mínimo orientativo:</strong> {model.minimumHardware}</p>
                    <p><strong>Recomendado:</strong> {model.recommendedHardware}</p>
                    <p className="model-validation">{model.validation}</p>
                  </div>
                  {cached && (
                    <button
                      className="text-button model-card__delete"
                      type="button"
                      disabled={runtimeBusy}
                      onClick={() => setModelToDelete(model.id)}
                    >
                      Borrar caché…
                    </button>
                  )}
                  {modelToDelete === model.id && (
                    <div className="cache-confirmation" role="alertdialog" aria-labelledby={`delete-${model.id}`}>
                      <strong id={`delete-${model.id}`}>¿Borrar este modelo del navegador?</strong>
                      <p>Se eliminarán sus archivos locales. Para volver a usarlo habrá que descargarlo otra vez.</p>
                      <div>
                        <button className="button button--ghost button--compact" type="button" onClick={() => setModelToDelete(null)} disabled={deleting}>Cancelar</button>
                        <button className="button button--danger button--compact" type="button" onClick={confirmCacheDeletion} disabled={deleting}>{deleting ? "Borrando…" : "Sí, borrar caché"}</button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <section className="model-section" aria-labelledby="gateway-model-catalog-heading">
          <div className="section-heading">
            <div>
              <p className="section-kicker">Proveedor remoto opcional</p>
              <h2 id="gateway-model-catalog-heading">Vercel AI Gateway</h2>
            </div>
            <span>Tres modelos remotos validados</span>
          </div>
          <div className="model-grid">
            {gatewayAIModels.map((model) => {
              const selected = model.id === aiStatus.modelId;
              return (
                <article
                  className={`model-card${selected ? " model-card--selected" : ""}`}
                  key={model.id}
                >
                  <div className="model-card__heading">
                    <span className={`model-tier model-tier--${model.category}`}>
                      {model.categoryLabel}
                    </span>
                    <span className="cache-badge">Remoto</span>
                  </div>
                  <label className="model-choice">
                    <input
                      type="radio"
                      name="ai-model"
                      value={model.id}
                      checked={selected}
                      disabled={runtimeBusy}
                      onChange={() => void chooseModel(model.id)}
                    />
                    <span>
                      <strong>{model.label}</strong>
                      <small>{model.id}</small>
                    </span>
                  </label>
                  <dl className="model-specs">
                    <div><dt>Proveedor</dt><dd>{model.providerLabel}</dd></div>
                    <div><dt>Contexto</dt><dd>{model.contextWindowSize.toLocaleString("es-AR")} tokens</dd></div>
                    <div><dt>Procesamiento</dt><dd>Vercel AI Gateway</dd></div>
                    <div><dt>Costo</dt><dd>Según uso</dd></div>
                  </dl>
                  <div className="model-hardware">
                    <p>{model.description}</p>
                    <p className="model-validation">Requiere conexión y AI_GATEWAY_API_KEY configurada en el Worker.</p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <aside className="notice notice--caution settings-note">
          <strong>Privacidad, costo y compatibilidad</strong>
          <span>
            Los modelos locales mantienen los datos en el navegador. Al elegir Vercel AI Gateway, el contenido
            necesario para la tarea se envía al proveedor remoto seleccionado y puede generar cargos. En ambos
            casos, las propuestas requieren revisión del técnico y los flujos manuales siguen disponibles.
          </span>
        </aside>
      </main>
    </AppShell>
  );
}
