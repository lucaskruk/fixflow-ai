export const LOCAL_AI_MODEL_ID =
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" as const;

export const LOCAL_AI_MODEL_LABEL = "Qwen 2.5 · 0.5B · 4-bit";
export const LOCAL_AI_MODEL_DOWNLOAD_MB = 290;
export const LOCAL_AI_MODEL_VRAM_MB = 945;

const nullableNonEmptyStringSchema = {
  type: ["string", "null"],
  minLength: 1,
} as const;

export const repairDraftJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    customerName: nullableNonEmptyStringSchema,
    brand: nullableNonEmptyStringSchema,
    model: nullableNonEmptyStringSchema,
    serialNumber: nullableNonEmptyStringSchema,
    reportedIssue: nullableNonEmptyStringSchema,
    accessories: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    status: {
      enum: [
        null,
        "RECEIVED",
        "DIAGNOSING",
        "REPAIRING",
        "READY",
        "DELIVERED",
      ],
    },
  },
  required: [
    "customerName",
    "brand",
    "model",
    "serialNumber",
    "reportedIssue",
    "accessories",
    "status",
  ],
} as const;

export const diagnosticAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    assessment: { type: "string", minLength: 1 },
    hypotheses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string", minLength: 1 },
          confidence: { enum: ["low", "medium", "high"] },
        },
        required: ["description", "confidence"],
      },
    },
    nextSteps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", minLength: 1 },
          reason: { type: "string", minLength: 1 },
        },
        required: ["action", "reason"],
      },
    },
    missingInformation: {
      type: "array",
      items: { type: "string", minLength: 1 },
    },
    sources: {
      type: "array",
      items: { type: "string", minLength: 1 },
      uniqueItems: true,
    },
  },
  required: [
    "assessment",
    "hypotheses",
    "nextSteps",
    "missingInformation",
    "sources",
  ],
} as const;

export function createDiagnosticAnalysisJsonSchema(
  retrievedSourceIds: readonly string[],
) {
  return {
    ...diagnosticAnalysisJsonSchema,
    properties: {
      ...diagnosticAnalysisJsonSchema.properties,
      sources: {
        type: "array",
        items: retrievedSourceIds.length > 0
          ? { type: "string", enum: [...retrievedSourceIds] }
          : { type: "string" },
        maxItems: retrievedSourceIds.length > 0 ? retrievedSourceIds.length : 0,
        uniqueItems: true,
      },
    },
  } as const;
}
