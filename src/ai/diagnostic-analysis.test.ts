import { describe, expect, it } from "vitest";
import type { DiagnosticAnalysis, KnowledgeDocument, Repair } from "../domain/schemas";
import {
  parseDiagnosticAnalysisEvent,
  serializeDiagnosticAnalysis,
} from "./diagnostic-analysis";
import {
  buildDiagnosisRequestContent,
  classifyLocalAIError,
  parseDiagnosticAnalysisResponse,
} from "./webllm-local-ai-service";

const analysis: DiagnosticAnalysis = {
  assessment: "Hay entrada y 3VALW, pero no se registró 5VALW.",
  hypotheses: [
    { description: "El canal de 5VALW está inhibido o en protección.", confidence: "medium" },
  ],
  nextSteps: [
    { action: "Medir resistencia a tierra en 5VALW.", reason: "Diferencia un corto de una falta de habilitación." },
  ],
  missingInformation: ["Señal de enable del canal de 5VALW"],
  sources: ["kb-standby-rails"],
};

const repair: Repair = {
  id: "FF-TEST",
  customerName: "Ana",
  customerPhone: null,
  brand: "Lenovo",
  model: "IdeaPad",
  serialNumber: null,
  reportedIssue: "No enciende",
  accessories: [],
  status: "DIAGNOSING",
  diagnosis: null,
  solution: null,
  createdAt: "2026-08-12T10:00:00.000Z",
  updatedAt: "2026-08-12T10:00:00.000Z",
};

const documents: KnowledgeDocument[] = ["one", "two", "three", "four"].map((id) => ({
  id,
  title: `Documento ${id}`,
  tags: [id],
  content: `Contenido ${id}`,
}));

describe("diagnostic analysis model boundary", () => {
  it("validates the complete structured model output", () => {
    expect(parseDiagnosticAnalysisResponse(
      JSON.stringify(analysis),
      ["kb-standby-rails"],
    )).toEqual(analysis);
  });

  it("accepts valid JSON wrapped by a small model in a Markdown fence", () => {
    expect(parseDiagnosticAnalysisResponse(
      `\`\`\`json\n${JSON.stringify(analysis)}\n\`\`\``,
      ["kb-standby-rails"],
    )).toEqual(analysis);
  });

  it("accepts a valid object surrounded by explanatory text", () => {
    expect(parseDiagnosticAnalysisResponse(
      `Resultado local:\n${JSON.stringify(analysis)}\nFin.`,
      ["kb-standby-rails"],
    )).toEqual(analysis);
  });

  it("rejects source ids outside the retrieved documents", () => {
    expect(() => parseDiagnosticAnalysisResponse(
      JSON.stringify({ ...analysis, sources: ["kb-invented"] }),
      ["kb-standby-rails"],
    )).toThrow("fuente que no fue recuperada");
  });

  it("rejects an empty citation list when retrieval found documents", () => {
    expect(() => parseDiagnosticAnalysisResponse(
      JSON.stringify({ ...analysis, sources: [] }),
      ["kb-standby-rails"],
    )).toThrow("no citó la documentación recuperada");
  });

  it("rejects malformed or extra output fields", () => {
    expect(() => parseDiagnosticAnalysisResponse(
      JSON.stringify({ ...analysis, diagnosis: "Convertidor dañado" }),
      ["kb-standby-rails"],
    )).toThrow("formato esperado");
  });

  it("sends only repair, events and at most three retrieved documents", () => {
    const payload = JSON.parse(buildDiagnosisRequestContent(repair, [], documents)) as Record<string, unknown>;
    expect(Object.keys(payload)).toEqual(["repair", "events", "knowledgeDocuments"]);
    expect(payload.knowledgeDocuments).toEqual(documents.slice(0, 3));
  });
});

describe("AI suggestion event representation", () => {
  it("round-trips structured analysis without creating diagnosis content", () => {
    const content = serializeDiagnosticAnalysis(analysis);
    expect(parseDiagnosticAnalysisEvent(content)).toEqual(analysis);
    expect(JSON.parse(content)).not.toHaveProperty("diagnosis");
  });

  it("keeps legacy plain AI suggestions readable", () => {
    expect(parseDiagnosticAnalysisEvent("Hipótesis antigua en texto plano.")).toBeNull();
  });
});

describe("local AI runtime errors", () => {
  it("turns a D3D12 device hang into a blocking user-facing failure", () => {
    const failure = classifyLocalAIError(
      new Error("DXGI_ERROR_DEVICE_HUNG: Device was lost"),
      "Modelo de prueba",
    );

    expect(failure).toMatchObject({
      code: "GPU_DEVICE_LOST",
      blocksAI: true,
    });
    expect(failure.message).toContain("Modelo de prueba");
    expect(failure.message).toContain("reiniciá Chrome");
  });

  it("keeps an unknown execution error retryable", () => {
    expect(classifyLocalAIError(new Error("unexpected failure"))).toMatchObject({
      code: "MODEL_EXECUTION_FAILED",
      blocksAI: false,
    });
  });
});
