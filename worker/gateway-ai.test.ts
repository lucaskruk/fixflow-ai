import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWithVercelGateway, GatewayRequestError } from "./gateway-ai";

const request = {
  task: "repair-extraction" as const,
  modelId: "zai/glm-4.6v-flash" as const,
  input: "Lenovo T14 no enciende",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Vercel AI Gateway Worker client", () => {
  it("requires the secret before making a request", async () => {
    await expect(generateWithVercelGateway(request, undefined)).rejects.toMatchObject({
      status: 503,
      code: "GATEWAY_NOT_CONFIGURED",
    });
  });

  it("sends only an allow-listed task and keeps the key in the Worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        message: { content: '{"customerName":null}' },
        finish_reason: "stop",
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateWithVercelGateway(request, "  secret-key\n");

    expect(result).toMatchObject({
      modelId: request.modelId,
      finishReason: "stop",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer secret-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: request.modelId,
      max_tokens: 640,
      messages: [
        { role: "system" },
        { role: "user" },
      ],
      reasoning: { enabled: false },
    });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("response_format");
    expect(JSON.parse(String(init.body)).messages[0].content).toContain(
      "Esquema JSON requerido",
    );
  });

  it("reports a rejected Gateway key without returning an HTTP 401 to the browser", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "invalid bearer token" },
    }), { status: 401, headers: { "Content-Type": "application/json" } })));

    const promise = generateWithVercelGateway(request, "wrong-key");

    await expect(promise).rejects.toMatchObject({
      status: 502,
      code: "GATEWAY_AUTH_FAILED",
      message: "Vercel rechazó AI_GATEWAY_API_KEY. Volvé a cargar el valor de una clave creada en Vercel AI Gateway",
    });
  });

  it("reports the billing or access requirement returned as HTTP 403", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "AI Gateway requires a valid credit card on file" },
    }), { status: 403, headers: { "Content-Type": "application/json" } })));

    const promise = generateWithVercelGateway(request, "valid-key");

    await expect(promise).rejects.toMatchObject({
      status: 502,
      code: "GATEWAY_ACCESS_DENIED",
      message: "Vercel AI Gateway requiere una tarjeta válida para habilitar créditos, o la cuenta no tiene acceso. Revisá la facturación y los permisos en Vercel",
    });
  });

  it("maps upstream failures without exposing their response to the browser", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: "provider internal detail" },
    }), { status: 500, headers: { "Content-Type": "application/json" } })));

    const promise = generateWithVercelGateway(request, "secret-key");

    await expect(promise).rejects.toBeInstanceOf(GatewayRequestError);
    await expect(promise).rejects.toMatchObject({
      status: 502,
      code: "GATEWAY_UNAVAILABLE",
      message: "Vercel AI Gateway no está disponible temporalmente",
    });
  });
});
