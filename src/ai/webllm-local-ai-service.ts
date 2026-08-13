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
  type KnowledgeProposalCandidate,
  type KnowledgeProposalRepairEvidence,
  type Repair,
  type RepairDraft,
  type RepairEvent,
} from "../domain/schemas";
import {
  getLocalAIModel,
  type LocalAIModelId,
  createDiagnosticAnalysisJsonSchema,
  createKnowledgeProposalJsonSchema,
  repairDraftJsonSchema,
} from "./model-config";
import {
  buildKnowledgeProposalRequestContent,
  parseKnowledgeProposalResponse,
} from "./knowledge-proposals";
import {
  loadSelectedLocalAIModelId,
  persistSelectedLocalAIModelId,
} from "./model-preferences";
import {
  buildFinalReportRequestContent,
  createSafeFinalReportText,
  finalReportJsonSchema,
  formatFinalReport,
  parseFinalReportResponse,
} from "./final-report";
import { checkWebGPU, type WebGPUCompatibility } from "./webgpu";
import { localComputeCoordinator } from "./local-compute-coordinator";

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
  task: "repair-extraction" | "diagnostic-analysis" | "final-report" | "knowledge-proposal";
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
  | "MODEL_FEATURE_UNAVAILABLE"
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

const finalReportSystemPrompt = `Eres un redactor de informes para un taller de reparación de laptops.
Devuelve únicamente un objeto JSON que cumpla exactamente el esquema solicitado.

Reglas obligatorias:
- Usa exclusivamente los datos del objeto recibido. No inventes pruebas, resultados, fallas, reparaciones ni estados.
- Mantén separados el síntoma informado, las pruebas y mediciones, las observaciones, el diagnóstico confirmado, la reparación realizada, el estado final y las recomendaciones.
- Sólo repair.confirmedDiagnosis y technicianRecords.confirmedDiagnoses pueden alimentar confirmedDiagnosis.
- Sólo repair.confirmedSolution y technicianRecords.repairsPerformed pueden alimentar repairPerformed.
- Las sugerencias de IA no se incluyen en el objeto de entrada y nunca son evidencia ni diagnóstico confirmado.
- Si una sección no tiene registros, devuelve un array vacío; no completes datos ausentes.
- Las recomendaciones deben ser prudentes, breves y compatibles con el estado registrado. No presentes una hipótesis como hecho.
- Redacta en español claro, apto para revisión por el técnico y entrega al cliente.
- No agregues claves fuera del esquema.`;

const knowledgeProposalSystemPrompt = `Eres un asistente local que propone mejoras para la base técnica de un taller de reparación de laptops.
Devuelve únicamente un objeto JSON que cumpla exactamente el esquema solicitado.

Reglas obligatorias:
- Genera como máximo 3 candidatos y nunca publiques ni guardes nada.
- Usa sólo deliveredRepairEvidence y relatedKnowledgeDocuments recibidos.
- reportedIssue es contexto aportado por el cliente, no evidencia técnica confirmada.
- notes y measurements son registros técnicos separados; no los presentes como diagnóstico por sí solos.
- Sólo confirmedDiagnosisEvents, confirmedRepairEvents, confirmedRepairDiagnosis y confirmedRepairSolution respaldan conclusiones para un candidato.
- No recibes AI_SUGGESTION: nunca inventes, reconstruyas ni uses hipótesis de IA como evidencia.
- sourceRepairIds contiene exclusivamente IDs de reparaciones que respaldan el candidato con evidencia confirmada.
- Para operation update, usa como targetDocumentId un ID de relatedKnowledgeDocuments y conserva ese mismo valor en id.
- Para operation new, usa targetDocumentId null y un id estable en minúsculas, números y guiones.
- No repitas contenido ya cubierto. Propón una actualización cuando exista un documento relacionado y uno nuevo sólo si el tema no está cubierto.
- El contenido debe distinguir síntoma, comprobaciones, diagnóstico confirmado y reparación comprobada. Evita generalizar a partir de un único caso.
- Los candidatos quedan sujetos a edición y confirmación humana obligatoria.
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
  modelLabel: string = "el modelo seleccionado",
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
  private generationInProgress = false;
  private listeners = new Set<() => void>();
  private snapshot: LocalAIRuntimeSnapshot;

  constructor() {
    const selectedModel = getLocalAIModel(loadSelectedLocalAIModelId());
    this.snapshot = {
      phase: "checking",
      progress: 0,
      progressText: "Comprobando WebGPU…",
      error: null,
      compatibility: null,
      modelId: selectedModel.id,
      modelLabel: selectedModel.label,
      downloadMB: selectedModel.downloadMB,
      vramMB: selectedModel.vramMB,
      cached: null,
      failure: null,
      debugOutput: null,
    };
  }

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

  async selectModel(modelId: LocalAIModelId): Promise<void> {
    if (this.snapshot.phase === "loading" || this.generationInProgress) {
      throw new Error(
        "Esperá a que termine la operación de IA antes de cambiar el modelo.",
      );
    }
    if (this.snapshot.modelId === modelId) return;

    const model = getLocalAIModel(modelId);
    await this.unloadEngine();
    persistSelectedLocalAIModelId(modelId);
    const unsupportedFailure =
      this.snapshot.compatibility?.supported === false
        ? compatibilityFailure(this.snapshot.compatibility)
        : null;
    this.update({
      phase: unsupportedFailure
        ? "unsupported"
        : this.snapshot.compatibility?.supported
          ? "idle"
          : "checking",
      progress: 0,
      progressText: null,
      error: unsupportedFailure?.message ?? null,
      modelId: model.id,
      modelLabel: model.label,
      downloadMB: model.downloadMB,
      vramMB: model.vramMB,
      cached: null,
      failure: unsupportedFailure,
      debugOutput: null,
    });
  }

  async loadSelectedModel(): Promise<void> {
    if (this.generationInProgress) {
      throw new Error("Ya hay una generación local en curso.");
    }
    const releaseCompute = localComputeCoordinator.tryAcquire("local-ai");
    try {
      await this.ensureReady(this.snapshot.modelId);
    } finally {
      releaseCompute();
    }
  }

  async isModelCached(modelId: LocalAIModelId): Promise<boolean> {
    const webllm = await import("@mlc-ai/web-llm");
    const appConfig: AppConfig = {
      ...webllm.prebuiltAppConfig,
      cacheBackend: "cache",
    };
    return webllm.hasModelInCache(modelId, appConfig);
  }

  async clearModelCache(modelId: LocalAIModelId): Promise<void> {
    if (this.snapshot.phase === "loading" || this.generationInProgress) {
      throw new Error(
        "Esperá a que termine la operación de IA antes de borrar la caché.",
      );
    }
    if (this.loadedModelId === modelId) await this.unloadEngine();

    const webllm = await import("@mlc-ai/web-llm");
    const appConfig: AppConfig = {
      ...webllm.prebuiltAppConfig,
      cacheBackend: "cache",
    };
    await webllm.deleteModelAllInfoInCache(modelId, appConfig);
    if (this.snapshot.modelId === modelId) {
      this.update({
        phase: this.snapshot.compatibility?.supported ? "idle" : this.snapshot.phase,
        progress: 0,
        progressText: null,
        cached: false,
      });
    }
  }

  async extractRepair(input: string): Promise<RepairDraft> {
    const cleanInput = input.trim();
    if (!cleanInput) throw new Error("Escribí una descripción antes de procesar.");
    if (this.generationInProgress) {
      throw new Error("Ya hay una generación local en curso.");
    }
    const releaseCompute = localComputeCoordinator.tryAcquire("local-ai");
    this.generationInProgress = true;

    try {
      const engine = await this.ensureReady(this.snapshot.modelId);
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
        const failure = isOutputError
          ? null
          : classifyLocalAIError(reason, this.snapshot.modelLabel);
        const message =
          isOutputError && reason instanceof Error
            ? reason.message
            : failure!.message;
        if (failure?.blocksAI) this.terminateEngine();
        this.update({ phase: "error", progressText: null, error: message, failure });
        throw new Error(message);
      }
    } finally {
      this.generationInProgress = false;
      releaseCompute();
    }
  }

  async analyzeDiagnosis(
    repair: Repair,
    events: RepairEvent[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<DiagnosticAnalysis> {
    if (this.generationInProgress) {
      throw new Error("Ya hay una generación local en curso.");
    }
    const releaseCompute = localComputeCoordinator.tryAcquire("local-ai");
    this.generationInProgress = true;
    const retrievedDocuments = knowledgeDocuments.slice(0, 3);
    const retrievedSourceIds = retrievedDocuments.map((document) => document.id);

    try {
      const engine = await this.ensureReady(this.snapshot.modelId);
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
        const failure = isOutputError
          ? null
          : classifyLocalAIError(reason, this.snapshot.modelLabel);
        const message =
          isOutputError && reason instanceof Error
            ? reason.message
            : failure!.message;
        if (failure?.blocksAI) this.terminateEngine();
        this.update({ phase: "error", progressText: null, error: message, failure });
        throw new Error(message);
      }
    } finally {
      this.generationInProgress = false;
      releaseCompute();
    }
  }

  async generateFinalReport(
    repair: Repair,
    events: RepairEvent[],
  ): Promise<string> {
    if (this.generationInProgress) {
      throw new Error("Ya hay una generación local en curso.");
    }
    const releaseCompute = localComputeCoordinator.tryAcquire("local-ai");
    this.generationInProgress = true;
    const safeFallback = createSafeFinalReportText(repair, events);

    try {
      const engine = await this.ensureReady(this.snapshot.modelId);
      this.update({
        phase: "generating",
        progress: 1,
        progressText: "Preparando un borrador de informe local…",
        error: null,
        debugOutput: null,
      });

      try {
        const response = await engine.chat.completions.create({
          messages: [
            { role: "system", content: finalReportSystemPrompt },
            {
              role: "user",
              content: buildFinalReportRequestContent(repair, events),
            },
          ],
          response_format: {
            type: "json_object",
            schema: JSON.stringify(finalReportJsonSchema),
          },
          temperature: 0,
          top_p: 1,
          max_tokens: 1_150,
          seed: 42,
        });
        const choice = response.choices[0];
        const content = choice?.message.content;
        this.captureDebugOutput(
          "final-report",
          typeof content === "string" ? content : String(content ?? ""),
          choice?.finish_reason ?? null,
        );
        if (choice?.finish_reason === "length") {
          throw new Error("El modelo local devolvió un informe truncado.");
        }
        if (typeof content !== "string" || !content.trim()) {
          throw new Error("El modelo local no devolvió un informe.");
        }

        const report = parseFinalReportResponse(content);
        this.update({ phase: "ready", progressText: null, error: null, failure: null });
        return formatFinalReport(report, repair);
      } catch (reason) {
        const isOutputError =
          reason instanceof Error &&
          (reason.message.startsWith("El modelo local devolvió") ||
            reason.message.startsWith("El modelo local no devolvió"));

        if (isOutputError) {
          this.update({ phase: "ready", progressText: null, error: null, failure: null });
          return safeFallback;
        }

        const failure = classifyLocalAIError(reason, this.snapshot.modelLabel);
        // Any execution failure discards the worker so a later explicit retry
        // starts from a clean engine instead of reusing a corrupted session.
        await this.unloadEngine();
        this.update({ phase: "error", progressText: null, error: failure.message, failure });
        return safeFallback;
      }
    } catch {
      // Compatibility and model-load errors are already reflected in the
      // runtime snapshot. A deterministic report remains available for review.
      return safeFallback;
    } finally {
      this.generationInProgress = false;
      releaseCompute();
    }
  }

  async generateKnowledgeProposals(
    evidence: KnowledgeProposalRepairEvidence[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<KnowledgeProposalCandidate[]> {
    if (evidence.length === 0) {
      throw new Error("No hay reparaciones entregadas con evidencia confirmada para revisar.");
    }
    if (this.generationInProgress) {
      throw new Error("Ya hay una generación local en curso.");
    }
    const releaseCompute = localComputeCoordinator.tryAcquire("local-ai");
    this.generationInProgress = true;
    const repairIds = evidence.map(({ repairId }) => repairId);
    const documentIds = knowledgeDocuments.map(({ id }) => id);

    try {
      const engine = await this.ensureReady(this.snapshot.modelId);
      this.update({
        phase: "generating",
        progress: 1,
        progressText: "Preparando candidatos documentales para revisión…",
        error: null,
        debugOutput: null,
      });

      try {
        const response = await engine.chat.completions.create({
          messages: [
            { role: "system", content: knowledgeProposalSystemPrompt },
            {
              role: "user",
              content: buildKnowledgeProposalRequestContent(
                evidence,
                knowledgeDocuments,
              ),
            },
          ],
          response_format: {
            type: "json_object",
            schema: JSON.stringify(
              createKnowledgeProposalJsonSchema(repairIds, documentIds),
            ),
          },
          temperature: 0,
          top_p: 1,
          max_tokens: 1_350,
          seed: 42,
        });
        const choice = response.choices[0];
        const content = choice?.message.content;
        this.captureDebugOutput(
          "knowledge-proposal",
          typeof content === "string" ? content : String(content ?? ""),
          choice?.finish_reason ?? null,
        );
        if (choice?.finish_reason === "length") {
          throw new Error(
            "El modelo local agotó el límite de respuesta. No se guardó ningún documento.",
          );
        }
        if (typeof content !== "string" || !content.trim()) {
          throw new Error("El modelo local no devolvió candidatos documentales.");
        }
        const candidates = parseKnowledgeProposalResponse(
          content,
          evidence,
          knowledgeDocuments,
        );
        this.update({ phase: "ready", progressText: null, error: null, failure: null });
        return candidates;
      } catch (reason) {
        const isOutputError =
          reason instanceof Error &&
          (reason.message.startsWith("El modelo local") ||
            reason.message.startsWith("Los candidatos") ||
            reason.message.startsWith("Un candidato"));
        const failure = isOutputError
          ? null
          : classifyLocalAIError(reason, this.snapshot.modelLabel);
        const message = isOutputError && reason instanceof Error
          ? reason.message
          : failure!.message;
        if (failure?.blocksAI) this.terminateEngine();
        this.update({ phase: "error", progressText: null, error: message, failure });
        throw new Error(message);
      }
    } finally {
      this.generationInProgress = false;
      releaseCompute();
    }
  }

  private async ensureReady(modelId: LocalAIModelId): Promise<MLCEngineInterface> {
    if (this.engine && this.loadedModelId === modelId) return this.engine;
    if (this.loadPromise) return this.loadPromise;

    if (this.engine || this.worker) await this.unloadEngine();
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
    if (
      (model.requiredFeatures as readonly string[]).includes("shader-f16") &&
      !compatibility.shaderF16
    ) {
      const failure: LocalAIFailure = {
        code: "MODEL_FEATURE_UNAVAILABLE",
        title: "La GPU no cumple los requisitos del modelo",
        message: `${model.label} requiere shader-f16 y esta GPU no lo ofrece. Elegí otro modelo para continuar usando IA local.`,
        blocksAI: false,
      };
      this.update({ phase: "error", error: failure.message, failure });
      throw new Error(failure.message);
    }

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
      this.terminateEngine();
      const existingFailure = this.snapshot.failure;
      const failure =
        existingFailure?.code === "MODEL_FEATURE_UNAVAILABLE"
          ? existingFailure
          : classifyLocalAIError(reason, model.label);
      this.update({
        phase: "error",
        progressText: null,
        error: failure.message,
        failure,
      });
      throw new Error(failure.message);
    }
  }

  private terminateEngine(): void {
    this.engine = null;
    this.loadedModelId = null;
    this.worker?.terminate();
    this.worker = null;
  }

  private async unloadEngine(): Promise<void> {
    const engine = this.engine;
    const worker = this.worker;
    this.engine = null;
    this.loadedModelId = null;
    this.worker = null;
    try {
      await engine?.unload();
    } catch {
      // Terminating the worker below still releases a lost or unhealthy device.
    } finally {
      worker?.terminate();
    }
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
