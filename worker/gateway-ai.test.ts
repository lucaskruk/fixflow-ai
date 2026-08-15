import { afterEach, describe, expect, it, vi } from "vitest";
import { generateWithVercelGateway, GatewayRequestError } from "./gateway-ai";

const request = {
  task: "repair-extraction" as const,
  modelId: "google/gemini-3-flash" as const,
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

    const result = await generateWithVercelGateway(request, "secret-key");

    expect(result).toMatchObject({
      modelId: request.modelId,
      finishReason: "stop",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer secret-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: request.modelId,
      response_format: { type: "json_schema" },
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
      code: "GATEWAY_REQUEST_FAILED",
      message: "Vercel AI Gateway no pudo completar la solicitud",
    });
  });
});
