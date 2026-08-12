import type {
  DiagnosticAnalysis,
  KnowledgeDocument,
  Repair,
  RepairDraft,
  RepairEvent,
} from "./schemas";

/**
 * Boundary for all browser-local model access.
 * Implementations are added in a later delivery; UI and persistence must not
 * import WebLLM directly.
 */
export interface LocalAIService {
  extractRepair(input: string): Promise<RepairDraft>;

  analyzeDiagnosis(
    repair: Repair,
    events: RepairEvent[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<DiagnosticAnalysis>;

  generateFinalReport(
    repair: Repair,
    events: RepairEvent[],
  ): Promise<string>;
}

