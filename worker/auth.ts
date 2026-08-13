import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

const textEncoder = new TextEncoder();

export const SESSION_COOKIE_NAME = "__Host-fixflow_session";
export const LOCAL_SESSION_COOKIE_NAME = "fixflow_session";
export const SESSION_IDLE_SECONDS = 30 * 60;
export const SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;

const MINIMUM_PBKDF2_ITERATIONS = 600_000;
const MAXIMUM_PBKDF2_ITERATIONS = 2_000_000;
const SESSION_TOKEN_BYTES = 32;
const CSRF_TOKEN_BYTES = 32;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_BLOCK_SECONDS = 15 * 60;

type PasswordVerifier = {
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  digest: Uint8Array<ArrayBuffer>;
};

export type AuthSession = {
  tokenHash: string;
  username: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  absoluteExpiresAt: number;
};

type SessionRow = {
  token_hash: string;
  username: string;
  csrf_token: string;
  created_at: number;
  last_seen_at: number;
  absolute_expires_at: number;
};

type AttemptRow = {
  blocked_until: number;
};

function base64UrlEncode(bytes: Uint8Array<ArrayBuffer>): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length % 4 === 1) return null;
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

function randomToken(byteLength: number): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function sha256(value: string): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", textEncoder.encode(value)));
}

async function sha256Base64Url(value: string): Promise<string> {
  return base64UrlEncode(await sha256(value));
}

function parsePasswordVerifier(encoded: string): PasswordVerifier | null {
  const [algorithm, iterationText, saltText, digestText, ...extra] = encoded.split("$");
  if (
    algorithm !== "pbkdf2_sha256" ||
    extra.length > 0 ||
    !iterationText ||
    !/^\d+$/u.test(iterationText) ||
    !saltText ||
    !digestText
  ) {
    return null;
  }

  const iterations = Number(iterationText);
  const salt = base64UrlDecode(saltText);
  const digest = base64UrlDecode(digestText);
  if (
    !Number.isSafeInteger(iterations) ||
    iterations < MINIMUM_PBKDF2_ITERATIONS ||
    iterations > MAXIMUM_PBKDF2_ITERATIONS ||
    !salt ||
    salt.byteLength < 16 ||
    !digest ||
    digest.byteLength !== 32
  ) {
    return null;
  }

  return { iterations, salt, digest };
}

async function derivePasswordDigest(
  password: string,
  verifier: PasswordVerifier,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    pbkdf2Sync(
      password,
      verifier.salt,
      verifier.iterations,
      verifier.digest.byteLength,
      "sha256",
    ),
  );
}

function constantTimeEqual(
  left: Uint8Array<ArrayBuffer>,
  right: Uint8Array<ArrayBuffer>,
): boolean {
  if (left.byteLength !== right.byteLength) return false;
  return timingSafeEqual(left, right);
}

export async function verifyCredentials(
  suppliedUsername: string,
  suppliedPassword: string,
  expectedUsername: string,
  encodedPasswordVerifier: string,
): Promise<boolean> {
  const verifier = parsePasswordVerifier(encodedPasswordVerifier);
  if (!verifier) {
    throw new Error(
      "FIXFLOW_AUTH_PASSWORD_HASH must use pbkdf2_sha256$iterations$base64url-salt$base64url-digest with at least 600000 iterations",
    );
  }

  const [suppliedUsernameDigest, expectedUsernameDigest, suppliedPasswordDigest] =
    await Promise.all([
      sha256(suppliedUsername),
      sha256(expectedUsername),
      derivePasswordDigest(suppliedPassword, verifier),
    ]);

  const usernameMatches = constantTimeEqual(
    suppliedUsernameDigest,
    expectedUsernameDigest,
  );
  const passwordMatches = constantTimeEqual(suppliedPasswordDigest, verifier.digest);
  return usernameMatches && passwordMatches;
}

export function isJsonRequest(request: Request): boolean {
  const contentType = request.headers.get("content-type");
  if (!contentType) return false;
  return contentType.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function isLocalHttpRequest(request: Request): boolean {
  const url = new URL(request.url);
  return (
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}

function cookieName(request: Request): string {
  return isLocalHttpRequest(request) ? LOCAL_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME;
}

export function readSessionToken(request: Request): string | null {
  const expectedName = cookieName(request);
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const cookie of cookieHeader.split(";")) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() !== expectedName) continue;
    const value = cookie.slice(separator + 1).trim();
    return /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
  }
  return null;
}

export function createSessionCookie(request: Request, token: string): string {
  const local = isLocalHttpRequest(request);
  return [
    `${local ? LOCAL_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    local ? null : "Secure",
    "SameSite=Strict",
    `Max-Age=${SESSION_ABSOLUTE_SECONDS}`,
  ]
    .filter((attribute): attribute is string => attribute !== null)
    .join("; ");
}

export function clearSessionCookie(request: Request): string {
  const local = isLocalHttpRequest(request);
  return [
    `${local ? LOCAL_SESSION_COOKIE_NAME : SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    local ? null : "Secure",
    "SameSite=Strict",
    "Max-Age=0",
  ]
    .filter((attribute): attribute is string => attribute !== null)
    .join("; ");
}

function clientIp(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ??
    "unavailable"
  );
}

export class AuthRepository {
  constructor(private readonly database: D1Database) {}

  async reserveLoginAttempt(
    request: Request,
    username: string,
    now: number,
  ): Promise<boolean> {
    const [ipHash, usernameHash] = await Promise.all([
      sha256Base64Url(clientIp(request)),
      sha256Base64Url(username),
    ]);
    const results = await this.database.batch<AttemptRow>([
      this.database
        .prepare(
          `DELETE FROM auth_login_attempts
           WHERE window_started_at <= ? AND blocked_until <= ?`,
        )
        .bind(now - LOGIN_WINDOW_SECONDS, now),
      this.loginAttemptStatement("ip", ipHash, 21, now),
      this.loginAttemptStatement("username", usernameHash, 6, now),
      this.database
        .prepare(
          "SELECT blocked_until FROM auth_login_attempts WHERE scope = ? AND identifier_hash = ?",
        )
        .bind("ip", ipHash),
      this.database
        .prepare(
          "SELECT blocked_until FROM auth_login_attempts WHERE scope = ? AND identifier_hash = ?",
        )
        .bind("username", usernameHash),
    ]);
    return results.slice(-2).some((result) =>
      result.results.some(({ blocked_until }) => blocked_until > now),
    );
  }

  async clearLoginFailures(request: Request, username: string): Promise<void> {
    const [ipHash, usernameHash] = await Promise.all([
      sha256Base64Url(clientIp(request)),
      sha256Base64Url(username),
    ]);
    await this.database.batch([
      this.database
        .prepare(
          "DELETE FROM auth_login_attempts WHERE scope = ? AND identifier_hash = ?",
        )
        .bind("ip", ipHash),
      this.database
        .prepare(
          "DELETE FROM auth_login_attempts WHERE scope = ? AND identifier_hash = ?",
        )
        .bind("username", usernameHash),
    ]);
  }

  private loginAttemptStatement(
    scope: "ip" | "username",
    identifierHash: string,
    threshold: number,
    now: number,
  ): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT INTO auth_login_attempts
           (scope, identifier_hash, window_started_at, failure_count, blocked_until)
         VALUES (?, ?, ?, 1, 0)
         ON CONFLICT(scope, identifier_hash) DO UPDATE SET
           window_started_at = CASE
             WHEN auth_login_attempts.blocked_until > excluded.window_started_at
             THEN auth_login_attempts.window_started_at
             WHEN auth_login_attempts.window_started_at <= excluded.window_started_at - ?
             THEN excluded.window_started_at ELSE auth_login_attempts.window_started_at END,
           failure_count = CASE
             WHEN auth_login_attempts.blocked_until > excluded.window_started_at
             THEN auth_login_attempts.failure_count
             WHEN auth_login_attempts.window_started_at <= excluded.window_started_at - ?
             THEN 1 ELSE auth_login_attempts.failure_count + 1 END,
           blocked_until = CASE
             WHEN auth_login_attempts.blocked_until > excluded.window_started_at
             THEN auth_login_attempts.blocked_until
             WHEN auth_login_attempts.window_started_at <= excluded.window_started_at - ? THEN 0
             WHEN auth_login_attempts.failure_count + 1 >= ?
             THEN excluded.window_started_at + ?
             ELSE auth_login_attempts.blocked_until END`,
      )
      .bind(
        scope,
        identifierHash,
        now,
        LOGIN_WINDOW_SECONDS,
        LOGIN_WINDOW_SECONDS,
        LOGIN_WINDOW_SECONDS,
        threshold,
        LOGIN_BLOCK_SECONDS,
      );
  }

  async createSession(username: string, now: number): Promise<{
    session: AuthSession;
    token: string;
  }> {
    const token = randomToken(SESSION_TOKEN_BYTES);
    const tokenHash = await sha256Base64Url(token);
    const session: AuthSession = {
      tokenHash,
      username,
      csrfToken: randomToken(CSRF_TOKEN_BYTES),
      createdAt: now,
      lastSeenAt: now,
      absoluteExpiresAt: now + SESSION_ABSOLUTE_SECONDS,
    };

    await this.database.batch([
      this.database
        .prepare(
          "DELETE FROM auth_sessions WHERE absolute_expires_at <= ? OR last_seen_at <= ?",
        )
        .bind(now, now - SESSION_IDLE_SECONDS),
      this.database
        .prepare(
          `INSERT INTO auth_sessions
             (token_hash, username, csrf_token, created_at, last_seen_at, absolute_expires_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          session.tokenHash,
          session.username,
          session.csrfToken,
          session.createdAt,
          session.lastSeenAt,
          session.absoluteExpiresAt,
        ),
    ]);
    return { session, token };
  }

  async authenticate(request: Request, now: number): Promise<AuthSession | null> {
    const token = readSessionToken(request);
    if (!token) return null;
    const tokenHash = await sha256Base64Url(token);
    const row = await this.database
      .prepare(
        `SELECT token_hash, username, csrf_token, created_at, last_seen_at,
                absolute_expires_at
         FROM auth_sessions WHERE token_hash = ?`,
      )
      .bind(tokenHash)
      .first<SessionRow>();
    if (!row) return null;

    if (
      row.absolute_expires_at <= now ||
      row.last_seen_at <= now - SESSION_IDLE_SECONDS
    ) {
      await this.deleteSession(tokenHash);
      return null;
    }

    await this.database
      .prepare("UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?")
      .bind(now, tokenHash)
      .run();
    return {
      tokenHash: row.token_hash,
      username: row.username,
      csrfToken: row.csrf_token,
      createdAt: row.created_at,
      lastSeenAt: now,
      absoluteExpiresAt: row.absolute_expires_at,
    };
  }

  async csrfMatches(session: AuthSession, suppliedToken: string | null): Promise<boolean> {
    if (!suppliedToken || suppliedToken.length > 256) return false;
    const [suppliedDigest, expectedDigest] = await Promise.all([
      sha256(suppliedToken),
      sha256(session.csrfToken),
    ]);
    return constantTimeEqual(suppliedDigest, expectedDigest);
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database
      .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
  }
}
