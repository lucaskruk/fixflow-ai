import { describe, expect, it } from "vitest";
import {
  DEFAULT_GATEWAY_AI_MODEL_ID,
  gatewayAIModels,
  getGatewayAIModel,
  isGatewayAIModelId,
} from "./gateway-model-config";

describe("Vercel AI Gateway model catalog", () => {
  it("offers only GLM-4.6V-Flash", () => {
    expect(gatewayAIModels.map(({ id }) => id)).toEqual([
      "zai/glm-4.6v-flash",
    ]);
  });

  it("uses GLM-4.6V-Flash as the Gateway default", () => {
    expect(DEFAULT_GATEWAY_AI_MODEL_ID).toBe("zai/glm-4.6v-flash");
    expect(getGatewayAIModel(DEFAULT_GATEWAY_AI_MODEL_ID)).toMatchObject({
      label: "GLM-4.6V-Flash",
      providerLabel: "Z.AI vía Vercel",
      contextWindowSize: 128_000,
    });
  });

  it("rejects arbitrary model IDs", () => {
    expect(isGatewayAIModelId("zai/glm-4.6v-flash")).toBe(true);
    expect(isGatewayAIModelId("google/gemini-3-flash")).toBe(false);
  });
});
