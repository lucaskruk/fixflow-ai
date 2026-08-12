import {
  DEFAULT_LOCAL_AI_MODEL_ID,
  isLocalAIModelId,
  type LocalAIModelId,
} from "./model-config";

export const LOCAL_AI_MODEL_STORAGE_KEY = "fixflow.local-ai.model-id";

export type ModelPreferenceStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): ModelPreferenceStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSelectedLocalAIModelId(
  storage: ModelPreferenceStorage | null = browserStorage(),
): LocalAIModelId {
  if (!storage) return DEFAULT_LOCAL_AI_MODEL_ID;
  try {
    const stored = storage.getItem(LOCAL_AI_MODEL_STORAGE_KEY);
    return stored && isLocalAIModelId(stored)
      ? stored
      : DEFAULT_LOCAL_AI_MODEL_ID;
  } catch {
    return DEFAULT_LOCAL_AI_MODEL_ID;
  }
}

export function persistSelectedLocalAIModelId(
  modelId: LocalAIModelId,
  storage: ModelPreferenceStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(LOCAL_AI_MODEL_STORAGE_KEY, modelId);
  } catch {
    // A blocked or full localStorage must not break manual repair workflows.
  }
}
