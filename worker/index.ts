import { Hono } from "hono";
import { ZodError } from "zod";
import {
  createAISuggestionEventInputSchema,
  createRepairInputSchema,
  createTechnicianRepairEventInputSchema,
  createKnowledgeDocumentInputSchema,
  listKnowledgeDocumentsInputSchema,
  updateRepairInputSchema,
  updateKnowledgeDocumentInputSchema,
} from "../src/domain/schemas";
import { KnowledgeRepository } from "./knowledge-repository";
import { RepairRepository } from "./repair-repository";
import {
  AuthRepository,
  type AuthSession,
  clearSessionCookie,
  createSessionCookie,
  hasSameOrigin,
  isJsonRequest,
  verifyCredentials,
} from "./auth";
import { gatewayGenerationRequestSchema } from "../src/ai/gateway-contract";
import {
  GatewayRequestError,
  generateWithVercelGateway,
} from "./gateway-ai";

export type Env = Cloudflare.Env;

type Variables = {
  repository: RepairRepository;
  knowledgeRepository: KnowledgeRepository;
  authRepository: AuthRepository;
  authSession: AuthSession;
};
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

function parseLoginInput(value: unknown): { username: string; password: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.username !== "string" ||
    record.username.length < 1 ||
    record.username.length > 256 ||
    typeof record.password !== "string" ||
    record.password.length < 1 ||
    record.password.length > 1024
  ) {
    return null;
  }
  return { username: record.username, password: record.password };
}

class PayloadTooLargeError extends Error {}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (
      !Number.isSafeInteger(contentLength) ||
      contentLength < 0 ||
      contentLength > maximumBytes
    ) {
      throw new PayloadTooLargeError();
    }
  }

  if (!request.body) return JSON.parse("") as unknown;
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let body = "";
  let receivedBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedBytes += value.byteLength;
      if (receivedBytes > maximumBytes) {
        await reader.cancel();
        throw new PayloadTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } catch (error) {
    if (error instanceof TypeError) {
      try {
        await reader.cancel();
      } catch {
        // The stream may already be closed after a decoder failure.
      }
      throw new SyntaxError("Request body is not valid UTF-8 JSON");
    }
    throw error;
  }
  return JSON.parse(body) as unknown;
}

const unixSeconds = () => Math.floor(Date.now() / 1000);

app.use("/api/*", async (context, next) => {
  context.header("Cache-Control", "private, no-store");
  context.set("repository", new RepairRepository(context.env.DB));
  context.set("knowledgeRepository", new KnowledgeRepository(context.env.DB));
  context.set("authRepository", new AuthRepository(context.env.DB));
  await next();
});

app.get("/api/health", (context) =>
  context.json({ status: "ok", service: "fixflow-ai" }),
);

app.post("/api/auth/login", async (context) => {
  if (!hasSameOrigin(context.req.raw)) {
    return context.json(
      { error: { code: "FORBIDDEN", message: "Request origin is not allowed" } },
      403,
    );
  }
  if (!isJsonRequest(context.req.raw)) {
    return context.json(
      { error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "JSON is required" } },
      415,
    );
  }
  const input = parseLoginInput(await readBoundedJson(context.req.raw, 8_192));
  if (!input) {
    return context.json(
      { error: { code: "INVALID_REQUEST", message: "Invalid login request" } },
      400,
    );
  }

  const now = unixSeconds();
  if (
    await context.var.authRepository.reserveLoginAttempt(
      context.req.raw,
      input.username,
      now,
    )
  ) {
    return context.json(
      { error: { code: "RATE_LIMITED", message: "Too many login attempts" } },
      429,
    );
  }

  if (
    !context.env.FIXFLOW_AUTH_USERNAME ||
    !context.env.FIXFLOW_AUTH_PASSWORD_HASH
  ) {
    throw new Error("FixFlow authentication secrets are not configured");
  }
  const authenticated = await verifyCredentials(
    input.username,
    input.password,
    context.env.FIXFLOW_AUTH_USERNAME,
    context.env.FIXFLOW_AUTH_PASSWORD_HASH,
  );
  if (!authenticated) {
    return context.json(
      {
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid username or password",
        },
      },
      401,
    );
  }

  await context.var.authRepository.clearLoginFailures(
    context.req.raw,
    input.username,
  );
  const { session, token } = await context.var.authRepository.createSession(
    context.env.FIXFLOW_AUTH_USERNAME,
    now,
  );
  context.header("Set-Cookie", createSessionCookie(context.req.raw, token));
  return context.json({
    data: {
      authenticated: true as const,
      username: session.username,
      csrfToken: session.csrfToken,
    },
  });
});

app.use("/api/*", async (context, next) => {
  const session = await context.var.authRepository.authenticate(
    context.req.raw,
    unixSeconds(),
  );
  if (!session) {
    return context.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required" } },
      401,
    );
  }
  context.set("authSession", session);

  const method = context.req.method.toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    if (!hasSameOrigin(context.req.raw)) {
      return context.json(
        { error: { code: "FORBIDDEN", message: "Request origin is not allowed" } },
        403,
      );
    }
    if (
      method !== "DELETE" &&
      context.req.path !== "/api/auth/logout" &&
      !isJsonRequest(context.req.raw)
    ) {
      return context.json(
        { error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "JSON is required" } },
        415,
      );
    }
    if (
      !(await context.var.authRepository.csrfMatches(
        session,
        context.req.header("X-CSRF-Token") ?? null,
      ))
    ) {
      return context.json(
        { error: { code: "FORBIDDEN", message: "CSRF validation failed" } },
        403,
      );
    }
  }
  await next();
});

app.get("/api/auth/session", (context) =>
  context.json({
    data: {
      authenticated: true as const,
      username: context.var.authSession.username,
      csrfToken: context.var.authSession.csrfToken,
    },
  }),
);

app.post("/api/auth/logout", async (context) => {
  await context.var.authRepository.deleteSession(context.var.authSession.tokenHash);
  context.header("Set-Cookie", clearSessionCookie(context.req.raw));
  return context.body(null, 204);
});

app.post("/api/ai/gateway/generate", async (context) => {
  const input = gatewayGenerationRequestSchema.parse(
    await readBoundedJson(context.req.raw, 512_000),
  );
  const result = await generateWithVercelGateway(
    input,
    context.env.AI_GATEWAY_API_KEY,
  );
  return context.json({ data: result });
});

app.get("/api/repairs", async (context) =>
  context.json({ data: await context.var.repository.list() }),
);

app.post("/api/repairs", async (context) => {
  const input = createRepairInputSchema.parse(await context.req.json());
  const repair = await context.var.repository.create(input);
  return context.json({ data: repair }, 201);
});

app.get("/api/repairs/:id", async (context) => {
  const repair = await context.var.repository.get(context.req.param("id"));
  return repair
    ? context.json({ data: repair })
    : context.json({ error: { code: "NOT_FOUND", message: "Repair not found" } }, 404);
});

app.patch("/api/repairs/:id", async (context) => {
  const input = updateRepairInputSchema.parse(await context.req.json());
  const repair = await context.var.repository.update(context.req.param("id"), input);
  return repair
    ? context.json({ data: repair })
    : context.json({ error: { code: "NOT_FOUND", message: "Repair not found" } }, 404);
});

app.delete("/api/repairs/:id", async (context) => {
  const deleted = await context.var.repository.delete(context.req.param("id"));
  return deleted
    ? context.body(null, 204)
    : context.json({ error: { code: "NOT_FOUND", message: "Repair not found" } }, 404);
});

app.get("/api/repairs/:id/events", async (context) => {
  const events = await context.var.repository.listEvents(context.req.param("id"));
  return events
    ? context.json({ data: events })
    : context.json({ error: { code: "NOT_FOUND", message: "Repair not found" } }, 404);
});

app.post("/api/repairs/:id/events", async (context) => {
  const input = createTechnicianRepairEventInputSchema.parse(
    await context.req.json(),
  );
  const event = await context.var.repository.addEvent(context.req.param("id"), input);
  return event
    ? context.json({ data: event }, 201)
    : context.json({ error: { code: "NOT_FOUND", message: "Repair not found" } }, 404);
});

app.post("/api/repairs/:id/events/ai-suggestions", async (context) => {
  const input = createAISuggestionEventInputSchema.parse(
    await context.req.json(),
  );
  const event = await context.var.repository.addEvent(context.req.param("id"), {
    type: "AI_SUGGESTION",
    content: input.content,
  });
  return event
    ? context.json({ data: event }, 201)
    : context.json({ error: { code: "NOT_FOUND", message: "Repair not found" } }, 404);
});

app.get("/api/knowledge", async (context) => {
  const filters = listKnowledgeDocumentsInputSchema.parse({
    q: context.req.query("q"),
    tag: context.req.query("tag"),
    status: context.req.query("status"),
  });
  return context.json({ data: await context.var.knowledgeRepository.list(filters) });
});

app.post("/api/knowledge", async (context) => {
  const input = createKnowledgeDocumentInputSchema.parse(await context.req.json());
  if (await context.var.knowledgeRepository.get(input.id)) {
    return context.json(
      { error: { code: "CONFLICT", message: "Knowledge document already exists" } },
      409,
    );
  }
  const document = await context.var.knowledgeRepository.create(input);
  return context.json({ data: document }, 201);
});

app.get("/api/knowledge/:id", async (context) => {
  const document = await context.var.knowledgeRepository.get(context.req.param("id"));
  return document
    ? context.json({ data: document })
    : context.json(
        { error: { code: "NOT_FOUND", message: "Knowledge document not found" } },
        404,
      );
});

app.patch("/api/knowledge/:id", async (context) => {
  const input = updateKnowledgeDocumentInputSchema.parse(await context.req.json());
  const document = await context.var.knowledgeRepository.update(
    context.req.param("id"),
    input,
  );
  return document
    ? context.json({ data: document })
    : context.json(
        { error: { code: "NOT_FOUND", message: "Knowledge document not found" } },
        404,
      );
});

app.delete("/api/knowledge/:id", async (context) => {
  const deleted = await context.var.knowledgeRepository.delete(context.req.param("id"));
  return deleted
    ? context.body(null, 204)
    : context.json(
        { error: { code: "NOT_FOUND", message: "Knowledge document not found" } },
        404,
      );
});

app.notFound((context) =>
  context.json({ error: { code: "NOT_FOUND", message: "Route not found" } }, 404),
);

app.onError((error, context) => {
  if (error instanceof GatewayRequestError) {
    return context.json(
      { error: { code: error.code, message: error.message } },
      error.status as 429 | 502 | 503,
    );
  }
  if (error instanceof PayloadTooLargeError) {
    return context.json(
      { error: { code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" } },
      413,
    );
  }
  if (error instanceof ZodError) {
    return context.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          issues: error.issues,
        },
      },
      400,
    );
  }
  if (error instanceof SyntaxError) {
    return context.json(
      { error: { code: "INVALID_JSON", message: "Request body is not valid JSON" } },
      400,
    );
  }
  console.error(error);
  return context.json(
    { error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } },
    500,
  );
});

export default app;
