import type {
  DiagnosticAnalysis,
  KnowledgeDocument,
  KnowledgeProposalCandidate,
  KnowledgeProposalRepairEvidence,
  Repair,
  RepairDraft,
  RepairEvent,
} from "./schemas";

/**
 * Boundary for all browser-local model access.
 * UI and persistence must not import WebLLM directly. Browser runtime details
 * remain behind implementations of this contract.
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

  generateKnowledgeProposals(
    evidence: KnowledgeProposalRepairEvidence[],
    knowledgeDocuments: KnowledgeDocument[],
  ): Promise<KnowledgeProposalCandidate[]>;
}
