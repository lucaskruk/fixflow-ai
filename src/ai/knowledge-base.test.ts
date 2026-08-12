import { describe, expect, it } from "vitest";
import type { Repair, RepairEvent } from "../domain/schemas";
import {
  identifyKnowledgeTags,
  knowledgeDocuments,
  retrieveKnowledgeDocuments,
} from "./knowledge-base";

const repair: Repair = {
  id: "FF-TEST-POWER",
  customerName: "Técnico",
  customerPhone: null,
  brand: "Exo",
  model: "R3",
  serialNumber: null,
  reportedIssue: "No enciende con el cargador conectado.",
  accessories: ["cargador"],
  status: "DIAGNOSING",
  diagnosis: null,
  solution: null,
  createdAt: "2026-08-12T10:00:00.000Z",
  updatedAt: "2026-08-12T10:00:00.000Z",
};

const events: RepairEvent[] = [
  {
    id: "EV-POWER-1",
    repairId: repair.id,
    type: "MEASUREMENT",
    content: "Entrada 19.4 V. 3VALW presente, 5VALW ausente.",
    createdAt: "2026-08-12T10:05:00.000Z",
  },
];

describe("local knowledge retrieval", () => {
  it("contains the eight curated diagnostic topics", () => {
    expect(knowledgeDocuments).toHaveLength(8);
    expect(knowledgeDocuments.map((document) => document.id)).toEqual([
      "kb-no-power-sequence",
      "kb-input-power-stage",
      "kb-standby-rails",
      "kb-buck-converters",
      "kb-short-to-ground",
      "kb-battery-charging",
      "kb-no-image",
      "kb-bios-ec-basics",
    ]);
  });

  it("identifies tags deterministically from Spanish technical evidence", () => {
    const input = "No enciende. Resistencia a tierra de 2 ohm en la bobina de 5VALW.";
    expect(identifyKnowledgeTags(input)).toEqual(identifyKnowledgeTags(input));
    expect(identifyKnowledgeTags(input)).toEqual(expect.arrayContaining([
      "no-power",
      "standby-rails",
      "5valw",
      "low-resistance",
      "power-rail",
    ]));
  });

  it("returns at most three documents ordered by matching tags", () => {
    const retrieved = retrieveKnowledgeDocuments(repair, events, 99);
    expect(retrieved).toHaveLength(3);
    expect(retrieved.map((document) => document.id)).toEqual([
      "kb-no-power-sequence",
      "kb-standby-rails",
      "kb-input-power-stage",
    ]);
  });

  it("does not retrieve unrelated power documents for a no-image case", () => {
    const noImageRepair = {
      ...repair,
      reportedIssue: "Enciende pero no da imagen en pantalla ni monitor externo.",
    };
    const retrieved = retrieveKnowledgeDocuments(noImageRepair, []);
    expect(retrieved[0]?.id).toBe("kb-no-image");
    expect(retrieved.some((document) => document.id === "kb-battery-charging")).toBe(false);
  });

  it("does not use an earlier AI hypothesis as retrieval evidence", () => {
    const unrelatedRepair = {
      ...repair,
      reportedIssue: "Windows inicia lentamente.",
    };
    const priorSuggestion: RepairEvent = {
      id: "EV-AI-1",
      repairId: repair.id,
      type: "AI_SUGGESTION",
      content: "Hipótesis: corto a tierra en 5VALW.",
      createdAt: "2026-08-12T10:10:00.000Z",
    };

    expect(retrieveKnowledgeDocuments(unrelatedRepair, [priorSuggestion])).toEqual([]);
  });
});
