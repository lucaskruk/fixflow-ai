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
  const engines: Array<{
    unload: ReturnType<typeof vi.fn>;
    chat: { completions: { create: ReturnType<typeof vi.fn> } };
  }> = [];

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

  it("generates the final report with the selected WebLLM model", async () => {
    const completion = vi.fn().mockResolvedValue({
      choices: [{
        finish_reason: "stop",
        message: { content: JSON.stringify({
          reportedSymptom: "No enciende.",
          testsAndMeasurements: ["Entrada de 20 V."],
          observations: [],
          confirmedDiagnosis: ["Jack dañado."],
          repairPerformed: ["Jack reemplazado."],
          finalStatus: "Listo para entregar",
          recommendations: ["Usar el cargador probado."],
        }) },
      }],
    });
    webllmMocks.createEngine.mockImplementationOnce(async () => {
      const engine = {
        unload: vi.fn().mockResolvedValue(undefined),
        chat: { completions: { create: completion } },
      };
      engines.push(engine);
      return engine;
    });
    const service = new WebLLMLocalAIService();
    const report = await service.generateFinalReport({
      id: "REP-1",
      customerName: "Ana",
      customerPhone: null,
      brand: "Lenovo",
      model: "T14",
      serialNumber: null,
      reportedIssue: "No enciende.",
      accessories: [],
      status: "READY",
      diagnosis: "Jack dañado.",
      solution: "Jack reemplazado.",
      createdAt: "2026-08-10T10:00:00.000Z",
      updatedAt: "2026-08-12T10:00:00.000Z",
    }, [{
      id: "evt-ai",
      repairId: "REP-1",
      type: "AI_SUGGESTION",
      content: "Placa madre defectuosa.",
      createdAt: "2026-08-12T09:00:00.000Z",
    }]);

    expect(report).toContain("DIAGNÓSTICO CONFIRMADO\n- Jack dañado.");
    expect(webllmMocks.createEngine).toHaveBeenCalledWith(
      expect.anything(),
      "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
      expect.anything(),
      expect.anything(),
    );
    const request = completion.mock.calls[0]![0];
    expect(request.messages[1].content).not.toContain("Placa madre defectuosa");
    expect(request.response_format.schema).toContain("confirmedDiagnosis");
  });

  it("falls back to a deterministic report when model output is invalid", async () => {
    webllmMocks.createEngine.mockImplementationOnce(async () => {
      const engine = {
        unload: vi.fn().mockResolvedValue(undefined),
        chat: { completions: { create: vi.fn().mockResolvedValue({
          choices: [{ finish_reason: "stop", message: { content: "not-json" } }],
        }) } },
      };
      engines.push(engine);
      return engine;
    });
    const service = new WebLLMLocalAIService();
    const report = await service.generateFinalReport({
      id: "REP-2",
      customerName: "Luis",
      customerPhone: null,
      brand: "Dell",
      model: "Latitude",
      serialNumber: null,
      reportedIssue: "Se apaga.",
      accessories: [],
      status: "DIAGNOSING",
      diagnosis: null,
      solution: null,
      createdAt: "2026-08-10T10:00:00.000Z",
      updatedAt: "2026-08-12T10:00:00.000Z",
    }, []);

    expect(report).toContain("SÍNTOMA INFORMADO\nSe apaga.");
    expect(report).toContain("No hay un diagnóstico confirmado registrado.");
    expect(service.getSnapshot().phase).toBe("ready");
  });
});
