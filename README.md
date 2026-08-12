# FixFlow AI

FixFlow AI is a local-first proof of concept for laptop repair technicians. The
current vertical slice includes a functional repair dashboard, manual intake,
repair detail and timeline UI backed by a Hono API and Cloudflare D1. Browser-local
AI remains isolated behind `LocalAIService`; CRUD does not depend on AI
availability. Repair intake and evidence-based diagnostic suggestions can be
structured by WebLLM entirely inside the browser.

## Requirements

- Node.js 22.12 or newer
- npm 10 or newer
- A Cloudflare account only for creating/deploying a remote D1 database

## Local development

Install dependencies, apply the schema plus the 36-case demo seed, and start
the integrated Vite/Workers server:

```bash
npm install
npm run db:migrate:local
npm run dev
```

Wrangler stores local D1 state under `.wrangler/state`. The migration command
is idempotent. To recreate the local database and seed from scratch:

```bash
npm run db:reset:local
```

The API is served below `/api`:

```text
GET    /api/health
GET    /api/repairs
POST   /api/repairs
GET    /api/repairs/:id
PATCH  /api/repairs/:id
DELETE /api/repairs/:id
GET    /api/repairs/:id/events
POST   /api/repairs/:id/events
```

Success responses use `{ "data": ... }`. Errors use
`{ "error": { "code": "...", "message": "..." } }`; validation errors also
contain Zod issues.

The web interface provides:

- a responsive dashboard with the 36 seeded demo repairs;
- natural-language intake with a fully editable manual fallback;
- repair details, status updates and a typed event timeline;
- creation of technician notes and measurements without a page reload;
- local diagnostic suggestions grounded in up to three matched technical documents.

“Procesar con IA” loads a browser-local model and proposes an editable repair
draft. “Analizar diagnóstico” retrieves local documents by deterministic tag
matching, without embeddings or a vector database, and stores the result as an
`AI_SUGGESTION`. It never changes `repair.diagnosis`; sources are shown with each
structured analysis. All CRUD workflows remain available when local AI is
unavailable.

## Browser-local AI requirements

The selected model is `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`, chosen for this
demo machine (Ryzen 5 2400G, integrated Vega 11 with 2 GB assigned VRAM). Its
artifacts are approximately 290 MB and WebLLM estimates about 945 MB of VRAM.

- Use a recent Google Chrome with WebGPU and hardware acceleration enabled.
- The model downloads only after pressing **Procesar con IA**.
- Download/load progress is shown in the intake screen.
- WebLLM runs in a dedicated Web Worker so the interface remains responsive.
- Model artifacts use WebLLM's Cache API backend and are reused by the same
  browser origin on later visits.
- No repair text or generated output is sent to an external LLM API.
- Diagnostic model output is schema-validated, and cited source IDs are rejected
  unless they belong to the documents retrieved for that analysis.

When WebGPU is unavailable, FixFlow shows a clear warning and keeps the manual
intake and every CRUD action operational.

The hardware comparison and source-backed choice are documented in
[docs/model-selection.md](docs/model-selection.md).

## Tests and build

```bash
npm run typecheck
npm test
npm run build
```

Persistence/API tests use Cloudflare's Workers Vitest integration. Migrations
are applied to an isolated, real local D1 binding in the `workerd` runtime; no
remote database or credentials are needed.

## Create D1 and deploy

Authenticate and create the production database once:

```bash
npx wrangler login
npx wrangler d1 create fixflow-ai
```

Copy the returned `database_id` into `wrangler.jsonc`, replacing the all-zero
local placeholder. Then apply migrations and deploy:

```bash
npm run db:migrate:remote
npm run deploy
```

Remote migration `0002_seed_demo_repairs.sql` inserts the demo dataset. Do not
apply it to a database that should begin empty.

## Demo data provenance

The seed contains exactly 36 synthetic laptop cases and 72 timeline events,
covering power/image/charging, HDD/SSD/NVMe, RAM, Windows/boot/filesystem,
thermals and peripherals. Customer-reported issues, technician evidence, AI
hypotheses and confirmed diagnoses remain distinct. Technical source URLs and
their use are recorded in [docs/seed-sources.md](docs/seed-sources.md).

## Project layout

```text
migrations/           D1 schema and reproducible demo seed
src/                  React UI, typed API client and shared Zod contracts
worker/               Hono API, D1 repository and Workers tests
docs/seed-sources.md  Official source provenance for demo patterns
docs/model-selection.md  Local model and hardware rationale
wrangler.jsonc        Worker, static assets and D1 binding configuration
```
