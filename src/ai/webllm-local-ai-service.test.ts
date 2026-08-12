import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WebLLMLocalAIService } from "./webllm-local-ai-service";

const webllmMocks = vi.hoisted(() => ({
  createEngine: vi.fn(),
  hasModelInCache: vi.fn(),
  deleteModelAllInfoInCache: vi.fn(),
}));

vi.mock("@mlc-ai/web-llm", () => ({
  prebuiltAppConfig: { model_list: [] },
  CreateWebWorkerMLCEngine: webllmMocks.createEngine,
  hasModelInCache: webllmMocks.hasModelInCache,
  deleteModelAllInfoInCache: webllmMocks.deleteModelAllInfoInCache,
}));

describe("WebLLM engine selection", () => {
  const workers: Array<{ terminate: ReturnType<typeof vi.fn> }> = [];
  const engines: Array<{ unload: ReturnType<typeof vi.fn> }> = [];

  beforeEach(() => {
    workers.length = 0;
    engines.length = 0;
    webllmMocks.createEngine.mockReset();
    webllmMocks.hasModelInCache.mockReset().mockResolvedValue(false);
    webllmMocks.deleteModelAllInfoInCache.mockReset().mockResolvedValue(undefined);
    webllmMocks.createEngine.mockImplementation(async () => {
      const engine = {
        unload: vi.fn().mockResolvedValue(undefined),
        chat: { completions: { create: vi.fn() } },
      };
      engines.push(engine);
      return engine;
    });
    vi.stubGlobal("navigator", {
      gpu: {
        requestAdapter: vi.fn(async () => ({
          features: { has: () => false },
          info: { vendor: "Test GPU" },
        })),
      },
    });
    vi.stubGlobal("Worker", class {
      terminate = vi.fn();

      constructor() {
        workers.push(this);
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("unloads the old engine and waits for an explicit load after selection", async () => {
    const service = new WebLLMLocalAIService();
    await service.loadSelectedModel();

    await service.selectModel("Qwen2.5-1.5B-Instruct-q4f16_1-MLC");

    expect(engines[0]!.unload).toHaveBeenCalledOnce();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(webllmMocks.createEngine).toHaveBeenCalledTimes(1);
    expect(service.getSnapshot()).toMatchObject({
      phase: "idle",
      modelId: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
      cached: null,
    });

    await service.loadSelectedModel();

    expect(webllmMocks.createEngine).toHaveBeenCalledTimes(2);
    expect(webllmMocks.createEngine.mock.calls[1]![1]).toBe(
      "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",
    );
  });

  it("requires an explicit cache deletion and releases a loaded model first", async () => {
    const service = new WebLLMLocalAIService();
    await service.loadSelectedModel();

    await service.clearModelCache("Qwen2.5-0.5B-Instruct-q4f16_1-MLC");

    expect(engines[0]!.unload).toHaveBeenCalledOnce();
    expect(workers[0]!.terminate).toHaveBeenCalledOnce();
    expect(webllmMocks.deleteModelAllInfoInCache).toHaveBeenCalledWith(
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
      expect.objectContaining({ cacheBackend: "cache" }),
    );
    expect(service.getSnapshot().cached).toBe(false);
  });
});
