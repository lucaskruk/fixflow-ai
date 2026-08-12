# FixFlow AI

FixFlow AI is a local-first proof of concept for laptop repair technicians. The
current vertical slice includes the React/Vite shell, a Hono API and Cloudflare
D1 persistence. The future browser-local AI remains isolated behind
`LocalAIService`; CRUD does not depend on AI availability.

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
src/                  React app and shared Zod domain contracts
worker/               Hono API, D1 repository and Workers tests
docs/seed-sources.md  Official source provenance for demo patterns
wrangler.jsonc        Worker, static assets and D1 binding configuration
```
