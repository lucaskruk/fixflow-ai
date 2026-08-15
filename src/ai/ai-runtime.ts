import type { WebGPUCompatibility } from "./webgpu";

export type AIProvider = "local" | "vercel-gateway";

export type AIPhase =
  | "checking"
  | "unsupported"
  | "idle"
  | "loading"
  | "ready"
  | "generating"
  | "error";

export type AIDebugOutput = {
  task: "repair-extraction" | "diagnostic-analysis" | "final-report" | "knowledge-proposal";
  modelId: string;
  finishReason: string | null;
  content: string;
  contentLength: number;
  capturedAt: string;
};

export type AIFailureCode =
  | "WEBGPU_UNAVAILABLE"
  | "GPU_ADAPTER_UNAVAILABLE"
  | "GPU_DEVICE_LOST"
  | "GPU_MEMORY_EXHAUSTED"
  | "MODEL_FEATURE_UNAVAILABLE"
  | "MODEL_EXECUTION_FAILED"
  | "GATEWAY_NOT_CONFIGURED"
  | "GATEWAY_UNAVAILABLE";

export type AIFailure = {
  code: AIFailureCode;
  title: string;
  message: string;
  blocksAI: boolean;
};

export type AIRuntimeSnapshot<ModelId extends string = string> = {
  provider: AIProvider;
  phase: AIPhase;
  progress: number;
  progressText: string | null;
  error: string | null;
  compatibility: WebGPUCompatibility | null;
  modelId: ModelId;
  modelLabel: string;
  downloadMB: number;
  vramMB: number;
  cached: boolean | null;
  failure: AIFailure | null;
  debugOutput: AIDebugOutput | null;
};
