# FixFlow AI

FixFlow AI is a local-first proof of concept for laptop repair technicians. The
application will structure repair intake notes, store repair history, and use a
browser-local language model with curated technical documents to suggest the
next diagnostic step.

## Delivery 1

This repository currently contains the project foundation:

- React 19 SPA with Vite
- Cloudflare Worker API with Hono
- shared Zod contracts for repairs, events, knowledge documents, and diagnostic
  analyses
- a `LocalAIService` boundary that will isolate all future WebLLM access
- Vitest validation tests

D1 persistence and WebLLM are intentionally deferred to later deliveries.

## Local development

Requirements:

- Node.js 22.12 or newer
- npm 10 or newer

Install dependencies and start the integrated Vite and Workers development
server:

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run typecheck
npm test
npm run build
npm run preview
```

## Project layout

```text
src/                 React application
src/domain/          Shared domain schemas and service contracts
worker/              Hono API running on Cloudflare Workers
wrangler.jsonc       Worker and SPA routing configuration
```

## Planned next delivery

The next increment will add D1 migrations, ten seeded repair cases, the
repository layer, CRUD endpoints, and persistence tests.
