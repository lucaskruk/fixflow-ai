import { describe, expect, it } from "vitest";
import type { Repair, RepairEvent } from "../domain/schemas";
import {
  buildFinalReportRequestContent,
  canSaveOrExportFinalReport,
  createSafeFinalReportText,
  formatFinalReport,
  parseFinalReportResponse,
} from "./final-report";

const repair: Repair = {
  id: "REP-1042",
  customerName: "Ana Pérez",
  customerPhone: null,
  brand: "Lenovo",
  model: "ThinkPad T14",
  serialNumber: "PF-123",
  reportedIssue: "No enciende desde ayer.",
  accessories: ["Cargador"],
  status: "READY",
  diagnosis: "Conector de carga dañado.",
  solution: "Se reemplazó el conector de carga.",
  createdAt: "2026-08-10T10:00:00.000Z",
  updatedAt: "2026-08-12T10:00:00.000Z",
};

const eventBase = {
  repairId: repair.id,
  createdAt: "2026-08-12T09:00:00.000Z",
};

const events: RepairEvent[] = [
  { ...eventBase, id: "evt-1", type: "MEASUREMENT", content: "Entrada: 20.1 V." },
  { ...eventBase, id: "evt-2", type: "NOTE", content: "LED de carga apagado." },
  { ...eventBase, id: "evt-3", type: "DIAGNOSIS", content: "Jack con falso contacto confirmado." },
  { ...eventBase, id: "evt-4", type: "REPAIR", content: "Prueba de encendido correcta." },
  {
    ...eventBase,
    id: "evt-ai",
    type: "AI_SUGGESTION",
    content: "Cambiar la placa madre; hipótesis no confirmada.",
  },
];

describe("final report data boundary", () => {
  it("builds a minimal payload with technician evidence and excludes AI suggestions", () => {
    const payload = buildFinalReportRequestContent(repair, events);
    const parsed = JSON.parse(payload);

    expect(parsed.technicianRecords).toEqual({
      testsAndMeasurements: ["Entrada: 20.1 V."],
      observations: ["LED de carga apagado."],
      confirmedDiagnoses: ["Jack con falso contacto confirmado."],
      repairsPerformed: ["Prueba de encendido correcta."],
    });
    expect(payload).not.toContain("placa madre");
    expect(payload).not.toContain("AI_SUGGESTION");
  });

  it("parses fenced structured output and rejects incomplete output", () => {
    const report = parseFinalReportResponse(`\`\`\`json
      {
        "reportedSymptom": "No enciende desde ayer.",
        "testsAndMeasurements": ["Entrada: 20.1 V."],
        "observations": ["LED apagado."],
        "confirmedDiagnosis": ["Conector dañado."],
        "repairPerformed": ["Conector reemplazado."],
        "finalStatus": "Listo para entregar",
        "recommendations": ["Usar el cargador verificado."]
      }
    \`\`\``);

    expect(report.confirmedDiagnosis).toEqual(["Conector dañado."]);
    expect(() => parseFinalReportResponse('{"reportedSymptom":"No enciende"}')).toThrow(
      "formato inválido",
    );
  });

  it("creates a deterministic fallback with explicit empty sections and no AI content", () => {
    const report = createSafeFinalReportText(repair, events);

    expect(report).toContain("SÍNTOMA INFORMADO\nNo enciende desde ayer.");
    expect(report).toContain("DIAGNÓSTICO CONFIRMADO\n- Conector de carga dañado.");
    expect(report).toContain("ESTADO FINAL\nListo para entregar");
    expect(report).not.toContain("placa madre");
  });

  it("formats the structured sections without promoting recommendations to diagnosis", () => {
    const report = formatFinalReport({
      reportedSymptom: repair.reportedIssue,
      testsAndMeasurements: [],
      observations: [],
      confirmedDiagnosis: [],
      repairPerformed: [],
      finalStatus: "En diagnóstico",
      recommendations: ["Completar mediciones."],
    }, repair);

    expect(report).toContain("DIAGNÓSTICO CONFIRMADO\n- No hay un diagnóstico confirmado registrado.");
    expect(report).toContain("RECOMENDACIONES\n- Completar mediciones.");
  });
});

describe("mandatory report review", () => {
  it("blocks save/export until a non-empty draft is reviewed", () => {
    expect(canSaveOrExportFinalReport("Informe", false)).toBe(false);
    expect(canSaveOrExportFinalReport("   ", true)).toBe(false);
    expect(canSaveOrExportFinalReport("Informe revisado", true)).toBe(true);
  });
});
