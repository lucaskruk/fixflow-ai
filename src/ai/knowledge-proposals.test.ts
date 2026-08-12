import { describe, expect, it } from "vitest";
import type {
  KnowledgeDocument,
  KnowledgeProposalCandidate,
  Repair,
  RepairEvent,
} from "../domain/schemas";
import {
  buildKnowledgeProposalMutation,
  buildKnowledgeProposalRequestContent,
  deduplicateKnowledgeProposals,
  parseKnowledgeProposalResponse,
  prepareKnowledgeProposalEvidence,
  selectDeliveredRepairsForKnowledgeProposal,
} from "./knowledge-proposals";

const delivered: Repair = {
  id: "FF-delivered",
  customerName: "Cliente",
  customerPhone: null,
  brand: "Lenovo",
  model: "T14",
  serialNumber: null,
  reportedIssue: "No enciende",
  accessories: [],
  status: "DELIVERED",
  diagnosis: "MOSFET de entrada en corto",
  solution: "MOSFET reemplazado",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

const active: Repair = {
  ...delivered,
  id: "FF-active",
  status: "READY",
  updatedAt: "2026-01-04T00:00:00.000Z",
};

function event(
  repairId: string,
  type: RepairEvent["type"],
  content: string,
): RepairEvent {
  return {
    id: `EV-${repairId}-${type}`,
    repairId,
    type,
    content,
    createdAt: "2026-01-02T00:00:00.000Z",
  };
}

const document: KnowledgeDocument = {
  id: "input-power",
  title: "Entrada de alimentación",
  tags: ["input-power", "mosfet"],
  content: "Comprobar entrada y MOSFET.",
  sources: ["manual"],
  status: "published",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const candidate: KnowledgeProposalCandidate = {
  operation: "new",
  targetDocumentId: null,
  id: "mosfet-entrada-confirmado",
  title: "Falla confirmada en MOSFET de entrada",
  tags: ["input-power", "mosfet"],
  content: "Confirmar el corto con mediciones antes de reemplazar el MOSFET.",
  sourceRepairIds: [delivered.id],
};

describe("knowledge proposals", () => {
  it("selects only delivered repairs with a deterministic bounded order", () => {
    expect(selectDeliveredRepairsForKnowledgeProposal([active, delivered])).toEqual([
      delivered,
    ]);
  });

  it("keeps evidence categories separate and excludes every AI suggestion", () => {
    const evidence = prepareKnowledgeProposalEvidence([active, delivered], {
      [active.id]: [event(active.id, "DIAGNOSIS", "No debe incluirse")],
      [delivered.id]: [
        event(delivered.id, "NOTE", "Sin marcas de líquido"),
        event(delivered.id, "MEASUREMENT", "0,3 ohm a tierra"),
        event(delivered.id, "AI_SUGGESTION", "Tal vez sea el EC"),
        event(delivered.id, "DIAGNOSIS", "MOSFET en corto confirmado"),
        event(delivered.id, "REPAIR", "MOSFET reemplazado y probado"),
      ],
    });

    expect(evidence).toEqual([{
      repairId: delivered.id,
      brand: "Lenovo",
      model: "T14",
      reportedIssue: "No enciende",
      notes: ["Sin marcas de líquido"],
      measurements: ["0,3 ohm a tierra"],
      confirmedDiagnosisEvents: ["MOSFET en corto confirmado"],
      confirmedRepairEvents: ["MOSFET reemplazado y probado"],
      confirmedRepairDiagnosis: "MOSFET de entrada en corto",
      confirmedRepairSolution: "MOSFET reemplazado",
    }]);
    expect(buildKnowledgeProposalRequestContent(evidence, [document]))
      .not.toContain("Tal vez sea el EC");
  });

  it("drops delivered repairs that have no confirmed diagnosis or repair", () => {
    const unconfirmed = { ...delivered, diagnosis: null, solution: null };
    const evidence = prepareKnowledgeProposalEvidence([unconfirmed], {
      [unconfirmed.id]: [
        event(unconfirmed.id, "NOTE", "Prueba pendiente"),
        event(unconfirmed.id, "MEASUREMENT", "19 V de entrada"),
        event(unconfirmed.id, "AI_SUGGESTION", "Posible MOSFET"),
      ],
    });
    expect(evidence).toEqual([]);
  });

  it("requires human confirmation and creates new candidates only as drafts", () => {
    expect(() => buildKnowledgeProposalMutation(candidate, [document], false))
      .toThrow("confirmá");

    expect(buildKnowledgeProposalMutation(candidate, [document], true)).toEqual({
      kind: "create",
      id: candidate.id,
      input: {
        id: candidate.id,
        title: candidate.title,
        tags: candidate.tags,
        content: candidate.content,
        sources: [delivered.id],
        status: "draft",
      },
    });
  });

  it("preserves repair provenance when updating without changing publication state", () => {
    const update: KnowledgeProposalCandidate = {
      ...candidate,
      operation: "update",
      targetDocumentId: document.id,
      id: document.id,
    };
    expect(buildKnowledgeProposalMutation(update, [document], true)).toEqual({
      kind: "update",
      id: document.id,
      input: {
        title: update.title,
        tags: update.tags,
        content: update.content,
        sources: [delivered.id, "manual"],
      },
    });
  });

  it("deduplicates deterministically by id and normalized tags plus content", () => {
    const sameAsExisting: KnowledgeProposalCandidate = {
      ...candidate,
      id: document.id,
      content: "  COMPROBAR entrada y mosfet. ",
      tags: ["MOSFET", "input-power"],
    };
    const repeated = { ...candidate, id: "otro-id" };
    expect(deduplicateKnowledgeProposals(
      [sameAsExisting, candidate, repeated],
      [document],
    )).toEqual([candidate]);
  });

  it("rejects provenance outside delivered repairs with confirmed evidence", () => {
    const evidence = prepareKnowledgeProposalEvidence([delivered], {
      [delivered.id]: [],
    });
    const response = JSON.stringify({
      candidates: [{ ...candidate, sourceRepairIds: [active.id] }],
    });
    expect(() => parseKnowledgeProposalResponse(response, evidence, [document]))
      .toThrow("sin evidencia confirmada");
  });
});
