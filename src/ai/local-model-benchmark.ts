import type { RepairDraft } from "../domain/schemas";
import { getLocalAIModel, type LocalAIModelId } from "./model-config";
import type {
  LocalAIDebugOutput,
  LocalAIRuntimeSnapshot,
} from "./webllm-local-ai-service";

export const LOCAL_MODEL_BENCHMARK_INPUT =
  "Cliente Ana Torres trae Lenovo ThinkPad T14, serie PF-12345. Informa que no enciende. Entrega cargador.";

export type LocalModelBenchmarkResult = {
  modelId: LocalAIModelId;
  modelLabel: string;
  startedAt: string;
  cachedBeforeRun: boolean | null;
  loadMs: number | null;
  firstCompletedResponseMs: number | null;
  totalMs: number;
  finishReason: string | null;
  strictJsonValid: boolean;
  schemaValid: boolean;
  knownCasePassed: boolean;
  knownCaseChecks: Record<string, boolean>;
  error: string | null;
  note: string;
};

export type LocalModelBenchmarkRuntime = {
  selectModel(modelId: LocalAIModelId): Promise<void>;
  isModelCached(modelId: LocalAIModelId): Promise<boolean>;
  loadSelectedModel(): Promise<void>;
  extractRepair(input: string): Promise<RepairDraft>;
  getSnapshot(): LocalAIRuntimeSnapshot;
};

type BenchmarkClock = {
  now(): number;
  isoNow(): string;
};

const browserClock: BenchmarkClock = {
  now: () => performance.now(),
  isoNow: () => new Date().toISOString(),
};

function roundMilliseconds(milliseconds: number): number {
  return Math.round(milliseconds * 10) / 10;
}

function strictJsonIsValid(output: LocalAIDebugOutput | null): boolean {
  if (!output?.content.trim()) return false;
  try {
    JSON.parse(output.content);
    return true;
  } catch {
    return false;
  }
}

export function evaluateKnownBenchmarkCase(
  draft: RepairDraft | null,
): Record<string, boolean> {
  return {
    customerName: draft?.customerName === "Ana Torres",
    brand: draft?.brand === "Lenovo",
    model: draft?.model === "ThinkPad T14",
    serialNumber: draft?.serialNumber === "PF-12345",
    reportedIssue: draft?.reportedIssue === "no enciende",
    accessories:
      draft?.accessories.length === 1 && draft.accessories[0] === "cargador",
    absentStatus: draft?.status === null,
  };
}

/**
 * Runs one real, opt-in browser benchmark against the selected WebLLM runtime.
 * Calling this function may download the requested model when it is not cached.
 */
export async function runLocalModelBenchmark(
  runtime: LocalModelBenchmarkRuntime,
  modelId: LocalAIModelId,
  clock: BenchmarkClock = browserClock,
): Promise<LocalModelBenchmarkResult> {
  const model = getLocalAIModel(modelId);
  const startedAt = clock.isoNow();
  const totalStarted = clock.now();
  const debugBeforeRun = runtime.getSnapshot().debugOutput;
  let cachedBeforeRun: boolean | null = null;
  let loadMs: number | null = null;
  let firstCompletedResponseMs: number | null = null;
  let draft: RepairDraft | null = null;
  let error: string | null = null;

  try {
    await runtime.selectModel(modelId);
    cachedBeforeRun = await runtime.isModelCached(modelId);

    const loadStarted = clock.now();
    await runtime.loadSelectedModel();
    loadMs = roundMilliseconds(clock.now() - loadStarted);

    const responseStarted = clock.now();
    draft = await runtime.extractRepair(LOCAL_MODEL_BENCHMARK_INPUT);
    firstCompletedResponseMs = roundMilliseconds(clock.now() - responseStarted);
  } catch (reason) {
    error = reason instanceof Error ? reason.message : String(reason);
  }

  const debugAfterRun = runtime.getSnapshot().debugOutput;
  const debugOutput = debugAfterRun !== debugBeforeRun ? debugAfterRun : null;
  const knownCaseChecks = evaluateKnownBenchmarkCase(draft);
  return {
    modelId,
    modelLabel: model.label,
    startedAt,
    cachedBeforeRun,
    loadMs,
    firstCompletedResponseMs,
    totalMs: roundMilliseconds(clock.now() - totalStarted),
    finishReason: debugOutput?.finishReason ?? null,
    strictJsonValid: strictJsonIsValid(debugOutput),
    schemaValid: draft !== null,
    knownCasePassed: Object.values(knownCaseChecks).every(Boolean),
    knownCaseChecks,
    error,
    note:
      "firstCompletedResponseMs mide la respuesta completa del flujo no streaming; no representa tiempo al primer token.",
  };
}
