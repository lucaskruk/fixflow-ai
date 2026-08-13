import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticatedFetch,
  setCsrfToken,
  subscribeToUnauthorized,
} from "./auth-store";

afterEach(() => {
  setCsrfToken(null);
  vi.unstubAllGlobals();
});

describe("authenticatedFetch", () => {
  it("keeps the CSRF token in memory and adds it only to mutable requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    setCsrfToken("csrf-secret");

    await authenticatedFetch("/api/repairs");
    await authenticatedFetch("/api/repairs", { method: "POST" });

    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).has("X-CSRF-Token"))
      .toBe(false);
    expect(new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("X-CSRF-Token"))
      .toBe("csrf-secret");
  });

  it("notifies the auth provider after any API returns 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 401 })));
    const listener = vi.fn();
    const unsubscribe = subscribeToUnauthorized(listener);
    await authenticatedFetch("/api/repairs");
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
