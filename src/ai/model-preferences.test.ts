import { describe, expect, it } from "vitest";
import { DEFAULT_LOCAL_AI_MODEL_ID } from "./model-config";
import {
  LOCAL_AI_MODEL_STORAGE_KEY,
  loadSelectedLocalAIModelId,
  persistSelectedLocalAIModelId,
  type ModelPreferenceStorage,
} from "./model-preferences";

function createStorage(initial?: string): ModelPreferenceStorage & { value: string | null } {
  return {
    value: initial ?? null,
    getItem(key) {
      return key === LOCAL_AI_MODEL_STORAGE_KEY ? this.value : null;
    },
    setItem(key, value) {
      if (key === LOCAL_AI_MODEL_STORAGE_KEY) this.value = value;
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
    expect(() => persistSelectedLocalAIModelId(DEFAULT_LOCAL_AI_MODEL_ID, storage)).not.toThrow();
  });
});
