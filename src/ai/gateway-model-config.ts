export const gatewayAIModels = [
  {
    id: "alibaba/qwen3.7-flash",
    label: "Qwen 3.7 Flash",
    category: "basic",
    categoryLabel: "Menor costo",
    providerLabel: "Alibaba vía Vercel",
    contextWindowSize: 991_000,
    description: "La opción paga más económica del catálogo de texto, ideal para usar los créditos incluidos de AI Gateway.",
  },
  {
    id: "poolside/laguna-s-2.1-free",
    label: "Laguna S 2.1 Free",
    category: "basic",
    categoryLabel: "Gratis",
    providerLabel: "Poolside vía Vercel",
    contextWindowSize: 256_000,
    description: "Modelo de texto gratuito con contexto amplio, razonamiento opcional y buen seguimiento de JSON estructurado.",
  },
  {
    id: "zai/glm-4.6v-flash",
    label: "GLM-4.6V-Flash",
    category: "balanced",
    categoryLabel: "Gratis",
    providerLabel: "Z.AI vía Vercel",
    contextWindowSize: 128_000,
    description: "Modelo multimodal ligero de Z.AI, optimizado para baja latencia y los flujos estructurados de FixFlow.",
  },
] as const;

export type GatewayAIModelId = (typeof gatewayAIModels)[number]["id"];

export const DEFAULT_GATEWAY_AI_MODEL_ID: GatewayAIModelId =
  "alibaba/qwen3.7-flash";

export function isGatewayAIModelId(modelId: string): modelId is GatewayAIModelId {
  return gatewayAIModels.some((candidate) => candidate.id === modelId);
}

export function getGatewayAIModel(modelId: GatewayAIModelId) {
  const model = gatewayAIModels.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error(`Modelo de Vercel AI Gateway no configurado: ${modelId}`);
  return model;
}
