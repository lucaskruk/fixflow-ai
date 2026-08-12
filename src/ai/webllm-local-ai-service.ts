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
  DEFAULT_LOCAL_AI_MODEL_ID,
  DIAGNOSTIC_LOCAL_AI_MODEL_ID,
  LOCAL_AI_MODEL_DOWNLOAD_MB,
  LOCAL_AI_MODEL_ID,
  LOCAL_AI_MODEL_LABEL,
  LOCAL_AI_MODEL_VRAM_MB,
  getLocalAIModel,
  type LocalAIModelId,
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
  modelId: LocalAIModelId;
  modelLabel: string;
  downloadMB: number;
  vramMB: number;
  cached: boolean | null;
  failure: LocalAIFailure | null;
  debugOutput: LocalAIDebugOutput | null;
};

export type LocalAIDebugOutput = {
  task: "repair-extraction" | "diagnostic-analysis";
  modelId: string;
  finishReason: string | null;
  content: string;
  contentLength: number;
  capturedAt: string;
};

export type LocalAIFailureCode =
  | "WEBGPU_UNAVAILABLE"
  | "GPU_ADAPTER_UNAVAILABLE"
  | "GPU_DEVICE_LOST"
  | "GPU_MEMORY_EXHAUSTED"
  | "MODEL_EXECUTION_FAILED";

export type LocalAIFailure = {
  code: LocalAIFailureCode;
  title: string;
  message: string;
  blocksAI: boolean;
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
- Sé conciso: máximo 2 hipótesis, 3 próximos pasos y 3 datos faltantes.
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

function parseModelJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1];
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  const candidates = [
    trimmed,
    fenced,
    firstBrace >= 0 && lastBrace > firstBrace
      ? trimmed.slice(firstBrace, lastBrace + 1)
      : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of new Set(candidates)) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next safe wrapper variant. Schema validation still follows.
    }
  }

  throw new SyntaxError("Invalid model JSON");
}

export function parseRepairDraftResponse(content: string): RepairDraft {
  let parsed: unknown;
  try {
    parsed = parseModelJson(content);
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
    parsed = parseModelJson(content);
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
  if (retrievedSourceIds.length > 0 && result.data.sources.length === 0) {
    throw new Error(
      "El análisis local no citó la documentación recuperada. No se guardó ninguna sugerencia.",
    );
  }
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

export function classifyLocalAIError(
  reason: unknown,
  modelLabel: string = LOCAL_AI_MODEL_LABEL,
): LocalAIFailure {
  const detail = reason instanceof Error ? reason.message : String(reason);
  const normalized = detail.toLocaleLowerCase();

  if (
    normalized.includes("device lost") ||
    normalized.includes("device was lost") ||
    normalized.includes("device_hung") ||
    normalized.includes("dxgi_error_device_hung") ||
    normalized.includes("gpu disappeared")
  ) {
    return {
      code: "GPU_DEVICE_LOST",
      title: "Este modelo local no puede ejecutarse de forma estable en esta PC",
      message: `Chrome perdió acceso a la GPU mientras ejecutaba ${modelLabel}. Puede deberse a memoria de video insuficiente o a una limitación del controlador. Cerrá otras aplicaciones y reiniciá Chrome antes de volver a probar.`,
      blocksAI: true,
    };
  }
  if (
    normalized.includes("memory") ||
    normalized.includes("allocation") ||
    normalized.includes("out of memory") ||
    normalized.includes("oom")
  ) {
    return {
      code: "GPU_MEMORY_EXHAUSTED",
      title: "La GPU no tiene memoria suficiente para este modelo local",
      message: `${modelLabel} no pudo reservar la memoria de video necesaria. La IA local quedó desactivada en esta pestaña; las funciones manuales continúan disponibles.`,
      blocksAI: true,
    };
  }
  if (normalized.includes("webgpu") || normalized.includes("gpu adapter")) {
    return {
      code: "GPU_ADAPTER_UNAVAILABLE",
      title: "Esta PC no ofrece una GPU compatible para la IA local",
      message: "WebGPU no pudo iniciar el modelo. Usá Chrome con aceleración por hardware habilitada y un controlador de video actualizado.",
      blocksAI: true,
    };
  }
  return {
    code: "MODEL_EXECUTION_FAILED",
    title: "El modelo local no pudo completar la tarea",
    message: "No se pudo ejecutar el modelo local. Podés volver a intentar; los registros manuales siguen disponibles.",
    blocksAI: false,
  };
}

function compatibilityFailure(
  compatibility: Exclude<WebGPUCompatibility, { supported: true }>,
): LocalAIFailure {
  return {
    code:
      compatibility.reason === "API_UNAVAILABLE"
        ? "WEBGPU_UNAVAILABLE"
        : "GPU_ADAPTER_UNAVAILABLE",
    title:
      compatibility.reason === "API_UNAVAILABLE"
        ? "La IA local no está disponible en este navegador"
        : "Esta PC no ofrece una GPU compatible para la IA local",
    message: compatibility.message,
    blocksAI: true,
  };
}

export class WebLLMLocalAIService implements LocalAIService {
  private engine: MLCEngineInterface | null = null;
  private worker: Worker | null = null;
  private loadedModelId: LocalAIModelId | null = null;
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
    failure: null,
    debugOutput: null,
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
      const failure = compatibility.supported
        ? null
        : compatibilityFailure(compatibility);
      this.update(
        compatibility.supported
          ? {
              phase: "idle",
              compatibility,
              progressText: null,
              error: null,
              failure: null,
            }
          : {
              phase: "unsupported",
              compatibility,
              progressText: null,
              error: compatibility.message,
              failure,
            },
      );
      return compatibility;
    });
    return this.probePromise;
  }

  async extractRepair(input: string): Promise<RepairDraft> {
    const cleanInput = input.trim();
    if (!cleanInput) throw new Error("Escribí una descripción antes de procesar.");

    const engine = await this.ensureReady(DEFAULT_LOCAL_AI_MODEL_ID);
    this.update({
      phase: "generating",
      progress: 1,
      progressText: "Extrayendo datos en este navegador…",
      error: null,
      debugOutput: null,
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
      const choice = response.choices[0];
      const content = choice?.message.content;
      this.captureDebugOutput(
        "repair-extraction",
        typeof content === "string" ? content : String(content ?? ""),
        choice?.finish_reason ?? null,
      );
      if (choice?.finish_reason === "length") {
        throw new Error(
          "El modelo local agotó el límite de respuesta y devolvió una extracción truncada. Volvé a intentar o continuá manualmente.",
        );
      }
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("El modelo local no devolvió contenido.");
      }
      const draft = parseRepairDraftResponse(content);
      this.update({ phase: "ready", progressText: null, error: null, failure: null });
      return draft;
    } catch (reason) {
      const isOutputError =
        reason instanceof Error &&
        (reason.message.startsWith("El modelo local") ||
          reason.message.startsWith("La extracción local"));
      const failure = isOutputError ? null : classifyLocalAIError(reason);
      const message =
        isOutputError && reason instanceof Error
          ? reason.message
          : failure!.message;
      if (failure?.blocksAI) this.releaseEngine();
      this.update({ phase: "error", progressText: null, error: message, failure });
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
    const engine = await this.ensureReady(DIAGNOSTIC_LOCAL_AI_MODEL_ID);
    this.update({
      phase: "generating",
      progress: 1,
      progressText: "Analizando evidencia y documentación local…",
      error: null,
      debugOutput: null,
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
        max_tokens: 950,
        seed: 42,
      });
      const choice = response.choices[0];
      const content = choice?.message.content;
      this.captureDebugOutput(
        "diagnostic-analysis",
        typeof content === "string" ? content : String(content ?? ""),
        choice?.finish_reason ?? null,
      );
      if (choice?.finish_reason === "length") {
        throw new Error(
          "El modelo local agotó el límite de respuesta y devolvió un análisis truncado. No se guardó ninguna sugerencia.",
        );
      }
      if (typeof content !== "string" || !content.trim()) {
        throw new Error("El modelo local no devolvió un análisis.");
      }
      const analysis = parseDiagnosticAnalysisResponse(
        content,
        retrievedSourceIds,
      );
      this.update({ phase: "ready", progressText: null, error: null, failure: null });
      return analysis;
    } catch (reason) {
      const isOutputError =
        reason instanceof Error &&
        (reason.message.startsWith("El modelo local") ||
          reason.message.startsWith("El análisis local"));
      const failure = isOutputError ? null : classifyLocalAIError(reason);
      const message =
        isOutputError && reason instanceof Error
          ? reason.message
          : failure!.message;
      if (failure?.blocksAI) this.releaseEngine();
      this.update({ phase: "error", progressText: null, error: message, failure });
      throw new Error(message);
    }
  }

  async generateFinalReport(
    _repair: Repair,
    _events: RepairEvent[],
  ): Promise<string> {
    throw new Error("El informe final todavía no está disponible.");
  }

  private async ensureReady(modelId: LocalAIModelId): Promise<MLCEngineInterface> {
    if (this.engine && this.loadedModelId === modelId) return this.engine;
    if (this.loadPromise) return this.loadPromise;

    if (this.engine || this.worker) this.releaseEngine();
    this.loadPromise = this.loadModel(modelId);
    try {
      return await this.loadPromise;
    } finally {
      this.loadPromise = null;
    }
  }

  private async loadModel(modelId: LocalAIModelId): Promise<MLCEngineInterface> {
    const compatibility = await this.probeCompatibility();
    if (!compatibility.supported) throw new Error(compatibility.message);
    const model = getLocalAIModel(modelId);

    this.update({
      phase: "loading",
      progress: 0,
      progressText: "Preparando el motor local…",
      error: null,
      failure: null,
      modelId: model.id,
      modelLabel: model.label,
      downloadMB: model.downloadMB,
      vramMB: model.vramMB,
    });

    try {
      const webllm = await import("@mlc-ai/web-llm");
      const appConfig: AppConfig = {
        ...webllm.prebuiltAppConfig,
        cacheBackend: "cache",
      };
      const cached = await webllm.hasModelInCache(
        model.id,
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
        model.id,
        { appConfig, initProgressCallback: onProgress, logLevel: "WARN" },
        { context_window_size: model.contextWindowSize },
      );
      this.engine = engine;
      this.loadedModelId = model.id;
      this.update({
        phase: "ready",
        progress: 1,
        progressText: null,
        error: null,
        cached: true,
        failure: null,
      });
      return engine;
    } catch (reason) {
      this.releaseEngine();
      const failure = classifyLocalAIError(reason);
      this.update({
        phase: "error",
        progressText: null,
        error: failure.message,
        failure,
      });
      throw new Error(failure.message);
    }
  }

  private releaseEngine(): void {
    this.engine = null;
    this.loadedModelId = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private captureDebugOutput(
    task: LocalAIDebugOutput["task"],
    content: string,
    finishReason: string | null,
  ): void {
    if (!import.meta.env.DEV) return;

    const debugOutput: LocalAIDebugOutput = {
      task,
      modelId: this.snapshot.modelId,
      finishReason,
      content,
      contentLength: content.length,
      capturedAt: new Date().toISOString(),
    };
    this.update({ debugOutput });

    console.groupCollapsed(
      `[FixFlow AI debug] ${task} · ${finishReason ?? "sin finish_reason"} · ${content.length} caracteres`,
    );
    console.info("Modelo:", this.snapshot.modelId);
    console.info("Finish reason:", finishReason);
    console.info("Salida cruda:", content);
    console.groupEnd();
  }

  private update(changes: Partial<LocalAIRuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }
}
