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

export interface Env {
  DB: D1Database;
}

type Variables = {
  repository: RepairRepository;
  knowledgeRepository: KnowledgeRepository;
};
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("/api/*", async (context, next) => {
  context.set("repository", new RepairRepository(context.env.DB));
  context.set("knowledgeRepository", new KnowledgeRepository(context.env.DB));
  await next();
});

app.get("/api/health", (context) =>
  context.json({ status: "ok", service: "fixflow-ai" }),
);

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
