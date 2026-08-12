import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { RepairRepository } from "./repair-repository";

describe("RepairRepository with a real local D1 binding", () => {
  const repository = new RepairRepository(env.DB);

  it("loads the 36 validated seeded repairs and their timelines", async () => {
    const repairs = await repository.list();
    expect(repairs).toHaveLength(36);
    expect(new Set(repairs.map((repair) => repair.id)).size).toBe(36);
    expect(repairs.some((repair) => repair.reportedIssue.includes("SSD"))).toBe(true);

    const events = await repository.listEvents("FF-2026-001");
    expect(events).toHaveLength(2);
    expect(events?.[1]?.type).toBe("MEASUREMENT");
  });

  it("persists JSON accessories, updates, events and cascade deletion", async () => {
    const created = await repository.create({
      customerName: "Prueba Técnica",
      customerPhone: null,
      brand: "Framework",
      model: "Laptop 13",
      serialNumber: null,
      reportedIssue: "No reconoce un dispositivo USB.",
      accessories: ["cargador", "adaptador USB"],
      status: "RECEIVED",
    });
    expect(created.accessories).toEqual(["cargador", "adaptador USB"]);

    const updated = await repository.update(created.id, {
      status: "DIAGNOSING",
      diagnosis: "Puerto USB dañado confirmado por inspección.",
    });
    expect(updated?.status).toBe("DIAGNOSING");
    expect(updated?.diagnosis).toContain("confirmado");

    const event = await repository.addEvent(created.id, {
      type: "MEASUREMENT",
      content: "VBUS mide 0 V con el puerto habilitado.",
    });
    expect(event?.repairId).toBe(created.id);
    expect(await repository.listEvents(created.id)).toHaveLength(1);

    expect(await repository.delete(created.id)).toBe(true);
    expect(await repository.get(created.id)).toBeNull();
    const orphanCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM repair_events WHERE repair_id = ?",
    )
      .bind(created.id)
      .first<{ count: number }>();
    expect(orphanCount?.count).toBe(0);
  });

  it("persists AI provenance without updating the confirmed diagnosis", async () => {
    const created = await repository.create({
      customerName: "Separación IA",
      customerPhone: null,
      brand: "Exo",
      model: "R3",
      serialNumber: null,
      reportedIssue: "No enciende.",
      accessories: [],
      status: "DIAGNOSING",
    });

    const suggestion = await repository.addEvent(created.id, {
      type: "AI_SUGGESTION",
      content: JSON.stringify({
        version: 1,
        kind: "DIAGNOSTIC_ANALYSIS",
        analysis: {
          assessment: "Todavía no hay mediciones suficientes.",
          hypotheses: [],
          nextSteps: [],
          missingInformation: ["Tensión de entrada"],
          sources: ["kb-no-power-sequence"],
        },
      }),
    });

    expect(suggestion?.type).toBe("AI_SUGGESTION");
    expect((await repository.get(created.id))?.diagnosis).toBeNull();

    await repository.delete(created.id);
  });
});
