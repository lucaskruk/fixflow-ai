import { useSyncExternalStore } from "react";
import { localComputeCoordinator } from "../ai/local-compute-coordinator";

export type SpeechTranscriptionPhase =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "loading-model"
  | "transcribing"
  | "error";

export type SpeechTranscriptionSnapshot = Readonly<{
  phase: SpeechTranscriptionPhase;
  progress: number;
  progressText: string | null;
  error: string | null;
}>;

type WorkerResponse = {
  id: number;
  type: "progress" | "ready" | "result" | "error";
  progress?: number;
  text?: string;
  message?: string;
};

const IDLE: SpeechTranscriptionSnapshot = Object.freeze({
  phase: "idle",
  progress: 0,
  progressText: null,
  error: null,
});

export class SpeechTranscriptionService {
  private snapshot: SpeechTranscriptionSnapshot = IDLE;
  private listeners = new Set<() => void>();
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private worker: Worker | null = null;
  private operationId = 0;
  private releaseCompute: (() => void) | null = null;
  private pendingTranscriptionReject: ((reason: Error) => void) | null = null;
  private pendingTranscriptionCleanup: (() => void) | null = null;

  getSnapshot = (): SpeechTranscriptionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async startRecording(): Promise<void> {
    if (this.snapshot.phase !== "idle" && this.snapshot.phase !== "error") {
      throw new Error("Ya hay un dictado en curso.");
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      throw new Error("Este navegador no permite grabar audio desde el micrófono.");
    }

    this.releaseCompute = localComputeCoordinator.tryAcquire("speech-transcription");
    const operationId = ++this.operationId;
    this.update({ phase: "requesting-permission", progress: 0, progressText: null, error: null });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      if (operationId !== this.operationId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.chunks = [];
      this.recorder = new MediaRecorder(stream);
      this.recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      });
      this.recorder.start(250);
      this.update({ phase: "recording", progressText: null });
    } catch (reason) {
      if (operationId !== this.operationId) return;
      this.releaseResources();
      const message = microphoneError(reason);
      this.update({ phase: "error", error: message, progressText: null });
      throw new Error(message);
    }
  }

  async stopAndTranscribe(): Promise<string> {
    const recorder = this.recorder;
    if (!recorder || this.snapshot.phase !== "recording") {
      throw new Error("No hay una grabación activa para transcribir.");
    }
    const operationId = this.operationId;
    try {
      const blob = await stopRecorder(recorder, this.chunks);
      this.stopTracks();
      if (operationId !== this.operationId) throw new Error("El dictado fue cancelado.");
      this.update({
        phase: "loading-model",
        progress: 0,
        progressText: "Preparando el audio…",
        error: null,
      });
      const audio = await decodeToMono16k(blob);
      if (audio.length === 0) throw new Error("No se detectó audio para transcribir.");
      return await this.transcribe(operationId, audio);
    } catch (reason) {
      if (operationId !== this.operationId) throw reason;
      const message = reason instanceof Error ? reason.message : "No se pudo transcribir el audio.";
      this.update({ phase: "error", progressText: null, error: message });
      this.releaseResources();
      throw new Error(message);
    }
  }

  cancel(): void {
    const cancelledId = this.operationId;
    this.operationId += 1;
    const rejectPending = this.pendingTranscriptionReject;
    this.pendingTranscriptionCleanup?.();
    this.pendingTranscriptionCleanup = null;
    rejectPending?.(new Error("El dictado fue cancelado."));
    this.pendingTranscriptionReject = null;
    if (this.recorder?.state !== "inactive") this.recorder?.stop();
    this.worker?.postMessage({ id: cancelledId, type: "cancel" });
    this.worker?.terminate();
    this.worker = null;
    this.releaseResources();
    this.update(IDLE);
  }

  private transcribe(operationId: number, audio: Float32Array): Promise<string> {
    if (!this.worker) {
      this.worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), {
        type: "module",
        name: "fixflow-whisper",
      });
    }
    const worker = this.worker;

    return new Promise((resolve, reject) => {
      this.pendingTranscriptionReject = reject;
      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        const response = event.data;
        if (response.id !== operationId || operationId !== this.operationId) return;
        if (response.type === "progress") {
          this.update({
            phase: "loading-model",
            progress: response.progress ?? 0,
            progressText: response.text ?? "Preparando el modelo de voz…",
          });
          return;
        }
        if (response.type === "ready") {
          this.update({ phase: "transcribing", progress: 1, progressText: "Transcribiendo en español…" });
          return;
        }
        cleanup();
        if (response.type === "result") {
          const text = response.text?.trim() ?? "";
          if (!text) {
            const message = "No se detectó voz reconocible en la grabación.";
            this.update({ phase: "error", progressText: null, error: message });
            this.releaseResources();
            reject(new Error(message));
            return;
          }
          this.update(IDLE);
          this.releaseResources();
          resolve(text);
          return;
        }
        const message = response.message || "El modelo de voz no pudo completar la transcripción.";
        this.update({ phase: "error", progressText: null, error: message });
        this.releaseResources();
        reject(new Error(message));
      };
      const onError = () => {
        cleanup();
        const message = "El proceso local de transcripción se interrumpió.";
        this.worker?.terminate();
        this.worker = null;
        this.update({ phase: "error", progressText: null, error: message });
        this.releaseResources();
        reject(new Error(message));
      };
      const cleanup = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
        if (this.pendingTranscriptionCleanup === cleanup) {
          this.pendingTranscriptionCleanup = null;
          this.pendingTranscriptionReject = null;
        }
      };
      this.pendingTranscriptionCleanup = cleanup;
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ id: operationId, type: "transcribe", audio }, [audio.buffer]);
    });
  }

  private update(changes: Partial<SpeechTranscriptionSnapshot>): void {
    this.snapshot = Object.freeze({ ...this.snapshot, ...changes });
    this.listeners.forEach((listener) => listener());
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
  }

  private releaseResources(): void {
    this.stopTracks();
    this.chunks = [];
    this.releaseCompute?.();
    this.releaseCompute = null;
  }
}

function microphoneError(reason: unknown): string {
  if (reason instanceof DOMException && (reason.name === "NotAllowedError" || reason.name === "SecurityError")) {
    return "El navegador no tiene permiso para usar el micrófono.";
  }
  if (reason instanceof DOMException && reason.name === "NotFoundError") {
    return "No se encontró un micrófono disponible.";
  }
  return reason instanceof Error ? reason.message : "No se pudo iniciar el micrófono.";
}

function stopRecorder(recorder: MediaRecorder, chunks: Blob[]): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const mimeType = recorder.mimeType;
    const onStop = () => resolve(new Blob(chunks, mimeType ? { type: mimeType } : undefined));
    recorder.addEventListener("stop", onStop, { once: true });
    recorder.addEventListener("error", () => reject(new Error("La grabación de audio falló.")), { once: true });
    recorder.stop();
  });
}

async function decodeToMono16k(blob: Blob): Promise<Float32Array> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let index = 0; index < decoded.length; index += 1) {
        mono[index] = (mono[index] ?? 0) + (data[index] ?? 0) / decoded.numberOfChannels;
      }
    }
    if (decoded.sampleRate === 16_000) return mono;
    const outputLength = Math.round(mono.length * 16_000 / decoded.sampleRate);
    const output = new Float32Array(outputLength);
    const ratio = decoded.sampleRate / 16_000;
    for (let index = 0; index < outputLength; index += 1) {
      const position = index * ratio;
      const before = Math.floor(position);
      const after = Math.min(before + 1, mono.length - 1);
      const mix = position - before;
      output[index] = (mono[before] ?? 0) * (1 - mix) + (mono[after] ?? 0) * mix;
    }
    return output;
  } finally {
    await context.close();
  }
}

export const speechTranscriptionService = new SpeechTranscriptionService();

export function useSpeechTranscriptionStatus(): SpeechTranscriptionSnapshot {
  return useSyncExternalStore(
    speechTranscriptionService.subscribe,
    speechTranscriptionService.getSnapshot,
    speechTranscriptionService.getSnapshot,
  );
}
