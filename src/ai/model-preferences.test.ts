import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_AI_MODEL_ID } from "./model-config";
import {
  AI_MODEL_STORAGE_KEY,
  LOCAL_AI_MODEL_STORAGE_KEY,
  loadSelectedAIModelId,
  loadSelectedLocalAIModelId,
  persistSelectedAIModelId,
  persistSelectedLocalAIModelId,
  type ModelPreferenceStorage,
} from "./model-preferences";

function createStorage(initial?: string): ModelPreferenceStorage & { values: Map<string, string> } {
  return {
    values: new Map(initial ? [[LOCAL_AI_MODEL_STORAGE_KEY, initial]] : []),
    getItem(key) {
      return this.values.get(key) ?? null;
    },
    setItem(key, value) {
      this.values.set(key, value);
    },
  };
}

describe("local AI model preference", () => {
  it("persists and restores a valid selection", () => {
    const storage = createStorage();
    const selected = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

    persistSelectedLocalAIModelId(selected, storage);

    expect(loadSelectedLocalAIModelId(storage)).toBe(selected);
  });

  it("falls back safely when a removed or unknown model was stored", () => {
    const storage = createStorage("SmolLM2-360M-Instruct-q4f32_1-MLC");

    expect(loadSelectedLocalAIModelId(storage)).toBe(DEFAULT_LOCAL_AI_MODEL_ID);
  });

  it("persists and restores a Vercel AI Gateway model", () => {
    const storage = createStorage();
    const selected = "zai/glm-4.6v-flash";

    persistSelectedAIModelId(selected, storage);

    expect(storage.getItem(AI_MODEL_STORAGE_KEY)).toBe(selected);
    expect(loadSelectedAIModelId(storage)).toBe(selected);
  });

  it("migrates a removed Gateway selection to Qwen 3.7 Flash", () => {
    const storage = createStorage();
    storage.values.set(AI_MODEL_STORAGE_KEY, "google/gemini-3-flash");

    expect(loadSelectedAIModelId(storage)).toBe("alibaba/qwen3.7-flash");
  });

  it("uses Qwen 3.7 Flash when there is no saved preference", () => {
    expect(loadSelectedAIModelId(createStorage())).toBe("alibaba/qwen3.7-flash");
  });

  it("keeps the previous local preference as the migration fallback", () => {
    const storage = createStorage("Qwen2.5-1.5B-Instruct-q4f16_1-MLC");

    expect(loadSelectedAIModelId(storage)).toBe(
      "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    );
  });

  it("does not let storage failures break the default selection", () => {
    const storage: ModelPreferenceStorage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };

    expect(loadSelectedLocalAIModelId(storage)).toBe(DEFAULT_LOCAL_AI_MODEL_ID);
    expect(loadSelectedAIModelId(storage)).toBe("alibaba/qwen3.7-flash");
    expect(() => persistSelectedLocalAIModelId(DEFAULT_LOCAL_AI_MODEL_ID, storage)).not.toThrow();
  });
});
