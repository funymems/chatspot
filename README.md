# ChatSpot

A chat-automation workspace: visual conversation flows, AI agents grounded in a knowledge base, a contact CRM, a simulated inbox and analytics. This is an original implementation; external channels such as Instagram are planned for a later phase and are **simulated** for now.

See [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md) for the architecture and stage roadmap.

## Quick start

Requirements: Node.js 22+ and npm. No Docker, cloud account or API key is needed.

```bash
npm install
cp .env.example .env.local   # optional; every variable has a safe default
npm run db:seed              # creates the local DB and a demo account
npm run dev                  # http://localhost:3000
```

**Demo sign-in:** `demo@chatspot.local`. The password is in `src/lib/server/seed/index.ts` (`DEMO_ACCOUNT`). These are throwaway credentials that only work in your local database. You can also create your own account at `/signup`.

## Local persistence

Phase 1 stores everything locally:

| Concern | Phase 1 (now) | Planned swap |
|---|---|---|
| Database | [PGlite](https://pglite.dev) (Postgres compiled to WASM), persisted to `.data/pglite` | Supabase Postgres (same SQL migrations) |
| Auth | Email + password (scrypt), opaque session token in an httpOnly cookie, hashed in `sessions` | Supabase Auth |
| Tenant isolation | Enforced in the server data layer (`resolveWorkspaceAccess`) | + Row-Level Security policies |

PGlite is **single-process**:

- The dev server holds a lock on `.data/pglite`.
- Stop `npm run dev` before running `npm run db:seed` or `npm run db:reset`; the scripts refuse to run while it's up.
- Migrations in `drizzle/` are applied automatically the first time the database is opened.

## Deploying to Vercel with Supabase

Production uses hosted Postgres; the embedded PGlite database is for local development only.

1. **Supabase**: create a project and click **Connect**. Under **Transaction pooler** (port **6543**), copy the URI and put your database password in it.
2. **Vercel** → Settings → Environment Variables:
   - `DATABASE_URL`: the pooler URI from step 1
   - `APP_BASE_URL`: e.g. `https://chatspot-rho.vercel.app`
   - `TOKEN_ENCRYPTION_KEY`, `INSTAGRAM_*`, `GEMINI_API_KEY`: see the table below
   - `SUPPORT_EMAIL`: shown on `/privacy` and `/data-deletion`
   - `CRON_SECRET`: any long random string
3. **Deploy.** The `vercel-build` script runs `npm run db:migrate` (SQL migrations plus template sync) before `next build`, so every deploy migrates the database once, before the new code serves traffic. If `DATABASE_URL` is missing, the build fails on purpose.
4. **Background jobs** (automation delays, reply timeouts, retries): Vercel functions can't run a loop.
   - Instagram webhooks are processed right after each request via `after()`.
   - `vercel.json` adds a daily cron as a fallback; Hobby plans allow only daily crons.
   - For minute-level timing, schedule a call from Supabase (Database → Cron, `pg_cron` + `pg_net`):

     ```sql
     select cron.schedule('chatspot-jobs', '* * * * *', $$
       select net.http_post(
         url := 'https://YOUR-DOMAIN/api/jobs/tick',
         headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET')
       )
     $$);
     ```

TLS: the connection is encrypted. To also verify Supabase's certificate, put its CA certificate (PEM) in `DATABASE_SSL_CA`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run check` | Typecheck, lint and run all tests |
| `npm run typecheck` | `next typegen` + `tsc --noEmit` (strict, `noUncheckedIndexedAccess`) |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm test` | Vitest. Tests use a fresh in-memory PGlite per file. |
| `npm run db:generate` | Generate a SQL migration after editing `src/lib/server/db/schema.ts` |
| `npm run db:seed` | Idempotently create the demo account and workspace |
| `npm run db:reset` | Delete the local database, re-migrate and re-seed |
| `npm run db:migrate` | Migrate `DATABASE_URL` (Postgres/Supabase) if set, otherwise the local PGlite DB |

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | *(empty)* | Postgres connection string (Supabase transaction pooler). When set, it replaces the local PGlite database. Required on Vercel. |
| `PGLITE_DATA_DIR` | `.data/pglite` | Local only. Use `memory://` for a throwaway in-memory DB |
| `SUPPORT_EMAIL` | *(empty)* | Contact address on `/privacy` and `/data-deletion` |
| `GEMINI_API_KEY` | *(empty)* | Server-only Google Gemini key ([get one](https://aistudio.google.com/apikey)). When empty, AI features run in a clearly labelled deterministic demo mode. |
| `AI_MODEL` | `gemini-3.5-flash-lite` | $0.30 / $2.50 per 1M tokens. For smarter answers try `gemini-3.8-flash`. |
| `APP_BASE_URL`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_WEBHOOK_VERIFY_TOKEN`, `TOKEN_ENCRYPTION_KEY` | *(empty)* | Instagram integration. See [docs/INSTAGRAM_INTEGRATION_REPORT.txt](docs/INSTAGRAM_INTEGRATION_REPORT.txt) |
| `JOB_WORKER` | *(on)* | `off` disables the dev job ticker (use a cron calling `/api/jobs/tick` instead) |
| `CRON_SECRET` | *(empty)* | Bearer token accepted by `/api/jobs/tick` |
| `LOG_LEVEL` | `info` | Structured JSON logs: `debug` / `info` / `warn` / `error` |

Secrets are only read in server modules (`import "server-only"`) and are never sent to the browser.

## Project layout

```
src/app/(auth)            sign-in / sign-up pages and actions
src/app/w/[slug]/...      authenticated workspace app (one segment per section)
src/app/actions           Server Actions (validate → authorise → service)
src/components/ui         shadcn/ui primitives
src/components/shell      app shell: sidebar, workspace switcher, user menu, page header
src/lib/server/db         Drizzle schema + PGlite client
src/lib/server/auth       sessions, password hashing, guards
src/lib/server/services   business logic (workspace-scoped)
src/lib/validation        Zod schemas shared by forms and actions
drizzle/                  SQL migrations
tests/                    integration tests
```

## Security notes

- Every workspace-scoped read or write goes through a `WorkspaceContext`, which only `resolveWorkspaceAccess(userId, slug)` creates. Workspace IDs from the client are never trusted.
- Non-members get a 404 for a workspace, so slugs don't leak.
- `src/proxy.ts` is only an optimistic redirect. The real checks happen next to the data.
- Server Actions validate input with Zod and return generic errors for unexpected failures. Details go to the structured log, not the client.
