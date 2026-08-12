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
  it("contains the curated diagnostic topics", () => {
    expect(knowledgeDocuments).toHaveLength(20);
    expect(knowledgeDocuments.map((document) => document.id)).toEqual([
      "kb-no-power-sequence",
      "kb-input-power-stage",
      "kb-standby-rails",
      "kb-buck-converters",
      "kb-short-to-ground",
      "kb-battery-charging",
      "kb-no-image",
      "kb-bios-ec-basics",
      "kb-storage-data-preservation",
      "kb-hdd-mechanical-failure",
      "kb-nvme-detection",
      "kb-memory-isolation",
      "kb-windows-boot-recovery",
      "kb-windows-system-files",
      "kb-thermal-throttling",
      "kb-cooling-system",
      "kb-usb-port-basics",
      "kb-display-cable-hinge",
      "kb-liquid-damage-input",
      "kb-camera-detection",
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

  it("retrieves HDD safety guidance for clicks and missing Windows boot", () => {
    const hddRepair = {
      ...repair,
      id: "FF-HDD",
      reportedIssue:
        "No inicia Windows, hace clics y silbidos propios del disco rígido.",
    };

    expect(retrieveKnowledgeDocuments(hddRepair, []).map(({ id }) => id)).toEqual([
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
      retrieveKnowledgeDocuments(thermalRepair, [thermalEvent]).map(({ id }) => id),
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
      retrieveKnowledgeDocuments(flickerRepair, [flickerEvent]).map(({ id }) => id),
    ).toContain("kb-display-cable-hinge");
  });
});
