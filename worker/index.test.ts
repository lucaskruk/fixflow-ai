import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

const api = exports.default;

describe("repairs API", () => {
  it("lists and reads seeded repairs", async () => {
    const listResponse = await api.fetch("https://example.test/api/repairs");
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as { data: unknown[] };
    expect(list.data).toHaveLength(36);

    const getResponse = await api.fetch(
      "https://example.test/api/repairs/FF-2026-007",
    );
    expect(getResponse.status).toBe(200);
    const body = (await getResponse.json()) as { data: { diagnosis: string } };
    expect(body.data.diagnosis).toContain("HDD");
  });

  it("validates creation and supports the repair/event workflow", async () => {
    const invalid = await api.fetch("https://example.test/api/repairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: "" }),
    });
    expect(invalid.status).toBe(400);

    const createResponse = await api.fetch("https://example.test/api/repairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "API Demo",
        brand: "Lenovo",
        model: "ThinkPad T14",
        reportedIssue: "El teclado no responde.",
        accessories: ["cargador"],
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = (await createResponse.json()) as { data: { id: string } };

    const eventResponse = await api.fetch(
      `https://example.test/api/repairs/${created.data.id}/events`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "NOTE",
          content: "Teclado externo funciona correctamente.",
        }),
      },
    );
    expect(eventResponse.status).toBe(201);

    const updateResponse = await api.fetch(
      `https://example.test/api/repairs/${created.data.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "DIAGNOSING" }),
      },
    );
    expect(updateResponse.status).toBe(200);

    const deleteResponse = await api.fetch(
      `https://example.test/api/repairs/${created.data.id}`,
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("uses a consistent not-found response", async () => {
    const response = await api.fetch(
      "https://example.test/api/repairs/does-not-exist",
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: { code: "NOT_FOUND", message: "Repair not found" },
    });
  });
});
