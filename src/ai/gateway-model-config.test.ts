import { describe, expect, it } from "vitest";
import {
  DEFAULT_GATEWAY_AI_MODEL_ID,
  gatewayAIModels,
  getGatewayAIModel,
  isGatewayAIModelId,
} from "./gateway-model-config";

describe("Vercel AI Gateway model catalog", () => {
  it("offers the validated low-cost Gateway models", () => {
    expect(gatewayAIModels.map(({ id }) => id)).toEqual([
      "alibaba/qwen3.7-flash",
      "poolside/laguna-s-2.1-free",
      "zai/glm-4.6v-flash",
    ]);
  });

  it("uses Qwen 3.7 Flash as the Gateway default", () => {
    expect(DEFAULT_GATEWAY_AI_MODEL_ID).toBe("alibaba/qwen3.7-flash");
    expect(getGatewayAIModel(DEFAULT_GATEWAY_AI_MODEL_ID)).toMatchObject({
      label: "Qwen 3.7 Flash",
      providerLabel: "Alibaba vía Vercel",
      contextWindowSize: 991_000,
    });
  });

  it("rejects arbitrary model IDs", () => {
    expect(isGatewayAIModelId("alibaba/qwen3.7-flash")).toBe(true);
    expect(isGatewayAIModelId("poolside/laguna-s-2.1-free")).toBe(true);
    expect(isGatewayAIModelId("zai/glm-4.6v-flash")).toBe(true);
    expect(isGatewayAIModelId("google/gemini-3-flash")).toBe(false);
  });
});
