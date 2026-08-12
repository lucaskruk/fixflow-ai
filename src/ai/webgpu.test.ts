import { describe, expect, it, vi } from "vitest";
import { checkWebGPU } from "./webgpu";

describe("WebGPU compatibility probe", () => {
  it("lets Windows choose the adapter without powerPreference", async () => {
    const requestAdapter = vi.fn(async () => ({
      features: { has: () => false },
      info: { vendor: "AMD", description: "Radeon Vega" },
    }));

    const result = await checkWebGPU({ gpu: { requestAdapter } });

    expect(requestAdapter).toHaveBeenCalledWith();
    expect(result).toMatchObject({ supported: true });
  });

  it("reports a missing adapter as unsupported", async () => {
    const result = await checkWebGPU({
      gpu: { requestAdapter: vi.fn(async () => null) },
    });

    expect(result).toMatchObject({
      supported: false,
      reason: "ADAPTER_UNAVAILABLE",
    });
  });
});
