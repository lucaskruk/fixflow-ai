import { describe, expect, it } from "vitest";
import {
  DEFAULT_GATEWAY_AI_MODEL_ID,
  gatewayAIModels,
  getGatewayAIModel,
  isGatewayAIModelId,
} from "./gateway-model-config";

describe("Vercel AI Gateway model catalog", () => {
  it("offers curated models from three providers", () => {
    expect(gatewayAIModels.map(({ id }) => id)).toEqual([
      "openai/gpt-5.4-nano",
      "openai/gpt-5.6-luna",
      "google/gemini-3-flash",
      "anthropic/claude-sonnet-4.6",
    ]);
    expect(new Set(gatewayAIModels.map(({ providerLabel }) => providerLabel)).size).toBe(3);
  });

  it("uses the balanced remote model as the Gateway default", () => {
    expect(DEFAULT_GATEWAY_AI_MODEL_ID).toBe("google/gemini-3-flash");
    expect(getGatewayAIModel(DEFAULT_GATEWAY_AI_MODEL_ID).category).toBe("balanced");
  });

  it("includes GPT 5.6 Luna as an additional preview option", () => {
    expect(getGatewayAIModel("openai/gpt-5.6-luna")).toMatchObject({
      label: "GPT 5.6 Luna",
      categoryLabel: "Preview",
      contextWindowSize: 1_050_000,
    });
  });

  it("rejects arbitrary model IDs", () => {
    expect(isGatewayAIModelId("google/gemini-3-flash")).toBe(true);
    expect(isGatewayAIModelId("openai/an-unlisted-model")).toBe(false);
  });
});
