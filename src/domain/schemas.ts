import { z } from "zod";

const requiredText = z.string().trim().min(1);
const nullableText = requiredText.nullable();

export const repairStatuses = [
  "RECEIVED",
  "DIAGNOSING",
  "REPAIRING",
  "READY",
  "DELIVERED",
] as const;

export const repairEventTypes = [
  "NOTE",
  "MEASUREMENT",
  "AI_SUGGESTION",
  "DIAGNOSIS",
  "REPAIR",
] as const;

export const technicianRepairEventTypes = [
  "MEASUREMENT",
  "NOTE",
  "DIAGNOSIS",
  "REPAIR",
] as const;

export const confidenceLevels = ["low", "medium", "high"] as const;
export const knowledgeDocumentStatuses = ["draft", "published"] as const;
export const knowledgeProposalOperations = ["new", "update"] as const;

export const repairStatusSchema = z.enum(repairStatuses);
export const repairEventTypeSchema = z.enum(repairEventTypes);
export const technicianRepairEventTypeSchema = z.enum(technicianRepairEventTypes);
export const confidenceSchema = z.enum(confidenceLevels);
export const knowledgeDocumentStatusSchema = z.enum(knowledgeDocumentStatuses);
export const knowledgeProposalOperationSchema = z.enum(knowledgeProposalOperations);

export const repairDraftSchema = z
  .object({
    customerName: nullableText,
    brand: nullableText,
    model: nullableText,
    serialNumber: nullableText,
    reportedIssue: nullableText,
    accessories: z.array(requiredText),
    status: repairStatusSchema.nullable(),
  })
  .strict();

export const repairSchema = z.object({
  id: requiredText,
  customerName: requiredText,
  customerPhone: nullableText,
  brand: requiredText,
  model: requiredText,
  serialNumber: nullableText,
  reportedIssue: requiredText,
  accessories: z.array(requiredText),
  status: repairStatusSchema,
  diagnosis: nullableText,
  solution: nullableText,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const createRepairInputSchema = repairSchema.pick({
  customerName: true,
  customerPhone: true,
  brand: true,
  model: true,
  serialNumber: true,
  reportedIssue: true,
  accessories: true,
  status: true,
}).extend({
  customerPhone: nullableText.optional().default(null),
  serialNumber: nullableText.optional().default(null),
  accessories: z.array(requiredText).optional().default([]),
  status: repairStatusSchema.optional().default("RECEIVED"),
});

export const updateRepairInputSchema = repairSchema
  .pick({
    customerName: true,
    customerPhone: true,
    brand: true,
    model: true,
    serialNumber: true,
    reportedIssue: true,
    accessories: true,
    status: true,
    diagnosis: true,
    solution: true,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const repairEventSchema = z.object({
  id: requiredText,
  repairId: requiredText,
  type: repairEventTypeSchema,
  content: requiredText,
  createdAt: z.iso.datetime(),
});

export const createRepairEventInputSchema = repairEventSchema.pick({
  type: true,
  content: true,
});

export const createTechnicianRepairEventInputSchema = z.object({
  type: technicianRepairEventTypeSchema,
  content: requiredText,
}).strict();

export const createAISuggestionEventInputSchema = z.object({
  content: requiredText,
}).strict();

export const knowledgeDocumentSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use only lowercase letters, numbers and hyphens",
  ),
  title: requiredText,
  tags: z.array(requiredText).min(1),
  content: requiredText,
  sources: z.array(requiredText).min(1),
  status: knowledgeDocumentStatusSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
}).strict();

export const createKnowledgeDocumentInputSchema = knowledgeDocumentSchema.pick({
  id: true,
  title: true,
  tags: true,
  content: true,
  sources: true,
  status: true,
}).extend({
  status: knowledgeDocumentStatusSchema.optional().default("draft"),
}).strict();

export const updateKnowledgeDocumentInputSchema = knowledgeDocumentSchema
  .pick({
    title: true,
    tags: true,
    content: true,
    sources: true,
    status: true,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const listKnowledgeDocumentsInputSchema = z.object({
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().min(1).max(100).optional(),
  status: knowledgeDocumentStatusSchema.optional(),
}).strict();

export const knowledgeProposalCandidateSchema = z.object({
  operation: knowledgeProposalOperationSchema,
  targetDocumentId: z.string().trim().min(1).max(100).nullable(),
  id: z.string().trim().min(1).max(100).regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use only lowercase letters, numbers and hyphens",
  ),
  title: requiredText.max(180),
  tags: z.array(requiredText.max(100)).min(1).max(12),
  content: requiredText.max(6_000),
  sourceRepairIds: z.array(requiredText.max(100)).min(1).max(8),
}).strict().superRefine((candidate, context) => {
  if (candidate.operation === "new" && candidate.targetDocumentId !== null) {
    context.addIssue({
      code: "custom",
      path: ["targetDocumentId"],
      message: "A new document cannot have a target document",
    });
  }
  if (candidate.operation === "update" && candidate.targetDocumentId === null) {
    context.addIssue({
      code: "custom",
      path: ["targetDocumentId"],
      message: "An update requires a target document",
    });
  }
  if (
    candidate.operation === "update" &&
    candidate.targetDocumentId !== null &&
    candidate.id !== candidate.targetDocumentId
  ) {
    context.addIssue({
      code: "custom",
      path: ["id"],
      message: "An update must keep the target document ID",
    });
  }
});

export const knowledgeProposalResponseSchema = z.object({
  candidates: z.array(knowledgeProposalCandidateSchema).max(3),
}).strict();

export const diagnosticHypothesisSchema = z.object({
  description: requiredText,
  confidence: confidenceSchema,
}).strict();

export const diagnosticNextStepSchema = z.object({
  action: requiredText,
  reason: requiredText,
}).strict();

export const diagnosticAnalysisSchema = z.object({
  assessment: requiredText,
  hypotheses: z.array(diagnosticHypothesisSchema),
  nextSteps: z.array(diagnosticNextStepSchema),
  missingInformation: z.array(requiredText),
  sources: z.array(requiredText),
}).strict();

export const diagnosticAnalysisEventContentSchema = z.object({
  version: z.literal(1),
  kind: z.literal("DIAGNOSTIC_ANALYSIS"),
  analysis: diagnosticAnalysisSchema,
}).strict();

export type RepairStatus = z.infer<typeof repairStatusSchema>;
export type RepairEventType = z.infer<typeof repairEventTypeSchema>;
export type TechnicianRepairEventType = z.infer<
  typeof technicianRepairEventTypeSchema
>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type RepairDraft = z.infer<typeof repairDraftSchema>;
export type Repair = z.infer<typeof repairSchema>;
export type CreateRepairInput = z.infer<typeof createRepairInputSchema>;
export type UpdateRepairInput = z.infer<typeof updateRepairInputSchema>;
export type RepairEvent = z.infer<typeof repairEventSchema>;
export type CreateRepairEventInput = z.infer<
  typeof createRepairEventInputSchema
>;
export type CreateTechnicianRepairEventInput = z.infer<
  typeof createTechnicianRepairEventInputSchema
>;
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export type KnowledgeDocumentStatus = z.infer<
  typeof knowledgeDocumentStatusSchema
>;
export type CreateKnowledgeDocumentInput = z.infer<
  typeof createKnowledgeDocumentInputSchema
>;
export type UpdateKnowledgeDocumentInput = z.infer<
  typeof updateKnowledgeDocumentInputSchema
>;
export type ListKnowledgeDocumentsInput = z.infer<
  typeof listKnowledgeDocumentsInputSchema
>;
export type KnowledgeProposalOperation = z.infer<
  typeof knowledgeProposalOperationSchema
>;
export type KnowledgeProposalCandidate = z.infer<
  typeof knowledgeProposalCandidateSchema
>;
export type KnowledgeProposalResponse = z.infer<
  typeof knowledgeProposalResponseSchema
>;
export type KnowledgeProposalRepairEvidence = {
  repairId: string;
  brand: string;
  model: string;
  reportedIssue: string;
  notes: string[];
  measurements: string[];
  confirmedDiagnosisEvents: string[];
  confirmedRepairEvents: string[];
  confirmedRepairDiagnosis: string | null;
  confirmedRepairSolution: string | null;
};
export type DiagnosticAnalysis = z.infer<typeof diagnosticAnalysisSchema>;
export type DiagnosticAnalysisEventContent = z.infer<
  typeof diagnosticAnalysisEventContentSchema
>;
