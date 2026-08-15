export const gatewayAIModels = [
  {
    id: "openai/gpt-5.4-nano",
    label: "GPT 5.4 Nano",
    category: "basic",
    categoryLabel: "Económico",
    providerLabel: "OpenAI vía Vercel",
    contextWindowSize: 400_000,
    description: "Optimizado para extracción y tareas breves con bajo costo.",
  },
  {
    id: "openai/gpt-5.6-luna",
    label: "GPT 5.6 Luna",
    category: "balanced",
    categoryLabel: "Preview",
    providerLabel: "OpenAI vía Vercel",
    contextWindowSize: 1_050_000,
    description: "Modelo rápido y económico de la familia GPT 5.6, con buena capacidad para los flujos estructurados de FixFlow.",
  },
  {
    id: "google/gemini-3-flash",
    label: "Gemini 3 Flash",
    category: "balanced",
    categoryLabel: "Equilibrado",
    providerLabel: "Google vía Vercel",
    contextWindowSize: 1_000_000,
    description: "Buena relación entre velocidad, calidad y costo para el uso diario.",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    category: "advanced",
    categoryLabel: "Avanzado",
    providerLabel: "Anthropic vía Vercel",
    contextWindowSize: 1_000_000,
    description: "Mayor capacidad para análisis técnicos y redacción compleja.",
  },
] as const;

export type GatewayAIModelId = (typeof gatewayAIModels)[number]["id"];

export const DEFAULT_GATEWAY_AI_MODEL_ID: GatewayAIModelId =
  "google/gemini-3-flash";

export function isGatewayAIModelId(modelId: string): modelId is GatewayAIModelId {
  return gatewayAIModels.some((candidate) => candidate.id === modelId);
}

export function getGatewayAIModel(modelId: GatewayAIModelId) {
  const model = gatewayAIModels.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error(`Modelo de Vercel AI Gateway no configurado: ${modelId}`);
  return model;
}
