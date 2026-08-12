export const localAIModels = [
  {
    id: "SmolLM2-360M-Instruct-q4f32_1-MLC",
    label: "SmolLM2 · 360M · bajo consumo",
    downloadMB: 207,
    vramMB: 580,
    contextWindowSize: 4096,
    requiredFeatures: [],
  },
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 · 0.5B · mayor calidad",
    downloadMB: 290,
    vramMB: 945,
    contextWindowSize: 4096,
    requiredFeatures: [],
  },
] as const;

export type LocalAIModelId = (typeof localAIModels)[number]["id"];

export const DEFAULT_LOCAL_AI_MODEL_ID: LocalAIModelId =
  "SmolLM2-360M-Instruct-q4f32_1-MLC";
export const DIAGNOSTIC_LOCAL_AI_MODEL_ID: LocalAIModelId =
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

export function getLocalAIModel(modelId: LocalAIModelId) {
  const model = localAIModels.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error(`Modelo local no configurado: ${modelId}`);
  return model;
}

export const defaultLocalAIModel = getLocalAIModel(DEFAULT_LOCAL_AI_MODEL_ID);

// Aliases kept at the service boundary. A future Settings page can select a
// different entry from localAIModels without changing the model integration.
export const LOCAL_AI_MODEL_ID = defaultLocalAIModel.id;
export const LOCAL_AI_MODEL_LABEL = defaultLocalAIModel.label;
export const LOCAL_AI_MODEL_DOWNLOAD_MB = defaultLocalAIModel.downloadMB;
export const LOCAL_AI_MODEL_VRAM_MB = defaultLocalAIModel.vramMB;
export const LOCAL_AI_CONTEXT_WINDOW_SIZE =
  defaultLocalAIModel.contextWindowSize;

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
    assessment: { type: "string", minLength: 1, maxLength: 400 },
    hypotheses: {
      type: "array",
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          description: { type: "string", minLength: 1, maxLength: 240 },
          confidence: { enum: ["low", "medium", "high"] },
        },
        required: ["description", "confidence"],
      },
    },
    nextSteps: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", minLength: 1, maxLength: 180 },
          reason: { type: "string", minLength: 1, maxLength: 240 },
        },
        required: ["action", "reason"],
      },
    },
    missingInformation: {
      type: "array",
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 180 },
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
        minItems: retrievedSourceIds.length > 0 ? 1 : 0,
        maxItems: retrievedSourceIds.length > 0 ? retrievedSourceIds.length : 0,
        uniqueItems: true,
      },
    },
  } as const;
}
