import { useSyncExternalStore } from "react";
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
import type { AIRuntimeSnapshot } from "./ai-runtime";
import {
  DEFAULT_GATEWAY_AI_MODEL_ID,
  isGatewayAIModelId,
} from "./gateway-model-config";
import { GatewayAIService } from "./gateway-ai-service";
import { isLocalAIModelId, type LocalAIModelId } from "./model-config";
import {
  loadSelectedAIModelId,
  loadSelectedLocalAIModelId,
  persistSelectedAIModelId,
  type AIModelId,
} from "./model-preferences";
import type { WebGPUCompatibility } from "./webgpu";
import { WebLLMLocalAIService } from "./webllm-local-ai-service";

class AIServiceManager implements LocalAIService {
  private readonly localService: WebLLMLocalAIService;
  private readonly gatewayService: GatewayAIService;
  private selectedModelId: AIModelId;
  private listeners = new Set<() => void>();

  constructor() {
    this.selectedModelId = loadSelectedAIModelId();
    this.localService = new WebLLMLocalAIService(
      isLocalAIModelId(this.selectedModelId)
        ? this.selectedModelId
        : loadSelectedLocalAIModelId(),
    );
    this.gatewayService = new GatewayAIService(
      isGatewayAIModelId(this.selectedModelId)
        ? this.selectedModelId
        : DEFAULT_GATEWAY_AI_MODEL_ID,
    );
    this.localService.subscribe(() => this.notifyIfActive("local"));
    this.gatewayService.subscribe(() => this.notifyIfActive("vercel-gateway"));
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): AIRuntimeSnapshot<AIModelId> =>
    isGatewayAIModelId(this.selectedModelId)
      ? this.gatewayService.getSnapshot()
      : this.localService.getSnapshot();

  getLocalService(): WebLLMLocalAIService {
    return this.localService;
  }

  async probeCompatibility(): Promise<WebGPUCompatibility | null> {
    return isGatewayAIModelId(this.selectedModelId)
      ? null
      : this.localService.probeCompatibility();
  }

  async selectModel(modelId: AIModelId): Promise<void> {
    if (isLocalAIModelId(modelId)) {
      await this.localService.selectModel(modelId);
    } else {
      this.gatewayService.selectModel(modelId);
    }
    this.selectedModelId = modelId;
    persistSelectedAIModelId(modelId);
    this.notify();
  }

  loadSelectedModel(): Promise<void> {
    return isLocalAIModelId(this.selectedModelId)
      ? this.localService.loadSelectedModel()
      : Promise.resolve();
  }

  isModelCached(modelId: LocalAIModelId): Promise<boolean> {
    return this.localService.isModelCached(modelId);
  }

  clearModelCache(modelId: LocalAIModelId): Promise<void> {
    return this.localService.clearModelCache(modelId);
  }

  extractRepair(input: string): Promise<RepairDraft> {
    return this.activeService().extractRepair(input);
  }

  analyzeDiagnosis(
    repair: Repair,
    events: RepairEvent[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<DiagnosticAnalysis> {
    return this.activeService().analyzeDiagnosis(repair, events, knowledgeDocuments);
  }

  generateFinalReport(repair: Repair, events: RepairEvent[]): Promise<string> {
    return this.activeService().generateFinalReport(repair, events);
  }

  generateKnowledgeProposals(
    evidence: KnowledgeProposalRepairEvidence[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<KnowledgeProposalCandidate[]> {
    return this.activeService().generateKnowledgeProposals(evidence, knowledgeDocuments);
  }

  private activeService(): LocalAIService {
    return isGatewayAIModelId(this.selectedModelId)
      ? this.gatewayService
      : this.localService;
  }

  private notifyIfActive(provider: AIRuntimeSnapshot["provider"]): void {
    if (this.getSnapshot().provider === provider) this.notify();
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const aiService = new AIServiceManager();
export const localModelAIService = aiService.getLocalService();
// Kept as an alias so existing feature modules do not need a flag-day rename.
export const localAIService = aiService;

export function useAIStatus() {
  return useSyncExternalStore(
    aiService.subscribe,
    aiService.getSnapshot,
    aiService.getSnapshot,
  );
}

export function useLocalAIStatus() {
  return useAIStatus();
}
