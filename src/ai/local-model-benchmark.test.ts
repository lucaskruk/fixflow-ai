import { describe, expect, it, vi } from "vitest";
import type { RepairDraft } from "../domain/schemas";
import {
  evaluateKnownBenchmarkCase,
  runLocalModelBenchmark,
  type LocalModelBenchmarkRuntime,
} from "./local-model-benchmark";

const modelId = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" as const;

function validDraft(): RepairDraft {
  return {
    customerName: "Ana Torres",
    brand: "Lenovo",
    model: "ThinkPad T14",
    serialNumber: "PF-12345",
    reportedIssue: "no enciende",
    accessories: ["cargador"],
    status: null,
  };
}

function runtime(overrides: Partial<LocalModelBenchmarkRuntime> = {}): LocalModelBenchmarkRuntime {
  const completedSnapshot = {
    debugOutput: {
      task: "repair-extraction",
      modelId,
      finishReason: "stop",
      content: JSON.stringify(validDraft()),
      contentLength: 1,
      capturedAt: "2026-08-12T00:00:00.000Z",
    },
  };
  return {
    selectModel: vi.fn().mockResolvedValue(undefined),
    isModelCached: vi.fn().mockResolvedValue(true),
    loadSelectedModel: vi.fn().mockResolvedValue(undefined),
    extractRepair: vi.fn().mockResolvedValue(validDraft()),
    getSnapshot: vi.fn()
      .mockReturnValueOnce({ debugOutput: null })
      .mockReturnValue(completedSnapshot),
    ...overrides,
  } as LocalModelBenchmarkRuntime;
}

describe("local model benchmark", () => {
  it("checks the known extraction case without accepting partial matches", () => {
    expect(Object.values(evaluateKnownBenchmarkCase(validDraft())).every(Boolean)).toBe(true);
    expect(
      evaluateKnownBenchmarkCase({ ...validDraft(), serialNumber: "invented" }).serialNumber,
    ).toBe(false);
  });

  it("reports load, completed-response, JSON, schema and known-case results", async () => {
    const times = [0, 10, 35, 40, 90, 100];
    const result = await runLocalModelBenchmark(runtime(), modelId, {
      now: () => times.shift() ?? 100,
      isoNow: () => "2026-08-12T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      modelId,
      cachedBeforeRun: true,
      loadMs: 25,
      firstCompletedResponseMs: 50,
      totalMs: 100,
      finishReason: "stop",
      strictJsonValid: true,
      schemaValid: true,
      knownCasePassed: true,
      error: null,
    });
  });

  it("returns diagnostic evidence when generation fails", async () => {
    const failedSnapshot = {
      debugOutput: {
        task: "repair-extraction",
        modelId,
        finishReason: "length",
        content: "{broken",
        contentLength: 7,
        capturedAt: "2026-08-12T00:00:00.000Z",
      },
    };
    const failedRuntime = runtime({
      extractRepair: vi.fn().mockRejectedValue(new Error("respuesta truncada")),
      getSnapshot: vi.fn()
        .mockReturnValueOnce({ debugOutput: null })
        .mockReturnValue(failedSnapshot),
    });
    const result = await runLocalModelBenchmark(failedRuntime, modelId, {
      now: () => 0,
      isoNow: () => "2026-08-12T00:00:00.000Z",
    });

    expect(result).toMatchObject({
      finishReason: "length",
      strictJsonValid: false,
      schemaValid: false,
      knownCasePassed: false,
      error: "respuesta truncada",
    });
  });
});
