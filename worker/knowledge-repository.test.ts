import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { KnowledgeRepository } from "./knowledge-repository";
import { RepairRepository } from "./repair-repository";

describe("KnowledgeRepository with a real local D1 binding", () => {
  const repository = new KnowledgeRepository(env.DB);

  it("preserves the 20 curated documents as published seed data", async () => {
    const documents = await repository.list();
    expect(documents).toHaveLength(20);
    expect(new Set(documents.map(({ id }) => id)).size).toBe(20);
    expect(documents.every(({ status }) => status === "published")).toBe(true);
    expect(documents.every(({ sources }) => sources.length > 0)).toBe(true);
    expect(documents.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "kb-no-power-sequence",
      "kb-camera-detection",
      "kb-windows-boot-recovery",
    ]));
  });

  it("creates drafts, updates content, filters deterministically and deletes", async () => {
    const created = await repository.create({
      id: "kb-repository-test",
      title: "Documento de prueba D1",
      tags: ["test-tag", "power-rail"],
      content: "Contenido técnico inicial para comprobar el repositorio.",
      sources: ["Referencia controlada de prueba"],
      status: "draft",
    });
    expect(created.status).toBe("draft");

    await expect(repository.list({ status: "published" })).resolves.not.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );
    await expect(repository.list({ tag: "test-tag" })).resolves.toHaveLength(1);
    await expect(repository.list({ q: "técnico inicial" })).resolves.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );

    const updated = await repository.update(created.id, {
      content: "Contenido técnico revisado.",
      status: "published",
    });
    expect(updated).toMatchObject({
      content: "Contenido técnico revisado.",
      status: "published",
    });
    expect(updated?.createdAt).toBe(created.createdAt);

    expect(await repository.delete(created.id)).toBe(true);
    expect(await repository.get(created.id)).toBeNull();
  });

  it("does not remove historical analysis events when a cited document is deleted", async () => {
    const repairs = new RepairRepository(env.DB);
    const repair = await repairs.create({
      customerName: "Prueba de procedencia",
      customerPhone: null,
      brand: "Exo",
      model: "R3",
      serialNumber: null,
      reportedIssue: "No enciende.",
      accessories: [],
      status: "DIAGNOSING",
    });
    const document = await repository.create({
      id: "kb-history-deletion-test",
      title: "Fuente temporal para historial",
      tags: ["no-power"],
      content: "Contenido temporal que puede retirarse de análisis futuros.",
      sources: ["Referencia de prueba"],
      status: "published",
    });
    const event = await repairs.addEvent(repair.id, {
      type: "AI_SUGGESTION",
      content: JSON.stringify({
        version: 1,
        kind: "DIAGNOSTIC_ANALYSIS",
        analysis: {
          assessment: "Evaluación de prueba.",
          hypotheses: [],
          nextSteps: [],
          missingInformation: [],
          sources: [document.id],
        },
      }),
    });

    expect(await repository.delete(document.id)).toBe(true);
    expect(await repairs.listEvents(repair.id)).toContainEqual(event);

    await repairs.delete(repair.id);
  });
});
