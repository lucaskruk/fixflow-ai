export const gatewayAIModels = [
  {
    id: "zai/glm-4.6v-flash",
    label: "GLM-4.6V-Flash",
    category: "balanced",
    categoryLabel: "Rápido",
    providerLabel: "Z.AI vía Vercel",
    contextWindowSize: 128_000,
    description: "Modelo multimodal ligero de Z.AI, optimizado para baja latencia y los flujos estructurados de FixFlow.",
  },
] as const;

export type GatewayAIModelId = (typeof gatewayAIModels)[number]["id"];

export const DEFAULT_GATEWAY_AI_MODEL_ID: GatewayAIModelId =
  "zai/glm-4.6v-flash";

export function isGatewayAIModelId(modelId: string): modelId is GatewayAIModelId {
  return gatewayAIModels.some((candidate) => candidate.id === modelId);
}

export function getGatewayAIModel(modelId: GatewayAIModelId) {
  const model = gatewayAIModels.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error(`Modelo de Vercel AI Gateway no configurado: ${modelId}`);
  return model;
}
