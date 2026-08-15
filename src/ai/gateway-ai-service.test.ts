import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/repairs";
import { GatewayAIService } from "./gateway-ai-service";

describe("GatewayAIService", () => {
  it("extracts and validates a repair draft returned by the remote model", async () => {
    const generate = vi.fn().mockResolvedValue({
      modelId: "google/gemini-3-flash",
      finishReason: "stop",
      content: JSON.stringify({
        customerName: "Ana Torres",
        brand: "Lenovo",
        model: "ThinkPad T14",
        serialNumber: "PF-12345",
        reportedIssue: "no enciende",
        accessories: ["cargador"],
        status: null,
      }),
    });
    const service = new GatewayAIService("google/gemini-3-flash", generate);

    await expect(service.extractRepair("Lenovo T14 no enciende")).resolves.toMatchObject({
      customerName: "Ana Torres",
      model: "ThinkPad T14",
      status: null,
    });
    expect(service.getSnapshot()).toMatchObject({
      provider: "vercel-gateway",
      phase: "ready",
      failure: null,
    });
  });

  it("exposes a useful configuration failure without leaking a key", async () => {
    const generate = vi.fn().mockRejectedValue(new ApiError(
      "Vercel AI Gateway todavía no está configurado en el servidor",
      503,
      "GATEWAY_NOT_CONFIGURED",
    ));
    const service = new GatewayAIService("google/gemini-3-flash", generate);

    await expect(service.extractRepair("Lenovo T14 no enciende")).rejects.toThrow(
      "Falta cargar AI_GATEWAY_API_KEY",
    );
    expect(service.getSnapshot().failure).toMatchObject({
      code: "GATEWAY_NOT_CONFIGURED",
      blocksAI: true,
    });
  });
});
