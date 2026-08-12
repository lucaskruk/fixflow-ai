import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DIAGNOSTIC_LOCAL_AI_MODEL_ID,
  defaultLocalAIModel,
  localAIModels,
  createDiagnosticAnalysisJsonSchema,
} from "./model-config";

describe("local AI model catalog", () => {
  it("defaults to the low-resource model", () => {
    expect(DEFAULT_LOCAL_AI_MODEL_ID).toBe(
      "SmolLM2-360M-Instruct-q4f32_1-MLC",
    );
    expect(defaultLocalAIModel.vramMB).toBe(580);
    expect(defaultLocalAIModel.contextWindowSize).toBe(4096);
    expect(defaultLocalAIModel.requiredFeatures).toEqual([]);
  });

  it("uses Qwen for structured diagnosis and keeps both models selectable", () => {
    const qwen = localAIModels.find((model) => model.id.startsWith("Qwen2.5"));
    expect(qwen).toBeDefined();
    expect(DIAGNOSTIC_LOCAL_AI_MODEL_ID).toBe(qwen!.id);
    expect(qwen!.contextWindowSize).toBe(4096);
    expect(defaultLocalAIModel.vramMB).toBeLessThan(qwen!.vramMB);
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
