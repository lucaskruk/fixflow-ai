import { localModelAIService } from "./local-ai";
import {
  isLocalAIModelId,
  localAIModels,
  type LocalAIModelId,
} from "./model-config";
import {
  runLocalModelBenchmark,
  type LocalModelBenchmarkResult,
} from "./local-model-benchmark";

type FixFlowBenchmarkConsole = {
  models: readonly LocalAIModelId[];
  run(modelId: string): Promise<LocalModelBenchmarkResult>;
};

declare global {
  interface Window {
    fixflowBenchmark?: FixFlowBenchmarkConsole;
  }
}

export function installLocalModelBenchmarkConsole(): void {
  window.fixflowBenchmark = {
    models: localAIModels.map((model) => model.id),
    async run(modelId: string) {
      if (!isLocalAIModelId(modelId)) {
        throw new Error(
          `Modelo no válido. Opciones: ${localAIModels.map((model) => model.id).join(", ")}`,
        );
      }

      console.warn(
        `[FixFlow benchmark] La prueba explícita puede descargar ${modelId} si no está en caché.`,
      );
      const result = await runLocalModelBenchmark(localModelAIService, modelId);
      console.table(result);
      return result;
    },
  };

  console.info(
    "Benchmark local disponible en window.fixflowBenchmark. No se descargó ningún modelo.",
  );
}
