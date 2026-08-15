import type { LocalAIService } from "../domain/local-ai-service";
import type {
  DiagnosticAnalysis,
  KnowledgeDocument,
  KnowledgeProposalCandidate,
  KnowledgeProposalRepairEvidence,
  Repair,
  RepairDraft,
  RepairEvent,
} from "../domain/schemas";
import { generateWithGateway } from "../api/ai";
import { ApiError } from "../api/repairs";
import type { AIDebugOutput, AIFailure, AIRuntimeSnapshot } from "./ai-runtime";
import {
  getGatewayAIModel,
  type GatewayAIModelId,
} from "./gateway-model-config";
import type {
  GatewayGenerationRequest,
  GatewayGenerationResponse,
} from "./gateway-contract";
import {
  parseDiagnosticAnalysisResponse,
  parseRepairDraftResponse,
} from "./webllm-local-ai-service";
import {
  createSafeFinalReportText,
  formatFinalReport,
  parseFinalReportResponse,
} from "./final-report";
import { parseKnowledgeProposalResponse } from "./knowledge-proposals";

export type GatewayAIRuntimeSnapshot = AIRuntimeSnapshot<GatewayAIModelId>;
type GatewayGenerator = (
  request: GatewayGenerationRequest,
) => Promise<GatewayGenerationResponse>;

function gatewayFailure(reason: unknown): AIFailure | null {
  if (reason instanceof ApiError && reason.code === "GATEWAY_NOT_CONFIGURED") {
    return {
      code: "GATEWAY_NOT_CONFIGURED",
      title: "Vercel AI Gateway todavía no está configurado",
      message: "Falta cargar AI_GATEWAY_API_KEY como secreto del Worker. Podés elegir un modelo local mientras tanto.",
      blocksAI: true,
    };
  }
  if (reason instanceof ApiError && reason.code === "GATEWAY_AUTH_FAILED") {
    return {
      code: "GATEWAY_AUTH_FAILED",
      title: "Vercel rechazó la clave del Gateway",
      message: reason.message,
      blocksAI: true,
    };
  }
  if (reason instanceof ApiError && reason.code === "GATEWAY_ACCESS_DENIED") {
    return {
      code: "GATEWAY_ACCESS_DENIED",
      title: "Vercel AI Gateway rechazó el acceso",
      message: reason.message,
      blocksAI: true,
    };
  }
  if (reason instanceof ApiError && reason.code === "GATEWAY_MODEL_NOT_FOUND") {
    return {
      code: "MODEL_FEATURE_UNAVAILABLE",
      title: "El modelo remoto no está disponible",
      message: reason.message,
      blocksAI: false,
    };
  }
  if (reason instanceof ApiError && [
    "NETWORK_ERROR",
    "GATEWAY_UNAVAILABLE",
    "GATEWAY_REQUEST_FAILED",
    "GATEWAY_RATE_LIMITED",
  ].includes(reason.code)) {
    return {
      code: "GATEWAY_UNAVAILABLE",
      title: "Vercel AI Gateway no está disponible",
      message: reason.message,
      blocksAI: false,
    };
  }
  return null;
}

export class GatewayAIService implements LocalAIService {
  private listeners = new Set<() => void>();
  private generationInProgress = false;
  private snapshot: GatewayAIRuntimeSnapshot;

  constructor(
    modelId: GatewayAIModelId,
    private readonly generate: GatewayGenerator = generateWithGateway,
  ) {
    const model = getGatewayAIModel(modelId);
    this.snapshot = {
      provider: "vercel-gateway",
      phase: "idle",
      progress: 0,
      progressText: null,
      error: null,
      compatibility: null,
      modelId: model.id,
      modelLabel: model.label,
      downloadMB: 0,
      vramMB: 0,
      cached: null,
      failure: null,
      debugOutput: null,
    };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): GatewayAIRuntimeSnapshot => this.snapshot;

  selectModel(modelId: GatewayAIModelId): void {
    if (this.generationInProgress) {
      throw new Error("Esperá a que termine la operación de IA antes de cambiar el modelo.");
    }
    const model = getGatewayAIModel(modelId);
    this.update({
      phase: "idle",
      modelId: model.id,
      modelLabel: model.label,
      error: null,
      failure: null,
      debugOutput: null,
    });
  }

  async extractRepair(input: string): Promise<RepairDraft> {
    const cleanInput = input.trim();
    if (!cleanInput) throw new Error("Escribí una descripción antes de procesar.");
    const result = await this.run({
      task: "repair-extraction",
      modelId: this.snapshot.modelId,
      input: cleanInput,
    }, "Extrayendo datos con Vercel AI Gateway…");
    return parseRepairDraftResponse(result.content);
  }

  async analyzeDiagnosis(
    repair: Repair,
    events: RepairEvent[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<DiagnosticAnalysis> {
    const documents = knowledgeDocuments.slice(0, 3);
    const result = await this.run({
      task: "diagnostic-analysis",
      modelId: this.snapshot.modelId,
      repair,
      events,
      knowledgeDocuments: documents,
    }, "Analizando evidencia con Vercel AI Gateway…");
    return parseDiagnosticAnalysisResponse(
      result.content,
      documents.map(({ id }) => id),
    );
  }

  async generateFinalReport(repair: Repair, events: RepairEvent[]): Promise<string> {
    const safeFallback = createSafeFinalReportText(repair, events);
    try {
      const result = await this.run({
        task: "final-report",
        modelId: this.snapshot.modelId,
        repair,
        events,
      }, "Preparando el informe con Vercel AI Gateway…");
      return formatFinalReport(parseFinalReportResponse(result.content), repair);
    } catch {
      return safeFallback;
    }
  }

  async generateKnowledgeProposals(
    evidence: KnowledgeProposalRepairEvidence[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<KnowledgeProposalCandidate[]> {
    if (evidence.length === 0) {
      throw new Error("No hay reparaciones entregadas con evidencia confirmada para revisar.");
    }
    const documents = knowledgeDocuments.slice(0, 8);
    const result = await this.run({
      task: "knowledge-proposal",
      modelId: this.snapshot.modelId,
      evidence: evidence.slice(0, 8),
      knowledgeDocuments: documents,
    }, "Preparando candidatos con Vercel AI Gateway…");
    return parseKnowledgeProposalResponse(result.content, evidence, documents);
  }

  private async run(
    request: GatewayGenerationRequest,
    progressText: string,
  ): Promise<GatewayGenerationResponse> {
    if (this.generationInProgress) {
      throw new Error("Ya hay una generación de IA en curso.");
    }
    this.generationInProgress = true;
    this.update({
      phase: "generating",
      progress: 1,
      progressText,
      error: null,
      failure: null,
      debugOutput: null,
    });
    try {
      const response = await this.generate(request);
      this.captureDebugOutput(request.task, response);
      if (response.finishReason === "length") {
        throw new Error("El modelo remoto agotó el límite de respuesta. Volvé a intentar.");
      }
      this.update({ phase: "ready", progressText: null, error: null, failure: null });
      return response;
    } catch (reason) {
      const failure = gatewayFailure(reason);
      const message = failure?.message ?? (
        reason instanceof Error ? reason.message : "Vercel AI Gateway no pudo completar la solicitud."
      );
      this.update({ phase: "error", progressText: null, error: message, failure });
      throw new Error(message);
    } finally {
      this.generationInProgress = false;
    }
  }

  private captureDebugOutput(
    task: AIDebugOutput["task"],
    response: GatewayGenerationResponse,
  ): void {
    if (!import.meta.env.DEV) return;
    this.update({
      debugOutput: {
        task,
        modelId: response.modelId,
        finishReason: response.finishReason,
        content: response.content,
        contentLength: response.content.length,
        capturedAt: new Date().toISOString(),
      },
    });
  }

  private update(changes: Partial<GatewayAIRuntimeSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...changes };
    this.listeners.forEach((listener) => listener());
  }
}
