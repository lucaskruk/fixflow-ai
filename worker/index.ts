import { Hono } from "hono";
import { ZodError } from "zod";
import {
  createRepairEventInputSchema,
  createRepairInputSchema,
  updateRepairInputSchema,
} from "../src/domain/schemas";
import { RepairRepository } from "./repair-repository";

export interface Env {
  DB: D1Database;
}

type Variables = { repository: RepairRepository };
const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("/api/*", async (context, next) => {
  context.set("repository", new RepairRepository(context.env.DB));
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
  const input = createRepairEventInputSchema.parse(await context.req.json());
  const event = await context.var.repository.addEvent(context.req.param("id"), input);
  return event
    ? context.json({ data: event }, 201)
    : context.json({ error: { code: "NOT_FOUND", message: "Repair not found" } }, 404);
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
