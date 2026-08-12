import type {
  AppConfig,
  InitProgressReport,
  MLCEngineInterface,
} from "@mlc-ai/web-llm";
import type { LocalAIService } from "../domain/local-ai-service";
import {
  diagnosticAnalysisSchema,
  repairDraftSchema,
  type DiagnosticAnalysis,
  type KnowledgeDocument,
  type Repair,
  type RepairDraft,
  type RepairEvent,
} from "../domain/schemas";
import {
  LOCAL_AI_MODEL_DOWNLOAD_MB,
  LOCAL_AI_MODEL_ID,
  LOCAL_AI_MODEL_LABEL,
  LOCAL_AI_MODEL_VRAM_MB,
  createDiagnosticAnalysisJsonSchema,
  repairDraftJsonSchema,
} from "./model-config";
import { checkWebGPU, type WebGPUCompatibility } from "./webgpu";

export type LocalAIPhase =
  | "checking"
  | "unsupported"
  | "idle"
  | "loading"
  | "ready"
  | "generating"
  | "error";

export type LocalAIRuntimeSnapshot = {
  phase: LocalAIPhase;
  progress: number;
  progressText: string | null;
  error: string | null;
  compatibility: WebGPUCompatibility | null;
  modelId: typeof LOCAL_AI_MODEL_ID;
  modelLabel: string;
  downloadMB: number;
  vramMB: number;
  cached: boolean | null;
};

const extractionSystemPrompt = `Eres un extractor de datos para un taller de reparación de laptops.
Devuelve únicamente un objeto JSON que cumpla el esquema solicitado.

Reglas obligatorias:
- Devuelve siempre exactamente estas siete claves: customerName, brand, model, serialNumber, reportedIssue, accessories y status.
- Usa exclusivamente datos explícitos del texto del técnico.
- Nunca deduzcas, completes ni inventes datos.
- Usa null para cualquier campo de texto ausente.
- No uses una cadena vacía para representar un dato ausente.
- Usa [] si no se mencionan accesorios.
- reportedIssue contiene el síntoma informado, no una hipótesis ni un diagnóstico.
- status debe ser null salvo que el texto contenga literalmente uno de los códigos de estado permitidos.
- Conserva nombres, marcas, modelos, números de serie y accesorios tal como aparecen.
- No agregues claves fuera del esquema.`;

const diagnosisSystemPrompt = `Eres un asistente local para técnicos de reparación de laptops.
Devuelve únicamente un objeto JSON que cumpla exactamente el esquema solicitado.

Reglas obligatorias:
- Basa el análisis sólo en repair, events y knowledgeDocuments recibidos.
- Distingue el síntoma informado, las observaciones, las mediciones, las hipótesis y los diagnósticos confirmados.
- assessment resume el estado técnico observado sin convertir una hipótesis en diagnóstico.
- hypotheses contiene posibilidades comprobables, con confidence low, medium o high. Usa high sólo cuando la evidencia registrada sea fuerte, sin afirmar confirmación.
- nextSteps propone verificaciones concretas y seguras; cada reason explica qué permite discriminar.
- missingInformation enumera datos necesarios que no constan en repair ni events.
- sources contiene exclusivamente IDs de knowledgeDocuments usados. No inventes IDs y usa [] si no utilizaste ninguno.
- La documentación es orientación general: un valor aislado no confirma un componente defectuoso.
- No agregues claves fuera del esquema.`;

const repairDraftTextFields = [
  "customerName",
  "brand",
  "model",
  "serialNumber",
  "reportedIssue",
] as const;

function normalizeEmptyRepairDraftValues(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;

  const normalized = { ...(value as Record<string, unknown>) };
  for (const field of repairDraftTextFields) {
    const fieldValue = normalized[field];
    if (typeof fieldValue === "string" && !fieldValue.trim()) {
      normalized[field] = null;
    }
  }

  if (Array.isArray(normalized.accessories)) {
    normalized.accessories = normalized.accessories.filter(
      (item) => typeof item !== "string" || Boolean(item.trim()),
    );
  }

  return normalized;
}

export function parseRepairDraftResponse(content: string): RepairDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("El modelo local devolvió JSON inválido. Volvé a intentar.");
  }

  const result = repairDraftSchema.safeParse(
    normalizeEmptyRepairDraftValues(parsed),
  );
  if (!result.success) {
    throw new Error(
      "La extracción local no cumplió el formato esperado. Volvé a intentar o continuá manualmente.",
    );
  }
  return result.data;
}

export function parseDiagnosticAnalysisResponse(
  content: string,
  retrievedSourceIds: readonly string[],
): DiagnosticAnalysis {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("El modelo local devolvió un análisis con JSON inválido. Volvé a intentar.");
  }

  const result = diagnosticAnalysisSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      "El análisis local no cumplió el formato esperado. No se guardó ninguna sugerencia.",
    );
  }

  const allowedSources = new Set(retrievedSourceIds);
  if (result.data.sources.some((sourceId) => !allowedSources.has(sourceId))) {
    throw new Error(
      "El análisis local citó una fuente que no fue recuperada. No se guardó ninguna sugerencia.",
    );
  }

  return result.data;
}

export function buildDiagnosisRequestContent(
  repair: Repair,
  events: readonly RepairEvent[],
  knowledgeDocuments: readonly KnowledgeDocument[],
): string {
  return JSON.stringify({
    repair,
    events,
    knowledgeDocuments: knowledgeDocuments.slice(0, 3),
  });
}

function friendlyModelError(reason: unknown): string {
  const detail = reason instanceof Error ? reason.message : String(reason);
  const normalized = detail.toLocaleLowerCase();

  if (
    normalized.includes("memory") ||
    normalized.includes("allocation") ||
    normalized.includes("device lost")
  ) {
    return "La GPU no tuvo memoria suficiente para cargar el modelo local. Cerrá otras pestañas y volvé a intentar.";
  }
  if (normalized.includes("webgpu") || normalized.includes("gpu adapter")) {
    return "WebGPU no pudo iniciar el modelo. Usá Chrome con aceleración por hardware habilitada.";
  }
  return "No se pudo ejecutar el modelo local. Los registros manuales siguen disponibles.";
}

export class WebLLMLocalAIService implements LocalAIService {
  private engine: MLCEngineInterface | null = null;
  private worker: Worker | null = null;
  private probePromise: Promise<WebGPUCompatibility> | null = null;
  private loadPromise: Promise<MLCEngineInterface> | null = null;
  private listeners = new Set<() => void>();
  private snapshot: LocalAIRuntimeSnapshot = {
    phase: "checking",
    progress: 0,
    progressText: "Comprobando WebGPU…",
    error: null,
    compatibility: null,
    modelId: LOCAL_AI_MODEL_ID,
    modelLabel: LOCAL_AI_MODEL_LABEL,
    downloadMB: LOCAL_AI_MODEL_DOWNLOAD_MB,
    vramMB: LOCAL_AI_MODEL_VRAM_MB,
    cached: null,
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): LocalAIRuntimeSnapshot => this.snapshot;

  async probeCompatibility(): Promise<WebGPUCompatibility> {
    if (this.snapshot.compatibility) return this.snapshot.compatibility;
    if (this.probePromise) return this.probePromise;

    this.probePromise = checkWebGPU().then((compatibility) => {
      this.update(
        compatibility.supported
          ? {
              phase: "idle",
              compatibility,
              progressText: null,
              error: null,
            }
          : {
              phase: "unsupported",
              compatibility,
              progressText: null,
              error: compatibility.message,
            },
      );
      return compatibility;
    });
    return this.probePromise;
  }

  async extractRepair(input: string): Promise<RepairDraft> {
    const cleanInput = input.trim();
    if (!cleanInput) throw new Error("Escribí una descripción antes de procesar.");

    const engine = await this.ensureReady();
    this.update({
      phase: "generating",
      progress: 1,
      progressText: "Extrayendo datos en este navegador…",
      error: null,
    });

    try {
      const response = await engine.chat.completions.create({
        messages: [
          { role: "system", content: extractionSystemPrompt },
          {
            role: "user",
            content: `Extrae los datos explícitos del siguiente ingreso y devuelve JSON:\n\n${cleanInput}`,
          },
        ],
        response_format: {
          type: "json_object",
          schema: JSON.stringify(repairDraftJsonSchema),
        },
        temperature: 0,
        top_p: 1,
        max_tokens: 320,
        seed: 42,
      });
      const content = response.choices[0]?.message.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("El modelo local no devolvió contenido.");
      }
      const draft = parseRepairDraftResponse(content);
      this.update({ phase: "ready", progressText: null, error: null });
      return draft;
    } catch (reason) {
      const message =
        reason instanceof Error &&
        (reason.message.startsWith("El modelo local") ||
          reason.message.startsWith("La extracción local"))
          ? reason.message
          : friendlyModelError(reason);
      this.update({ phase: "error", progressText: null, error: message });
      throw new Error(message);
    }
  }

  async analyzeDiagnosis(
    repair: Repair,
    events: RepairEvent[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<DiagnosticAnalysis> {
    const retrievedDocuments = knowledgeDocuments.slice(0, 3);
    const retrievedSourceIds = retrievedDocuments.map((document) => document.id);
    const engine = await this.ensureReady();
    this.update({
      phase: "generating",
      progress: 1,
      progressText: "Analizando evidencia y documentación local…",
      error: null,
    });

    try {
      const response = await engine.chat.completions.create({
        messages: [
          { role: "system", content: diagnosisSystemPrompt },
          {
            role: "user",
            content: buildDiagnosisRequestContent(
              repair,
              events,
              retrievedDocuments,
            ),
          },
        ],
        response_format: {
          type: "json_object",
          schema: JSON.stringify(
            createDiagnosticAnalysisJsonSchema(retrievedSourceIds),
          ),
        },
        temperature: 0,
        top_p: 1,
        max_tokens: 650,
        seed: 42,
      });
      const content = response.choices[0]?.message.content;
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("El modelo local no devolvió un análisis.");
      }
      const analysis = parseDiagnosticAnalysisResponse(
        content,
        retrievedSourceIds,
      );
      this.update({ phase: "ready", progressText: null, error: null });
      return analysis;
    } catch (reason) {
      const message =
        reason instanceof Error &&
        (reason.message.startsWith("El modelo local") ||
          reason.message.startsWith("El análisis local"))
          ? reason.message
          : friendlyModelError(reason);
      this.update({ phase: "error", progressText: null, error: message });
      throw new Error(message);
    }
  }

  async generateFinalReport(
    _repair: Repair,
    _events: RepairEvent[],
  ): Promise<string> {
    throw new Error("El informe final todavía no está disponible.");
  }

  private async ensureReady(): Promise<MLCEngineInterface> {
    if (this.engine) return this.engine;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this.loadModel();
    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async loadModel(): Promise<MLCEngineInterface> {
    const compatibility = await this.probeCompatibility();
    if (!compatibility.supported) throw new Error(compatibility.message);

    this.update({
      phase: "loading",
      progress: 0,
      progressText: "Preparando el motor local…",
      error: null,
    });

    try {
      const webllm = await import("@mlc-ai/web-llm");
      const appConfig: AppConfig = {
        ...webllm.prebuiltAppConfig,
        cacheBackend: "cache",
      };
      const cached = await webllm.hasModelInCache(
        LOCAL_AI_MODEL_ID,
        appConfig,
      );
      this.update({ cached });

      this.worker = new Worker(new URL("./webllm.worker.ts", import.meta.url), {
        type: "module",
        name: "fixflow-local-ai",
      });

      const onProgress = (report: InitProgressReport) => {
        this.update({
          phase: "loading",
          progress: Math.min(1, Math.max(0, report.progress)),
          progressText: report.text,
        });
      };

      const engine = await webllm.CreateWebWorkerMLCEngine(
        this.worker,
        LOCAL_AI_MODEL_ID,
        { appConfig, initProgressCallback: onProgress, logLevel: "WARN" },
        { context_window_size: 2048 },
      );
      this.engine = engine;
      this.update({
        phase: "ready",
        progress: 1,
        progressText: null,
        error: null,
        cached: true,
      });
      return engine;
    } catch (reason) {
      this.worker?.terminate();
      this.worker = null;
      const message = friendlyModelError(reason);
      this.update({ phase: "error", progressText: null, error: message });
      throw new Error(message);
    }
  }

  private update(changes: Partial<LocalAIRuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }
}
