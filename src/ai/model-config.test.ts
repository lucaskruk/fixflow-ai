import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  defaultLocalAIModel,
  localAIModels,
  createDiagnosticAnalysisJsonSchema,
} from "./model-config";

describe("local AI model catalog", () => {
  it("defaults to Qwen 2.5 0.5B as the minimum compatible model", () => {
    expect(DEFAULT_LOCAL_AI_MODEL_ID).toBe(
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
    );
    expect(defaultLocalAIModel.vramMB).toBe(945);
    expect(defaultLocalAIModel.contextWindowSize).toBe(4096);
    expect(defaultLocalAIModel.requiredFeatures).toEqual([]);
  });

  it("offers only the officially precompiled Qwen tiers", () => {
    expect(localAIModels.map((model) => model.id)).toEqual([
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
      "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      "Qwen2.5-3B-Instruct-q4f16_1-MLC",
    ]);
    expect(localAIModels.some((model) => model.id.includes("SmolLM"))).toBe(false);
    expect(localAIModels.map((model) => model.category)).toEqual([
      "basic",
      "balanced",
      "advanced",
    ]);
    expect(localAIModels.every((model) => model.contextWindowSize === 4096)).toBe(true);
    expect(localAIModels.every((model) => model.requiredFeatures.length === 0)).toBe(true);
  });

  it("requires a citation when retrieval supplied documents", () => {
    const withSources = createDiagnosticAnalysisJsonSchema(["kb-one", "kb-two"]);
    const withoutSources = createDiagnosticAnalysisJsonSchema([]);

    expect(withSources.properties.sources).toMatchObject({
      minItems: 1,
      maxItems: 2,
    });
    expect(withoutSources.properties.sources).toMatchObject({
      minItems: 0,
      maxItems: 0,
    });
  });
});
