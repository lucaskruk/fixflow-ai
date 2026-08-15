import { z } from "zod";
import {
  knowledgeDocumentSchema,
  repairEventSchema,
  repairSchema,
} from "../domain/schemas";
import {
  gatewayAIModels,
  type GatewayAIModelId,
} from "./gateway-model-config";

const gatewayModelIdSchema = z.string().refine(
  (value): value is GatewayAIModelId =>
    gatewayAIModels.some((model) => model.id === value),
  "Gateway model is not allowed",
);

const evidenceText = z.string().max(1_000);
const knowledgeProposalEvidenceSchema = z.object({
  repairId: z.string().min(1).max(100),
  brand: evidenceText,
  model: evidenceText,
  reportedIssue: evidenceText,
  notes: z.array(evidenceText).max(8),
  measurements: z.array(evidenceText).max(8),
  confirmedDiagnosisEvents: z.array(evidenceText).max(8),
  confirmedRepairEvents: z.array(evidenceText).max(8),
  confirmedRepairDiagnosis: evidenceText.nullable(),
  confirmedRepairSolution: evidenceText.nullable(),
});

export const gatewayGenerationRequestSchema = z.discriminatedUnion("task", [
  z.object({
    task: z.literal("repair-extraction"),
    modelId: gatewayModelIdSchema,
    input: z.string().trim().min(1).max(20_000),
  }),
  z.object({
    task: z.literal("diagnostic-analysis"),
    modelId: gatewayModelIdSchema,
    repair: repairSchema,
    events: z.array(repairEventSchema).max(200),
    knowledgeDocuments: z.array(knowledgeDocumentSchema).max(3),
  }),
  z.object({
    task: z.literal("final-report"),
    modelId: gatewayModelIdSchema,
    repair: repairSchema,
    events: z.array(repairEventSchema).max(200),
  }),
  z.object({
    task: z.literal("knowledge-proposal"),
    modelId: gatewayModelIdSchema,
    evidence: z.array(knowledgeProposalEvidenceSchema).min(1).max(8),
    knowledgeDocuments: z.array(knowledgeDocumentSchema).max(8),
  }),
]);

export type GatewayGenerationRequest = z.infer<
  typeof gatewayGenerationRequestSchema
>;

export const gatewayGenerationResponseSchema = z.object({
  data: z.object({
    modelId: gatewayModelIdSchema,
    content: z.string().min(1),
    finishReason: z.string().nullable(),
  }),
});

export type GatewayGenerationResponse = z.infer<
  typeof gatewayGenerationResponseSchema
>["data"];
