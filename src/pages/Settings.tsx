import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { localAIService, useLocalAIStatus } from "../ai/local-ai";
import {
  getLocalAIModel,
  localAIModels,
  type LocalAIModelId,
} from "../ai/model-config";
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
  const [cacheState, setCacheState] = useState<CacheState>(emptyCacheState);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modelToDelete, setModelToDelete] = useState<LocalAIModelId | null>(null);
  const [deleting, setDeleting] = useState(false);
  const runtimeBusy = aiStatus.phase === "loading" || aiStatus.phase === "generating";
  const selectedModel = getLocalAIModel(aiStatus.modelId);

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

  async function chooseModel(modelId: LocalAIModelId) {
    setError(null);
    setMessage(null);
    setModelToDelete(null);
    try {
      await localAIService.selectModel(modelId);
      const model = getLocalAIModel(modelId);
      setMessage(
        `${model.label} quedó seleccionado para ingresos y análisis. No se descargó nada.`,
      );
      await refreshCacheState();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos cambiar el modelo.");
    }
  }

  async function downloadSelectedModel() {
    setError(null);
    setMessage(null);
    try {
      await localAIService.loadSelectedModel();
      setMessage(`${selectedModel.label} está listo en este navegador.`);
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
            <p className="eyebrow">Configuración local</p>
            <h1>Settings</h1>
            <p>Elegí el modelo que se usará tanto para extraer ingresos como para analizar diagnósticos.</p>
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
            <p className="section-kicker">Motor WebLLM</p>
            <h2 id="local-ai-heading">{selectedModel.label}</h2>
            <p>
              La selección se guarda sólo en este navegador. La descarga comienza únicamente al
              presionar el botón y se reutiliza desde la caché cuando ya existe.
            </p>
            {aiStatus.compatibility?.supported && (
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
            <strong>≈{selectedModel.downloadMB} MB de descarga</strong>
            <span>≈{selectedModel.vramMB} MB de VRAM estimada</span>
            <button
              className="button button--ai button--full"
              type="button"
              onClick={downloadSelectedModel}
              disabled={
                runtimeBusy ||
                aiStatus.phase === "unsupported" ||
                Boolean(aiStatus.failure?.blocksAI)
              }
            >
              {aiStatus.phase === "loading"
                ? "Preparando modelo…"
                : aiStatus.phase === "ready"
                  ? "Modelo listo"
                : cacheState[selectedModel.id]
                  ? "Cargar desde caché"
                  : "Descargar y probar"}
            </button>
          </div>
          {aiStatus.phase === "loading" && (
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
              <h2 id="model-catalog-heading">Modelos oficiales precompilados</h2>
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
                      name="local-ai-model"
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

        <aside className="notice notice--caution settings-note">
          <strong>Compatibilidad real pendiente de prueba</strong>
          <span>
            WebGPU no informa de forma fiable cuánta memoria queda disponible. Las cifras son estimaciones
            del catálogo; seleccionar un modelo no garantiza que el equipo pueda cargarlo. Los flujos manuales
            siguen funcionando si la IA falla.
          </span>
        </aside>
      </main>
    </AppShell>
  );
}
