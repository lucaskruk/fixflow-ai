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

export const confidenceLevels = ["low", "medium", "high"] as const;

export const repairStatusSchema = z.enum(repairStatuses);
export const repairEventTypeSchema = z.enum(repairEventTypes);
export const confidenceSchema = z.enum(confidenceLevels);

export const repairDraftSchema = z.object({
  customerName: nullableText,
  brand: nullableText,
  model: nullableText,
  serialNumber: nullableText,
  reportedIssue: nullableText,
  accessories: z.array(requiredText),
  status: repairStatusSchema.nullable(),
});

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

export const knowledgeDocumentSchema = z.object({
  id: requiredText,
  title: requiredText,
  tags: z.array(requiredText).min(1),
  content: requiredText,
});

export const diagnosticHypothesisSchema = z.object({
  description: requiredText,
  confidence: confidenceSchema,
});

export const diagnosticNextStepSchema = z.object({
  action: requiredText,
  reason: requiredText,
});

export const diagnosticAnalysisSchema = z.object({
  assessment: requiredText,
  hypotheses: z.array(diagnosticHypothesisSchema),
  nextSteps: z.array(diagnosticNextStepSchema),
  missingInformation: z.array(requiredText),
  sources: z.array(requiredText),
});

export type RepairStatus = z.infer<typeof repairStatusSchema>;
export type RepairEventType = z.infer<typeof repairEventTypeSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type RepairDraft = z.infer<typeof repairDraftSchema>;
export type Repair = z.infer<typeof repairSchema>;
export type CreateRepairInput = z.infer<typeof createRepairInputSchema>;
export type RepairEvent = z.infer<typeof repairEventSchema>;
export type CreateRepairEventInput = z.infer<
  typeof createRepairEventInputSchema
>;
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export type DiagnosticAnalysis = z.infer<typeof diagnosticAnalysisSchema>;

