/// <reference lib="webworker" />

import {
  env,
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

// Transformers.js defaults to loading the ONNX WASM factory from jsDelivr.
// Clear that override so Vite's bundled, same-origin factory and WASM asset are
// used instead. Remote dynamic modules are intentionally blocked by our CSP.
if (env.backends.onnx.wasm) {
  delete env.backends.onnx.wasm.wasmPaths;
}

const MODEL_ID = "onnx-community/whisper-base";

type Request =
  | { id: number; type: "transcribe"; audio: Float32Array }
  | { id: number; type: "cancel" };

type ProgressInfo = {
  status?: string;
  progress?: number;
  loaded?: number;
  total?: number;
};

let transcriberPromise: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
let activeId: number | null = null;

function progressValue(info: ProgressInfo): number {
  if (typeof info.progress === "number") return Math.min(1, Math.max(0, info.progress / 100));
  if (info.loaded && info.total) return Math.min(1, info.loaded / info.total);
  return 0;
}

function getTranscriber(id: number): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!transcriberPromise) {
    const hasWebGPU = "gpu" in navigator;
    transcriberPromise = pipeline("automatic-speech-recognition", MODEL_ID, {
      device: hasWebGPU ? "webgpu" : "wasm",
      dtype: "q4",
      progress_callback: (info: ProgressInfo) => {
        if (activeId !== id) return;
        self.postMessage({
          id,
          type: "progress",
          progress: progressValue(info),
          text: info.status === "progress"
            ? "Descargando el modelo de voz…"
            : "Preparando el modelo de voz…",
        });
      },
    }).catch((reason) => {
      transcriberPromise = null;
      throw reason;
    });
  }
  return transcriberPromise;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const request = event.data;
  if (request.type === "cancel") {
    if (activeId === request.id) activeId = null;
    return;
  }

  activeId = request.id;
  try {
    const transcriber = await getTranscriber(request.id);
    if (activeId !== request.id) return;
    self.postMessage({ id: request.id, type: "ready" });
    const output = await transcriber(request.audio, {
      language: "spanish",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
    if (activeId !== request.id) return;
    const result = Array.isArray(output) ? output[0] : output;
    self.postMessage({ id: request.id, type: "result", text: result?.text?.trim() ?? "" });
  } catch (reason) {
    if (activeId !== request.id) return;
    self.postMessage({
      id: request.id,
      type: "error",
      message: reason instanceof Error ? reason.message : String(reason),
    });
  } finally {
    if (activeId === request.id) activeId = null;
  }
};

export {};
