import { useId, useRef, useState } from "react";
import {
  speechTranscriptionService,
  useSpeechTranscriptionStatus,
} from "../speech/speech-transcription";

type SpeechInputControlProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  describedBy?: string;
};

export function appendTranscription(value: string, transcription: string): string {
  const cleanTranscription = transcription.trim();
  if (!cleanTranscription) return value;
  if (!value) return cleanTranscription;
  if (/\s$/u.test(value)) return `${value}${cleanTranscription}`;

  const separator = value.includes("\n") ? "\n" : " ";
  return `${value}${separator}${cleanTranscription}`;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === "string") return reason;
  return "No se pudo completar el dictado.";
}

export function SpeechInputControl({
  value,
  onChange,
  disabled = false,
  describedBy,
}: SpeechInputControlProps) {
  const status = useSpeechTranscriptionStatus();
  const statusId = useId();
  const errorId = useId();
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const operationRef = useRef(0);
  const [pendingAction, setPendingAction] = useState<"start" | "stop" | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  valueRef.current = value;
  onChangeRef.current = onChange;

  const active =
    status.phase === "requesting-permission" ||
    status.phase === "recording" ||
    status.phase === "loading-model" ||
    status.phase === "transcribing";
  const processing = status.phase === "loading-model" || status.phase === "transcribing";
  const displayedError = localError ?? (status.phase === "error" && status.error
    ? errorMessage(status.error)
    : null);
  const describedByIds = [describedBy, statusId, displayedError ? errorId : null]
    .filter(Boolean)
    .join(" ");
  const progress = Math.min(1, Math.max(0, Number.isFinite(status.progress) ? status.progress : 0));
  const progressPercent = Math.round(progress * 100);

  let statusText = "Dictado listo.";
  if (status.phase === "requesting-permission") {
    statusText = "Solicitando permiso para usar el micrófono…";
  } else if (status.phase === "recording") {
    statusText = "Grabando audio. Presioná Detener para transcribir.";
  } else if (status.phase === "loading-model") {
    statusText = status.progressText || "Preparando el modelo de transcripción…";
  } else if (status.phase === "transcribing") {
    statusText = status.progressText || "Transcribiendo audio…";
  } else if (status.phase === "error") {
    statusText = "El dictado no pudo completarse. Podés volver a intentarlo.";
  }

  async function startRecording() {
    if (disabled || active || pendingAction) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setPendingAction("start");
    setLocalError(null);
    try {
      await speechTranscriptionService.startRecording();
    } catch (reason) {
      if (operationRef.current === operation) setLocalError(errorMessage(reason));
    } finally {
      if (operationRef.current === operation) setPendingAction(null);
    }
  }

  async function stopAndTranscribe() {
    if (status.phase !== "recording" || pendingAction) return;
    const operation = operationRef.current + 1;
    operationRef.current = operation;
    setPendingAction("stop");
    setLocalError(null);
    try {
      const transcription = await speechTranscriptionService.stopAndTranscribe();
      if (operationRef.current !== operation) return;
      const nextValue = appendTranscription(valueRef.current, transcription);
      if (nextValue !== valueRef.current) onChangeRef.current(nextValue);
    } catch (reason) {
      if (operationRef.current === operation) setLocalError(errorMessage(reason));
    } finally {
      if (operationRef.current === operation) setPendingAction(null);
    }
  }

  function cancel() {
    operationRef.current += 1;
    setPendingAction(null);
    setLocalError(null);
    try {
      speechTranscriptionService.cancel();
    } catch (reason) {
      setLocalError(errorMessage(reason));
    }
  }

  return (
    <div className={`speech-input-control speech-input-control--${status.phase}`}>
      <div className="speech-input-control__actions">
        {status.phase === "recording" ? (
          <button
            className="button button--compact speech-input-control__stop"
            type="button"
            onClick={stopAndTranscribe}
            disabled={pendingAction === "stop"}
            aria-describedby={describedByIds}
          >
            <span aria-hidden="true">■</span>
            {pendingAction === "stop" ? "Deteniendo…" : "Detener"}
          </button>
        ) : (
          <button
            className="button button--secondary button--compact speech-input-control__start"
            type="button"
            onClick={startRecording}
            disabled={disabled || active || pendingAction !== null}
            aria-describedby={describedByIds}
          >
            <span aria-hidden="true">●</span>
            {status.phase === "requesting-permission" || pendingAction === "start"
              ? "Solicitando permiso…"
              : processing
                ? "Transcribiendo…"
                : "Dictar"}
          </button>
        )}

        {active && (
          <button
            className="button button--ghost button--compact speech-input-control__cancel"
            type="button"
            onClick={cancel}
            aria-describedby={describedByIds}
          >
            <span aria-hidden="true">×</span>
            Cancelar
          </button>
        )}
      </div>

      <div className="speech-input-control__feedback" aria-live="polite" aria-atomic="true">
        <span id={statusId}>{statusText}</span>
        {processing && (
          <div className="speech-input-control__progress">
            <div
              className="speech-input-control__progress-track"
              role="progressbar"
              aria-label="Progreso de la transcripción"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
            >
              <span style={{ width: `${progressPercent}%` }} />
            </div>
            <strong>{progressPercent}%</strong>
          </div>
        )}
      </div>

      {displayedError && (
        <p className="speech-input-control__error" id={errorId} role="alert">
          {displayedError}
        </p>
      )}
    </div>
  );
}
