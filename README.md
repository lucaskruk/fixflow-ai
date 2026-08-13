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

Install dependencies, apply every pending migration to the local D1 database,
and start the integrated Vite/Workers server:

```bash
npm install
npm run db:migrate:local
npm run dev
```

The application requires the single proof-of-concept account configured in
`.dev.vars`. That ignored file contains only the username and a salted
PBKDF2-HMAC-SHA-256 verifier; the plaintext password must never be committed.
Authentication uses an opaque, revocable D1 session, an `HttpOnly` cookie and
CSRF protection. Sessions expire after 30 minutes without activity or eight
hours in total.

Wrangler stores local D1 state under `.wrangler/state`. The migration command
applies only migrations that D1 has not recorded yet; running it again does not
drop existing tables or repair records. The current migration chain creates the
schema, adds the 36-case demo seed, and adds the curated Knowledge documents.

`db:reset:local` is intentionally different: it deletes all local FixFlow tables
and recreates them from migrations. Use it only when that destructive reset is
the desired result:

```bash
npm run db:reset:local
```

### Windows and WSL

Run Node, npm and Wrangler from the WSL shell so dependencies and the local D1
runtime all use the same environment. Normal development remains:

```bash
npm run dev
```

Vite enables filesystem polling automatically when the repository is located
under `/mnt/c`, including this workspace at
`/mnt/c/Users/Lucas/Documents/LocalCode`, where Windows-to-WSL file notifications
can be missed. For a workspace on a different mount, opt in explicitly:

```bash
npm run dev:wsl
```

The interval is 750 ms to avoid aggressive CPU use. Set
`FIXFLOW_VITE_POLLING=0 npm run dev` to disable the automatic behavior while
diagnosing performance. Polling is configured only for `vite serve`; typecheck,
tests and production builds do not use it. Open the localhost URL printed by
Vite in Chrome on Windows; WSL localhost forwarding normally exposes it without
a separate server.

The API is served below `/api`:

```text
GET    /api/health
POST   /api/auth/login
GET    /api/auth/session
POST   /api/auth/logout
GET    /api/repairs
POST   /api/repairs
GET    /api/repairs/:id
PATCH  /api/repairs/:id
DELETE /api/repairs/:id
GET    /api/repairs/:id/events
POST   /api/repairs/:id/events
GET    /api/knowledge
POST   /api/knowledge
GET    /api/knowledge/:id
PATCH  /api/knowledge/:id
DELETE /api/knowledge/:id
```

Success responses use `{ "data": ... }`. Errors use
`{ "error": { "code": "...", "message": "..." } }`; validation errors also
contain Zod issues.

The web interface provides:

- a responsive dashboard with the 36 seeded demo repairs;
- natural-language intake with a fully editable manual fallback;
- repair details, status updates and a typed event timeline;
- creation of technician notes and measurements without a page reload;
- local diagnostic suggestions grounded in up to three matched technical documents;
- a Knowledge administration page with search, tag/status filters and confirmed deletion;
- a Settings page for a browser-persisted local model choice and cache controls.

Except for health and login, API routes require an authenticated session.
Mutable requests also require the in-memory CSRF token returned by the login or
session endpoint. Login attempts are throttled independently by account and
source to limit brute-force attacks.

“Procesar con IA” loads a browser-local model and proposes an editable repair
draft. “Analizar diagnóstico” retrieves local documents by deterministic tag
matching, without embeddings or a vector database, and stores the result as an
`AI_SUGGESTION`. It never changes `repair.diagnosis`; sources are shown with each
structured analysis. All CRUD workflows remain available when local AI is
unavailable.

The 20 curated technical documents are seeded non-destructively into D1 by
`0003_knowledge_documents.sql`. New documents start as drafts unless explicitly
published. Drafts remain editable in Knowledge but are excluded from diagnostic
retrieval. Tags, content, source references and timestamps are validated by the
shared Zod contract. Deleting a document requires confirmation; existing
`AI_SUGGESTION` events retain the cited document ID so historical analyses remain
readable even when their source document is no longer present.

## D1 migrations and data safety

Migration files are append-only operational history. Never edit a migration
that has already reached a shared or remote database; add a new numbered SQL
file instead. Before applying changes, review what D1 has recorded:

```bash
npx wrangler d1 migrations list fixflow-ai --local
npx wrangler d1 migrations list fixflow-ai --remote
```

The normal, non-destructive paths are:

```bash
npm run db:migrate:local
npm run db:migrate:remote
```

They do not invoke `db:reset:local`. The D1 migration ledger ensures the table
creation in `0003` runs once, and its seed uses `INSERT OR IGNORE`, so it
preserves existing Knowledge rows with the same IDs. Before a production
migration, export a recoverable snapshot:

```bash
npx wrangler d1 export fixflow-ai --remote --output=fixflow-ai-backup.sql
```

Keep that export outside the repository if it can contain real customer data.
The included `0002_seed_demo_repairs.sql` inserts synthetic demo records; because
it is part of the migration chain, create a production-specific migration plan
before provisioning any database that must start without demo cases. There is
no remote reset npm script, by design.

## Browser-local AI requirements

Settings offers the officially precompiled Qwen 2.5 0.5B, 1.5B and 3B q4f16
variants included with WebLLM 0.2.84. The selected model is shared by intake
extraction and diagnostic analysis and is persisted in `localStorage`. Qwen 0.5B
(approximately 290 MB download and 945 MB estimated VRAM) is the minimum
compatible option. SmolLM2 is not selectable or used at runtime because physical
testing showed that it does not reliably follow the diagnostic JSON contract.

- Use a recent Google Chrome with WebGPU and hardware acceleration enabled.
- Selecting a model never downloads it. Download starts only from an explicit AI
  task or **Descargar y probar** in Settings.
- Download/load progress is shown in Settings and the AI task screens.
- WebLLM runs in a dedicated Web Worker so the interface remains responsive.
- Model artifacts use WebLLM's Cache API backend and are reused by the same
  browser origin on later visits.
- Settings can remove a model from cache only after an explicit confirmation.
- Changing models unloads the previous engine, and concurrent generations are
  rejected.
- No repair text or generated output is sent to an external LLM API.
- Diagnostic model output is schema-validated, and cited source IDs are rejected
  unless they belong to the documents retrieved for that analysis.

When WebGPU is unavailable, runs out of memory or loses the GPU device, FixFlow
shows a clear, model-specific warning, disables further AI attempts in that tab
and keeps manual intake and every CRUD action operational.

The hardware comparison and source-backed choice are documented in
[docs/model-selection.md](docs/model-selection.md).
The local diagnostic corpus and its primary references are documented in
[docs/knowledge-sources.md](docs/knowledge-sources.md).

### Explicit local model benchmark

Development builds expose a small real-browser benchmark in the Chrome console.
Loading the page only installs the helper; it does not load or download a model.
To inspect available IDs and run exactly one model, start the development server,
open Settings, then use DevTools:

```js
window.fixflowBenchmark.models
const result = await window.fixflowBenchmark.run(
  "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",
)
```

The explicit `run` call may download that model if it is not already cached. It
records whether the model was cached before the run, model load time, time to the
first complete non-streaming response, total time, `finish_reason`, strict JSON
validity, schema validity, and exact checks for one known Spanish intake case.
`firstCompletedResponseMs` is not time-to-first-token: the production extraction
call is non-streaming, so the benchmark does not invent a TTFT measurement.

Run the other model IDs individually only on hardware intended to test them.
Results are returned to the console and are not persisted, uploaded, or sent to
an external API. Browser and driver memory telemetry is not exposed reliably by
WebGPU, so the benchmark reports the catalog VRAM estimate separately and does
not claim measured GPU memory usage.

## Tests and build

```bash
npm run typecheck
npm test
npm run build
```

Persistence/API tests use Cloudflare's Workers Vitest integration. Migrations
are applied to an isolated, real local D1 binding in the `workerd` runtime; no
remote database or credentials are needed.

## Cloudflare deployment

Deployment is an explicit production operation; local development and tests do
not require a Cloudflare login. Authenticate and create the production database
once:

```bash
npx wrangler login
npx wrangler d1 create fixflow-ai
```

Copy the returned `database_id` into `wrangler.jsonc`, replacing the all-zero
placeholder, and confirm that the `DB` binding targets the intended account and
database. Review the pending list and take a D1 export before applying remote
migrations. Then run:

```bash
npm run db:migrate:remote
npm run deploy
```

Before the first authenticated deployment, upload the username and password
verifier as encrypted Worker secrets (interactive input avoids shell history):

```bash
npx wrangler secret put FIXFLOW_AUTH_USERNAME
npx wrangler secret put FIXFLOW_AUTH_PASSWORD_HASH
```

The verifier format is
`pbkdf2_sha256$100000$<base64url-salt>$<base64url-digest>`. Workers currently
caps its native PBKDF2 implementation at 100,000 iterations, so the proof-of-
concept uses a randomly generated high-entropy password, rate limiting, and
account lockout as compensating controls. Rotate the credential before using
real customer data; the current single shared identity does not provide
per-technician attribution or MFA.

`npm run deploy` performs typecheck/build before `wrangler deploy`; it does not
apply D1 migrations for you. The Worker serves `/api/*` first and uses the Vite
assets as an SPA for other routes. After deployment, verify `/api/health`, create
and read a disposable record only if production policy allows it, and confirm
that a direct navigation to `/settings` resolves through the SPA fallback.

Remote migration `0002_seed_demo_repairs.sql` inserts the demo dataset and
`0003_knowledge_documents.sql` inserts the 20 published technical documents.
Do not apply the demo repair seed to a database that should begin empty.

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
src/ai/local-model-benchmark.ts  Opt-in browser benchmark and known case
wrangler.jsonc        Worker, static assets and D1 binding configuration
```
