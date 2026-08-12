import { describe, expect, it } from "vitest";
import {
  diagnosticAnalysisSchema,
  repairDraftSchema,
  repairSchema,
} from "./schemas";

describe("repairDraftSchema", () => {
  it("preserves unknown extracted fields as null", () => {
    const draft = repairDraftSchema.parse({
      customerName: "Martín",
      brand: "Lenovo",
      model: "IdeaPad 3",
      serialNumber: null,
      reportedIssue: "No enciende",
      accessories: ["Cargador"],
      status: null,
    });

    expect(draft.serialNumber).toBeNull();
    expect(draft.status).toBeNull();
  });

  it("rejects invented enum values", () => {
    const result = repairDraftSchema.safeParse({
      customerName: null,
      brand: null,
      model: null,
      serialNumber: null,
      reportedIssue: null,
      accessories: [],
      status: "PENDING",
    });

    expect(result.success).toBe(false);
  });
});

describe("repairSchema", () => {
  it("requires the fields needed to persist a repair", () => {
    const result = repairSchema.safeParse({
      id: "REP-001",
      customerName: "Martín",
      customerPhone: null,
      brand: "Lenovo",
      model: "IdeaPad 3",
      serialNumber: null,
      reportedIssue: "No enciende",
      accessories: ["Cargador"],
      status: "RECEIVED",
      diagnosis: null,
      solution: null,
      createdAt: "2026-08-12T12:00:00.000Z",
    });

    expect(result.success).toBe(false);
  });
});

describe("diagnosticAnalysisSchema", () => {
  it("validates the structured diagnosis contract", () => {
    const analysis = diagnosticAnalysisSchema.parse({
      assessment: "La entrada está presente, pero falta 5VALW.",
      hypotheses: [
        {
          description: "Falla en el convertidor de standby.",
          confidence: "medium",
        },
      ],
      nextSteps: [
        {
          action: "Medir resistencia a tierra en la bobina de 5VALW.",
          reason: "Permite descartar un corto en la salida.",
        },
      ],
      missingInformation: ["Resistencia de 5VALW a tierra"],
      sources: ["kb-standby-rails"],
    });

    expect(analysis.sources).toEqual(["kb-standby-rails"]);
  });
});

