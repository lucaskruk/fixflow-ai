import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (context) =>
  context.json({
    status: "ok",
    service: "fixflow-ai",
  }),
);

app.notFound((context) =>
  context.json(
    {
      error: "Not found",
    },
    404,
  ),
);

export default app;

