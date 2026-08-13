import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { AuthRepository } from "./auth";
import app, { type Env } from "./index";

const TEST_USERNAME = "fixflow-test-admin";
const TEST_PASSWORD = "test-password-only";
const TEST_PASSWORD_HASH =
  "pbkdf2_sha256$100000$MDEyMzQ1Njc4OWFiY2RlZg$hmJnTD2vjN1CkL22eMlo3QlzJQ8Mhd0bteZM8PAv8rU";
const testEnv: Env = {
  DB: env.DB,
  TEST_MIGRATIONS: env.TEST_MIGRATIONS,
  FIXFLOW_AUTH_USERNAME: TEST_USERNAME,
  FIXFLOW_AUTH_PASSWORD_HASH: TEST_PASSWORD_HASH,
};

const rawFetch = (url: string, init?: RequestInit) =>
  app.request(url, init, testEnv);

async function login(
  options: { url?: string; username?: string; password?: string } = {},
): Promise<Response> {
  const url = options.url ?? "https://example.test/api/auth/login";
  return rawFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: new URL(url).origin,
      "cf-connecting-ip": "203.0.113.10",
    },
    body: JSON.stringify({
      username: options.username ?? TEST_USERNAME,
      password: options.password ?? TEST_PASSWORD,
    }),
  });
}

async function authenticatedSession(): Promise<{
  cookie: string;
  csrfToken: string;
}> {
  const response = await login();
  expect(response.status).toBe(200);
  const body = (await response.json()) as { data: { csrfToken: string } };
  return {
    cookie: response.headers.get("set-cookie")!.split(";", 1)[0]!,
    csrfToken: body.data.csrfToken,
  };
}

describe("authentication API", () => {
  it("keeps health public and protects every other API route", async () => {
    const health = await rawFetch("https://example.test/api/health");
    expect(health.status).toBe(200);

    const repairs = await rawFetch("https://example.test/api/repairs");
    expect(repairs.status).toBe(401);
    await expect(repairs.json()).resolves.toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required" },
    });

    const session = await rawFetch("https://example.test/api/auth/session");
    expect(session.status).toBe(401);
  });

  it("uses a generic credential error and creates a hardened opaque session", async () => {
    const invalid = await login({ password: "not-the-password" });
    expect(invalid.status).toBe(401);
    await expect(invalid.json()).resolves.toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid username or password",
      },
    });

    const response = await login();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("__Host-fixflow_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=28800");
    await expect(response.json()).resolves.toMatchObject({
      data: {
        authenticated: true,
        username: TEST_USERNAME,
        csrfToken: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
      },
    });

    const stored = await env.DB.prepare(
      "SELECT token_hash, csrf_token FROM auth_sessions",
    ).first<{ token_hash: string; csrf_token: string }>();
    expect(stored?.token_hash).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(cookie).not.toContain(stored!.token_hash);
  });

  it("restores a session, enforces CSRF, and revokes it on logout", async () => {
    const { cookie, csrfToken } = await authenticatedSession();
    const session = await rawFetch("https://example.test/api/auth/session", {
      headers: { cookie },
    });
    expect(session.status).toBe(200);
    await expect(session.json()).resolves.toEqual({
      data: { authenticated: true, username: TEST_USERNAME, csrfToken },
    });

    const missingCsrf = await rawFetch("https://example.test/api/auth/logout", {
      method: "POST",
      headers: { cookie, origin: "https://example.test" },
    });
    expect(missingCsrf.status).toBe(403);

    const logout = await rawFetch("https://example.test/api/auth/logout", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://example.test",
        "X-CSRF-Token": csrfToken,
      },
    });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");

    const revoked = await rawFetch("https://example.test/api/auth/session", {
      headers: { cookie },
    });
    expect(revoked.status).toBe(401);
  });

  it("rejects sessions after the idle timeout", async () => {
    const { cookie } = await authenticatedSession();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE auth_sessions
       SET created_at = ?, last_seen_at = ?, absolute_expires_at = ?
       WHERE rowid = (SELECT MAX(rowid) FROM auth_sessions)`,
    )
      .bind(now - 2_000, now - 1_801, now + 1_000)
      .run();
    const response = await rawFetch("https://example.test/api/auth/session", {
      headers: { cookie },
    });
    expect(response.status).toBe(401);
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM auth_sessions WHERE last_seen_at = ?",
    )
      .bind(now - 1_801)
      .first<{ count: number }>();
    expect(remaining?.count).toBe(0);
  });

  it("rejects sessions after their absolute lifetime", async () => {
    const { cookie } = await authenticatedSession();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `UPDATE auth_sessions
       SET created_at = ?, last_seen_at = ?, absolute_expires_at = ?
       WHERE rowid = (SELECT MAX(rowid) FROM auth_sessions)`,
    )
      .bind(now - 28_801, now, now - 1)
      .run();
    const response = await rawFetch("https://example.test/api/auth/session", {
      headers: { cookie },
    });
    expect(response.status).toBe(401);
    const remaining = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM auth_sessions WHERE absolute_expires_at = ?",
    )
      .bind(now - 1)
      .first<{ count: number }>();
    expect(remaining?.count).toBe(0);
  });

  it("rejects wrong-origin and wrong-CSRF mutations", async () => {
    const { cookie } = await authenticatedSession();
    const wrongOrigin = await rawFetch("https://example.test/api/repairs", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://attacker.test",
        "content-type": "application/json",
        "X-CSRF-Token": "irrelevant",
      },
      body: JSON.stringify({}),
    });
    expect(wrongOrigin.status).toBe(403);

    const wrongCsrf = await rawFetch("https://example.test/api/repairs", {
      method: "POST",
      headers: {
        cookie,
        origin: "https://example.test",
        "content-type": "application/json",
        "X-CSRF-Token": "wrong-csrf-token",
      },
      body: JSON.stringify({}),
    });
    expect(wrongCsrf.status).toBe(403);
    const repairCount = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM repairs",
    ).first<{ count: number }>();
    expect(repairCount?.count).toBe(36);
  });

  it("validates login origin and JSON content type", async () => {
    const missingOrigin = await rawFetch("https://example.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
    });
    expect(missingOrigin.status).toBe(403);

    const wrongOrigin = await rawFetch("https://example.test/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://attacker.test",
      },
      body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
    });
    expect(wrongOrigin.status).toBe(403);

    const wrongType = await rawFetch("https://example.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://example.test" },
      body: "credentials",
    });
    expect(wrongType.status).toBe(415);

    const invalidUtf8 = await rawFetch("https://example.test/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.test",
      },
      body: new Uint8Array([0xff]),
    });
    expect(invalidUtf8.status).toBe(400);

    const oversized = await rawFetch("https://example.test/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://example.test",
      },
      body: JSON.stringify({ username: "x".repeat(9_000), password: "x" }),
    });
    expect(oversized.status).toBe(413);
  });

  it("supports an intentionally insecure cookie name only on localhost HTTP", async () => {
    const response = await login({ url: "http://localhost/api/auth/login" });
    expect(response.status).toBe(200);
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("fixflow_session=");
    expect(cookie).not.toContain("__Host-");
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Strict");
  });

  it("atomically rate limits a concurrent burst for the same account", async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, attempt) =>
        login({ password: `wrong-${attempt}` }),
      ),
    );
    const statuses = responses.map(({ status }) => status);
    expect(statuses.filter((status) => status === 401)).toHaveLength(5);
    expect(statuses.filter((status) => status === 429)).toHaveLength(5);

    const before = await env.DB.prepare(
      "SELECT blocked_until FROM auth_login_attempts WHERE scope = 'username'",
    ).first<{ blocked_until: number }>();
    expect(before?.blocked_until).toBeGreaterThan(0);
    const repository = new AuthRepository(env.DB);
    const stillBlocked = await repository.reserveLoginAttempt(
      new Request("https://example.test/api/auth/login", {
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      TEST_USERNAME,
      before!.blocked_until - 899,
    );
    expect(stillBlocked).toBe(true);
    const after = await env.DB.prepare(
      "SELECT blocked_until FROM auth_login_attempts WHERE scope = 'username'",
    ).first<{ blocked_until: number }>();
    expect(after?.blocked_until).toBe(before?.blocked_until);
  });
});
