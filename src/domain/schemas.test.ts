import { afterEach, describe, expect, it, vi } from "vitest";
import { parseRepairDraftResponse } from "../ai/webllm-local-ai-service";
import { ApiError, repairsApi } from "../api/repairs";
import {
  createAISuggestionEventInputSchema,
  createTechnicianRepairEventInputSchema,
  diagnosticAnalysisSchema,
  repairDraftSchema,
  repairSchema,
} from "./schemas";

describe("repair event creation schemas", () => {
  it.each(["NOTE", "MEASUREMENT", "DIAGNOSIS", "REPAIR"] as const)(
    "accepts %s as a technician record",
    (type) => {
      expect(createTechnicianRepairEventInputSchema.parse({
        type,
        content: "Registro técnico confirmado.",
      })).toEqual({ type, content: "Registro técnico confirmado." });
    },
  );

  it("reserves AI suggestions for the dedicated input", () => {
    expect(createTechnicianRepairEventInputSchema.safeParse({
      type: "AI_SUGGESTION",
      content: "Hipótesis",
    }).success).toBe(false);
    expect(createAISuggestionEventInputSchema.safeParse({
      content: "Hipótesis",
    }).success).toBe(true);
    expect(createAISuggestionEventInputSchema.safeParse({
      type: "AI_SUGGESTION",
      content: "Hipótesis",
    }).success).toBe(false);
  });
});

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

describe("WebLLM repair extraction validation", () => {
  it("accepts an explicit structured draft without filling missing data", () => {
    const draft = parseRepairDraftResponse(JSON.stringify({
      customerName: "Martín",
      brand: "Lenovo",
      model: "IdeaPad 3",
      serialNumber: null,
      reportedIssue: "No enciende",
      accessories: ["cargador"],
      status: null,
    }));

    expect(draft.serialNumber).toBeNull();
    expect(draft.status).toBeNull();
  });

  it("normalizes empty model values without inventing missing data", () => {
    const draft = parseRepairDraftResponse(JSON.stringify({
      customerName: "Martín",
      brand: "Lenovo",
      model: "IdeaPad 3",
      serialNumber: "  ",
      reportedIssue: "No enciende",
      accessories: ["cargador", ""],
      status: null,
    }));

    expect(draft.serialNumber).toBeNull();
    expect(draft.accessories).toEqual(["cargador"]);
  });

  it("rejects output with missing fields instead of silently completing it", () => {
    expect(() => parseRepairDraftResponse(JSON.stringify({
      customerName: "Martín",
      brand: "Lenovo",
    }))).toThrow("no cumplió el formato");
  });

  it("rejects extra model fields instead of silently accepting inventions", () => {
    expect(() => parseRepairDraftResponse(JSON.stringify({
      customerName: null,
      brand: null,
      model: null,
      serialNumber: null,
      reportedIssue: "No enciende",
      accessories: [],
      status: null,
      probableDiagnosis: "Placa dañada",
    }))).toThrow("no cumplió el formato");
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

const apiRepair = {
  id: "FF-TEST-1",
  customerName: "Ana",
  customerPhone: null,
  brand: "Dell",
  model: "Latitude",
  serialNumber: null,
  reportedIssue: "No inicia",
  accessories: ["cargador"],
  status: "RECEIVED",
  diagnosis: null,
  solution: null,
  createdAt: "2026-08-12T10:00:00.000Z",
  updatedAt: "2026-08-12T10:00:00.000Z",
};

describe("repairsApi response parsing", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("valida y devuelve una lista de reparaciones", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [apiRepair] }), { status: 200 }),
    ));
    await expect(repairsApi.list()).resolves.toEqual([apiRepair]);
  });

  it("rechaza respuestas exitosas que no cumplen el contrato", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "incompleto" }] }), { status: 200 }),
    ));
    await expect(repairsApi.list()).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("conserva el código y mensaje de un error de API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: { code: "NOT_FOUND", message: "Repair not found" },
      }), { status: 404 }),
    ));
    await expect(repairsApi.get("missing")).rejects.toEqual(
      new ApiError("Repair not found", 404, "NOT_FOUND"),
    );
  });
});
