import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import app, { type Env } from "./index";

const TEST_USERNAME = "fixflow-test-admin";
const TEST_PASSWORD = "test-password-only";
const TEST_PASSWORD_HASH =
  "pbkdf2_sha256$600000$MDEyMzQ1Njc4OWFiY2RlZg$Yl1-sEP7vMILnVpmeNty_xK55wp0emL27N4rAaX-wxU";
const testEnv: Env = {
  DB: env.DB,
  TEST_MIGRATIONS: env.TEST_MIGRATIONS,
  FIXFLOW_AUTH_USERNAME: TEST_USERNAME,
  FIXFLOW_AUTH_PASSWORD_HASH: TEST_PASSWORD_HASH,
};

let authState: { cookie: string; csrfToken: string } | null = null;

const rawFetch = (url: string, init?: RequestInit) =>
  app.request(url, init, testEnv);

async function login(): Promise<void> {
  const response = await rawFetch("https://example.test/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://example.test",
    },
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { csrfToken: string } };
  authState = {
    cookie: response.headers.get("set-cookie")!.split(";", 1)[0]!,
    csrfToken: body.data.csrfToken,
  };
}

async function authenticatedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!authState) await login();
  const request = async () => {
    const headers = new Headers(init.headers);
    headers.set("cookie", authState!.cookie);
    const method = (init.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
      headers.set("origin", new URL(url).origin);
      headers.set("X-CSRF-Token", authState!.csrfToken);
    }
    return rawFetch(url, { ...init, headers });
  };

  let response = await request();
  if (response.status === 401) {
    await login();
    response = await request();
  }
  return response;
}

const api = { fetch: authenticatedFetch };

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

  it("separates technician records from AI suggestions at the API boundary", async () => {
    const createResponse = await api.fetch("https://example.test/api/repairs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        customerName: "Eventos API",
        brand: "Dell",
        model: "Latitude",
        reportedIssue: "No inicia.",
      }),
    });
    const created = (await createResponse.json()) as { data: { id: string } };

    for (const type of ["NOTE", "MEASUREMENT", "DIAGNOSIS", "REPAIR"]) {
      const response = await api.fetch(
        `https://example.test/api/repairs/${created.data.id}/events`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type, content: `Registro ${type}` }),
        },
      );
      expect(response.status).toBe(201);
    }

    const manualSuggestion = await api.fetch(
      `https://example.test/api/repairs/${created.data.id}/events`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "AI_SUGGESTION",
          content: "No debe aceptarse manualmente.",
        }),
      },
    );
    expect(manualSuggestion.status).toBe(400);

    const aiSuggestion = await api.fetch(
      `https://example.test/api/repairs/${created.data.id}/events/ai-suggestions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "Hipótesis generada localmente." }),
      },
    );
    expect(aiSuggestion.status).toBe(201);
    await expect(aiSuggestion.json()).resolves.toMatchObject({
      data: { type: "AI_SUGGESTION" },
    });

    await api.fetch(`https://example.test/api/repairs/${created.data.id}`, {
      method: "DELETE",
    });
  });
});

describe("knowledge API", () => {
  it("lists, reads and filters the curated D1 documents", async () => {
    const listResponse = await api.fetch("https://example.test/api/knowledge");
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as { data: { id: string }[] };
    expect(list.data).toHaveLength(20);

    const filteredResponse = await api.fetch(
      "https://example.test/api/knowledge?tag=no-power&status=published",
    );
    expect(filteredResponse.status).toBe(200);
    const filtered = (await filteredResponse.json()) as {
      data: { id: string; tags: string[]; status: string }[];
    };
    expect(filtered.data.length).toBeGreaterThan(0);
    expect(filtered.data.every(({ tags }) => tags.includes("no-power"))).toBe(true);

    const getResponse = await api.fetch(
      "https://example.test/api/knowledge/kb-no-power-sequence",
    );
    expect(getResponse.status).toBe(200);
    await expect(getResponse.json()).resolves.toMatchObject({
      data: { id: "kb-no-power-sequence", status: "published" },
    });
  });

  it("validates and supports the complete knowledge lifecycle", async () => {
    const invalid = await api.fetch("https://example.test/api/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "Invalid ID", title: "Sin contenido" }),
    });
    expect(invalid.status).toBe(400);

    const createResponse = await api.fetch("https://example.test/api/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "kb-api-lifecycle-test",
        title: "Prueba API Knowledge",
        tags: ["api-test"],
        content: "Contenido técnico validado.",
        sources: ["Referencia de prueba"],
      }),
    });
    expect(createResponse.status).toBe(201);
    await expect(createResponse.json()).resolves.toMatchObject({
      data: { id: "kb-api-lifecycle-test", status: "draft" },
    });

    const conflict = await api.fetch("https://example.test/api/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "kb-api-lifecycle-test",
        title: "Duplicado",
        tags: ["api-test"],
        content: "No debe crearse.",
        sources: ["Referencia"],
      }),
    });
    expect(conflict.status).toBe(409);

    const updateResponse = await api.fetch(
      "https://example.test/api/knowledge/kb-api-lifecycle-test",
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "published", tags: ["api-test", "reviewed"] }),
      },
    );
    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      data: { status: "published", tags: ["api-test", "reviewed"] },
    });

    const deleteResponse = await api.fetch(
      "https://example.test/api/knowledge/kb-api-lifecycle-test",
      { method: "DELETE" },
    );
    expect(deleteResponse.status).toBe(204);
    const missing = await api.fetch(
      "https://example.test/api/knowledge/kb-api-lifecycle-test",
    );
    expect(missing.status).toBe(404);
  });
});
