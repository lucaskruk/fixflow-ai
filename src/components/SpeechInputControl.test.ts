import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../speech/speech-transcription", () => ({
  speechTranscriptionService: {
    startRecording: async () => undefined,
    stopAndTranscribe: async () => "",
    cancel: () => undefined,
  },
  useSpeechTranscriptionStatus: () => ({
    phase: "idle",
    progress: 0,
    progressText: null,
    error: null,
  }),
}));

import { appendTranscription, SpeechInputControl } from "./SpeechInputControl";

describe("appendTranscription", () => {
  it("uses the transcription as the initial value and trims model padding", () => {
    expect(appendTranscription("", "  La notebook no enciende.  ")).toBe(
      "La notebook no enciende.",
    );
  });

  it("appends without replacing existing text", () => {
    expect(appendTranscription("Ingresó con cargador.", "No muestra imagen.")).toBe(
      "Ingresó con cargador. No muestra imagen.",
    );
  });

  it("preserves existing trailing whitespace", () => {
    expect(appendTranscription("Síntoma:\n", "No enciende")).toBe("Síntoma:\nNo enciende");
  });

  it("starts a new line when extending multiline notes", () => {
    expect(appendTranscription("Ingreso\nSin cargador", "Equipo golpeado")).toBe(
      "Ingreso\nSin cargador\nEquipo golpeado",
    );
  });

  it("ignores an empty transcription", () => {
    expect(appendTranscription("Texto existente", "   ")).toBe("Texto existente");
  });
});

describe("SpeechInputControl", () => {
  it("renders an accessible Spanish dictation action and status", () => {
    const markup = renderToStaticMarkup(createElement(SpeechInputControl, {
      value: "",
      onChange: vi.fn(),
      describedBy: "field-help",
    }));

    expect(markup).toContain(">Dictar</button>");
    expect(markup).toContain('aria-live="polite"');
    expect(markup).toContain("Dictado listo.");
    expect(markup).toContain("field-help");
  });
});
