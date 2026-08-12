import { useSyncExternalStore } from "react";
import { WebLLMLocalAIService } from "./webllm-local-ai-service";

export const localAIService = new WebLLMLocalAIService();

export function useLocalAIStatus() {
  return useSyncExternalStore(
    localAIService.subscribe,
    localAIService.getSnapshot,
    localAIService.getSnapshot,
  );
}
