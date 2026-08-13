export const localAIModels = [
  {
    id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 · 0.5B",
    category: "basic",
    categoryLabel: "Básico",
    downloadMB: 290,
    vramMB: 945,
    contextWindowSize: 4096,
    requiredFeatures: [],
    minimumHardware: "WebGPU estable y cerca de 1 GB de memoria disponible para el modelo.",
    recommendedHardware: "GPU integrada moderna o Apple Silicon con memoria holgada; cerrar otras cargas gráficas.",
    validation: "Validado en MacBook Pro M4. Puede fallar en Vega 11 con 2 GB de VRAM.",
  },
  {
    id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 · 1.5B",
    category: "balanced",
    categoryLabel: "Equilibrado",
    downloadMB: 880,
    vramMB: 1630,
    contextWindowSize: 4096,
    requiredFeatures: [],
    minimumHardware: "WebGPU estable y al menos 2 GB de memoria disponible para el modelo.",
    recommendedHardware: "Apple Silicon o GPU con 4 GB o más de memoria disponible.",
    validation: "Pendiente de validación física en el hardware objetivo.",
  },
  {
    id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    label: "Qwen 2.5 · 3B",
    category: "advanced",
    categoryLabel: "Avanzado",
    downloadMB: 1750,
    vramMB: 2505,
    contextWindowSize: 4096,
    requiredFeatures: [],
    minimumHardware: "WebGPU estable y al menos 3 GB de memoria disponible para el modelo.",
    recommendedHardware: "Apple Silicon reciente o GPU con 6 GB o más de memoria disponible.",
    validation: "Pendiente de validación física en el hardware objetivo.",
  },
] as const;

export type LocalAIModelId = (typeof localAIModels)[number]["id"];

export const DEFAULT_LOCAL_AI_MODEL_ID: LocalAIModelId =
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

export function isLocalAIModelId(modelId: string): modelId is LocalAIModelId {
  return localAIModels.some((candidate) => candidate.id === modelId);
}

export function getLocalAIModel(modelId: LocalAIModelId) {
  const model = localAIModels.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error(`Modelo local no configurado: ${modelId}`);
  return model;
}

export const defaultLocalAIModel = getLocalAIModel(DEFAULT_LOCAL_AI_MODEL_ID);

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

export function createKnowledgeProposalJsonSchema(
  repairIds: readonly string[],
  documentIds: readonly string[],
) {
  const targetDocumentId = documentIds.length > 0
    ? { enum: [null, ...documentIds] }
    : { type: "null" };

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            operation: { enum: ["new", "update"] },
            targetDocumentId,
            // XGrammar currently ignores pattern and string-length keywords.
            // Runtime Zod validation below remains authoritative for them.
            id: { type: "string" },
            title: { type: "string" },
            tags: {
              type: "array",
              minItems: 1,
              maxItems: 12,
              uniqueItems: true,
              items: { type: "string" },
            },
            content: { type: "string" },
            sourceRepairIds: {
              type: "array",
              minItems: 1,
              maxItems: Math.max(1, repairIds.length),
              uniqueItems: true,
              items: { type: "string", enum: [...repairIds] },
            },
          },
          required: [
            "operation",
            "targetDocumentId",
            "id",
            "title",
            "tags",
            "content",
            "sourceRepairIds",
          ],
        },
      },
    },
    required: ["candidates"],
  } as const;
}
