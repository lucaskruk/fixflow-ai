import { describe, expect, it } from "vitest";
import type { KnowledgeDocument, Repair, RepairEvent } from "../domain/schemas";
import {
  identifyKnowledgeTags,
  retrieveKnowledgeDocuments,
} from "./knowledge-base";

const documentDefinitions = [
  ["kb-no-power-sequence", ["no-power", "power-sequence", "input-power", "standby-rails"]],
  ["kb-input-power-stage", ["input-power", "adapter", "dc-jack", "input-mosfet", "charger-ic"]],
  ["kb-standby-rails", ["standby-rails", "3valw", "5valw", "enable", "no-power"]],
  ["kb-battery-charging", ["battery-charging", "battery", "adapter", "charger-ic"]],
  ["kb-no-image", ["no-image", "display", "external-display"]],
  ["kb-storage-data-preservation", ["storage", "data-backup", "read-errors"]],
  ["kb-hdd-mechanical-failure", ["hdd", "mechanical-noise", "clicking", "storage", "data-backup"]],
  ["kb-windows-boot-recovery", ["windows-boot", "winre", "boot-loop"]],
  ["kb-thermal-throttling", ["overheating", "thermal-throttling", "high-temperature", "shutdown-load", "performance-drop"]],
  ["kb-cooling-system", ["fan", "airflow", "cooling", "overheating"]],
  ["kb-display-cable-hinge", ["display-cable", "hinge", "flicker", "internal-display", "external-display"]],
] as const;

const documents: KnowledgeDocument[] = documentDefinitions.map(([id, tags]) => ({
  id,
  title: id,
  tags: [...tags],
  content: `Contenido de ${id}`,
  sources: ["Referencia de prueba"],
  status: "published",
  createdAt: "2026-08-12T10:00:00.000Z",
  updatedAt: "2026-08-12T10:00:00.000Z",
}));

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
    const retrieved = retrieveKnowledgeDocuments(documents, repair, events, 99);
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
    const retrieved = retrieveKnowledgeDocuments(documents, noImageRepair, []);
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

    expect(retrieveKnowledgeDocuments(documents, unrelatedRepair, [priorSuggestion])).toEqual([]);
  });

  it("retrieves HDD safety guidance for clicks and missing Windows boot", () => {
    const hddRepair = {
      ...repair,
      id: "FF-HDD",
      reportedIssue:
        "No inicia Windows, hace clics y silbidos propios del disco rígido.",
    };

    expect(retrieveKnowledgeDocuments(documents, hddRepair, []).map(({ id }) => id)).toEqual([
      "kb-hdd-mechanical-failure",
      "kb-storage-data-preservation",
      "kb-windows-boot-recovery",
    ]);
  });

  it("retrieves thermal and cooling guidance for measured throttling", () => {
    const thermalRepair = {
      ...repair,
      id: "FF-THERMAL",
      reportedIssue:
        "Se calienta mucho, el ventilador suena fuerte y se apaga al jugar.",
    };
    const thermalEvent: RepairEvent = {
      id: "EV-THERMAL",
      repairId: thermalRepair.id,
      type: "MEASUREMENT",
      content:
        "CPU alcanza 99 °C bajo carga y reduce frecuencia antes del apagado.",
      createdAt: "2026-08-12T10:10:00.000Z",
    };

    expect(
      retrieveKnowledgeDocuments(documents, thermalRepair, [thermalEvent]).map(({ id }) => id),
    ).toEqual([
      "kb-thermal-throttling",
      "kb-cooling-system",
    ]);
  });

  it("retrieves hinge cable guidance for reproducible lid flicker", () => {
    const flickerRepair = {
      ...repair,
      id: "FF-FLICKER",
      reportedIssue: "La pantalla parpadea al mover la tapa.",
    };
    const flickerEvent: RepairEvent = {
      id: "EV-FLICKER",
      repairId: flickerRepair.id,
      type: "MEASUREMENT",
      content:
        "Monitor externo estable; el parpadeo se reproduce al flexionar la bisagra.",
      createdAt: "2026-08-12T10:10:00.000Z",
    };

    expect(
      retrieveKnowledgeDocuments(documents, flickerRepair, [flickerEvent]).map(({ id }) => id),
    ).toContain("kb-display-cable-hinge");
  });

  it("excludes drafts from diagnostic retrieval", () => {
    const draft = documents.map((document) =>
      document.id === "kb-no-power-sequence"
        ? { ...document, status: "draft" as const }
        : document,
    );
    expect(
      retrieveKnowledgeDocuments(draft, repair, events).some(
        (document) => document.id === "kb-no-power-sequence",
      ),
    ).toBe(false);
  });
});
