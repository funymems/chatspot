# ChatSpot — Implementation Plan (Stage 1)

## 1. Repository inspection (2026-10-10)

| Item | Finding |
|---|---|
| `C:\Users\Sultan\Desktop\chatspot` | Empty. No existing code, framework or conventions to preserve. |
| Git | The folder has no repo of its own. The enclosing repo is the **home directory** (`C:/Users/Sultan`, branch `master`, no commits). The project will get its own `git init` so it never touches the home-dir repo. |
| Node / npm | Node 22.11.0, npm 11.0.0 (no pnpm, so we use npm). |
| Docker | Installed (29.5.3), but the daemon is **not running**. The local Supabase stack needs it. |
| Supabase CLI | Available through `npx supabase` (2.120.0). |
| Current stable packages | next 16.4, @xyflow/react 12.12, @supabase/ssr 0.12, tailwindcss 4.3, zod 4.6, @anthropic-ai/sdk 0.133 |

Conclusion: greenfield project with the recommended stack.

## 2. Stack

- **Next.js 16 (App Router) + TypeScript strict** (`noUncheckedIndexedAccess` on)
- **Tailwind CSS 4 + shadcn/ui**, Lucide icons, Sonner toasts
- **@xyflow/react 12** for the builder
- **Local persistence (phase 1)**: PGlite (embedded Postgres) + Drizzle ORM/migrations, local cookie-session auth, local file storage. All of it sits behind interfaces, so Supabase (Postgres, Auth, Storage, RLS) can replace it later (see §8.1).
- **Zod 4**: one schema source for forms, server actions, the AI output and graph JSON
- **Recharts** for analytics
- **LLM**: server-only provider abstraction. The first implementation is Anthropic `claude-haiku-5-5`, chosen as the cheapest (see §8.2), plus a deterministic `MockLLMProvider`.
- **Testing**: Vitest (domain/engine unit tests), Playwright (Definition-of-Done smoke flows)
- Vercel-ready (`vercel.json` cron for the job worker)

## 3. Architecture

```
src/
  app/
    (auth)/login, signup, auth/callback
    (app)/w/[workspaceSlug]/
      dashboard | automations | automations/[id] (builder) | agents | agents/[id]
      contacts | contacts/[id] | conversations | templates | analytics | settings
    api/
      jobs/tick            ← cron/worker entry (secret-protected)
      channels/[provider]/webhook  ← future Instagram; mock only now
  components/
    ui/                    ← shadcn primitives
    shell/                 ← sidebar, workspace switcher, header, breadcrumbs
    builder/               ← canvas, palette, node components, config panels
    ...feature folders
  lib/
    domain/                ← PURE, framework-free, unit-tested
      graph/schema.ts      ← Zod: nodes, edges, per-node config (discriminated union)
      graph/validate.ts    ← structural + config validation → typed issues
      engine/              ← interpreter: node handlers, condition eval, templating
      variables.ts         ← {{contact.first_name}} resolution (no eval, ever)
    server/                ← 'server-only'
      auth.ts              ← getSession, requireWorkspaceMember(slug, role)
      db/                  ← typed repositories per aggregate
      services/            ← automations, executions, contacts, agents, knowledge…
      actions/             ← Server Actions: Zod-validate → authorize → service
      jobs/                ← scheduled_jobs queue + worker
    channels/
      types.ts             ← ChannelProvider: sendMessage, receiveEvent, verifyWebhook, getCapabilities
      mock.ts              ← MockChannelProvider (writes to internal inbox)
      registry.ts
    ai/
      provider.ts          ← LLMProvider interface
      anthropic.ts | mock.ts
      flow-generator.ts    ← NL → JSON → Zod → repair → validate
      agent-runtime.ts     ← retrieval + prompt assembly + handoff detection
drizzle/                   ← SQL migrations
src/lib/server/db/seed.ts  ← demo workspace + 8 templates
```

Rules: the UI never touches the DB directly for writes. Every server action re-derives the workspace from the slug/session and checks membership, ignoring any client `workspace_id`. The service-role key is used only inside `lib/server` for the job worker.

## 4. Data model (migrations)

Every row is workspace-scoped with `workspace_id`. In phase 1, isolation is enforced in the server data layer (§8.1). RLS policies using an `is_workspace_member(ws, min_role)` helper come with the Supabase migration.

| Table | Notes |
|---|---|
| users, sessions, profiles | local auth (hashed passwords, session tokens) |
| workspaces, workspace_members | roles: owner / admin / member. A personal workspace is auto-created on signup. |
| automations | name, description, status (`draft/active/inactive/error`), `current_version_id`, `published_version_id`, trigger summary columns for fast matching |
| automation_versions | immutable JSON graph `{nodes, edges, settings, trigger}`, `version` int, `schema_version` |
| automation_executions | version pinned; status `queued/running/waiting/completed/failed`; input event, result, step count, error, timestamps; `retry_of` |
| node_execution_logs | per node: input, output, branch taken, status, duration, error |
| scheduled_jobs | `run_at`, `kind`, payload, attempts, `locked_at`. Claimed with `FOR UPDATE SKIP LOCKED` via RPC. Used for delays and retries. |
| inbound_events | unique `(workspace_id, channel, external_event_id)`, so an event never executes twice |
| contacts | name fields, email, phone, `custom_fields jsonb`, source, lead_status, notes, last_interaction_at; `merged_into_id` |
| tags, contact_tags | normalised tags per workspace |
| conversations | contact, channel, status (`open/needs_human/resolved`), assignee, `is_test` |
| messages | `kind`: inbound / outbound_simulated / generated_reply / internal_note / system; `delivery_status` (`simulated` only for now) |
| ai_agents | role, tone, language behaviour, instructions, business info, fallback, escalation rules, enabled |
| knowledge_sources | text doc / Q&A / uploaded file per agent |
| knowledge_entries | chunked content + `tsvector` (GIN index) for retrieval |
| unanswered_questions | logged when retrieval finds nothing or the agent falls back |
| templates | global (seeded) + workspace templates; category; graph JSON |
| activity_events | audit/activity feed |
| notifications | internal (handoff and similar) |

Indexes cover the FKs, `(workspace_id, status)`, `(workspace_id, updated_at)`, contact email/phone, execution `(automation_id, started_at)`, and the job `run_at` partial index.

**Retrieval decision:** Postgres full-text search (`websearch_to_tsquery` + `ts_rank`) over chunked entries as the MVP. It's clearly scoped and needs no embeddings provider. The `knowledge_entries` table leaves room for an `embedding vector` column (pgvector) later.

## 5. Automation graph and engine

- **Node types**: `trigger`, `message`, `condition`, `action`, `ai_response`, `note`, `end`. Each has a Zod config schema, a builder config form, and an engine handler. `note` is excluded from execution and validation of the flow paths.
- **Validation** (`validate.ts`), run before activation and on save (save is allowed with errors in draft; activation is blocked):
  - exactly one trigger
  - every executable node reachable from the trigger
  - every non-end node's required outputs connected (condition: true and false)
  - at least one reachable `end`
  - no edges to or from notes
  - per-node config passes Zod
  - referenced agent, tag or flow exists in the workspace
  - cycles are allowed only if they pass through a wait/delay, and they're always capped by the step limit
- **Execution**: `startExecution(event)`. The event is first deduped by its `inbound_events` key, then matched to active automations (by trigger type and keyword/phrase rules). An execution row is created pinned to the published version, and the interpreter walks the nodes:
  - Hard limits: max 200 steps, a per-node timeout (AI 20 s, others 5 s), and total wall time.
  - Each node writes a `node_execution_logs` row.
  - A **delay** (message delay or wait action) persists state, enqueues a `scheduled_jobs` row, and sets the execution to `waiting`. It never sleeps in a request.
  - The worker (`/api/jobs/tick`, Vercel Cron in prod) resumes it. In dev, a "Process due jobs" control plus lightweight polling in the simulator does the same.
  - Retryable failures (AI provider timeout or 5xx) re-enqueue with backoff up to 3 attempts. Non-retryable ones fail the execution with the node error.
- **Outbound**: message nodes call `ChannelProvider.sendMessage`. `MockChannelProvider` writes `outbound_simulated` messages to the conversation, which the inbox and test panel show with a clear "Simulated" badge.

## 6. AI features

- **Flow generator**: the prompt contains the strict JSON schema (derived from the Zod schemas). The output goes through `JSON.parse`, then Zod parse, then deterministic repair (add a missing end, auto-layout, drop dangling edges), then `validate`. If it's still invalid, one LLM repair round with the issue list follows, and after that the result is rejected with the errors shown. Before saving, the user sees a preview on a read-only canvas. A generated flow is saved as a **draft**, never activated. Without an API key, a **demo mode** keyword-based generator produces deterministic graphs, and the UI labels it "Demo generator".
- **Agent runtime**: retrieve the top-k entries, then prompt with the system instructions, tone, language rule, business info, retrieved snippets (cited by id), and the last N turns. The agent has to answer only from the context or use the fallback. Handoff is detected by escalation rules (keywords) plus the model's structured `needs_human` flag. A handoff sets the conversation to `needs_human` and creates an internal notification. The used sources are returned to the test UI. Without a key, a mock provider answers from the top retrieved snippet and is labelled as mock.

## 7. Stage roadmap

| Stage | Deliverable | Verified by |
|---|---|---|
| 2 | Scaffold, design system, shell + sidebar, local auth, workspaces, **all migrations**, seed | typecheck, lint, isolation tests (cross-workspace denial) |
| 3 | Dashboard (real aggregates + empty states), automation CRUD, list, search, filter, duplicate, delete, lifecycle | unit + Playwright CRUD |
| 4 | React Flow builder: palette, canvas, config panel, all 7 node forms, undo/redo, minimap, save/restore | Playwright build-and-save |
| 5 | Graph validator, engine, job queue, test-run panel with live node status and simulated chat, execution history | Vitest engine suite (branches, loops, delays, dedupe, retries) |
| 6 | AI flow generator + preview; agents CRUD with all tabs; knowledge base + retrieval; test chat; handoff | Vitest (schema/repair), mock-provider E2E |
| 7 | Contacts CRM (incl. explicit merge), inbox, templates (8 seeded, valid graphs), analytics with date range | E2E per feature |
| 8 | Hardening: error boundaries, structured logger, security review, seed data, README / setup docs, full DoD run | full test suite + DoD checklist |

Each stage ends with `tsc --noEmit`, `eslint`, the tests, and a written summary of what works and what's left.

## 8. Decisions (resolved 2026-10-10)

### 8.1 Storage: local only, no Supabase yet
The user chose local storage for now. Browser `localStorage` is ruled out because the spec requires a server-side engine, server-validated permissions and a job queue, and none of that can live in one tab's storage. Instead:

- **Database: PGlite** (`@electric-sql/pglite`), real Postgres compiled to WASM and persisted to `./.data/pglite`, with **no Docker, no account, no network**. Accessed with **Drizzle ORM** and `drizzle-kit` migrations.
  - Because it is real Postgres, the planned schema (jsonb, tsvector full-text search, `FOR UPDATE SKIP LOCKED`, partial indexes) carries over unchanged. Moving to Supabase later is mostly a connection-string swap plus adding RLS policies.
  - Limits: one process (fine for `next dev` / `next start` on one machine), so it isn't suitable for serverless deployment until it's swapped for Supabase or Postgres.
- **Auth: local** email + password (argon2/bcrypt hash), with an httpOnly signed session cookie stored in a `sessions` table. It sits behind an `AuthProvider` interface so Supabase Auth can replace it later.
- **Isolation**: without Supabase there is no RLS layer. Every repository function takes an authorised `WorkspaceContext` produced by `requireWorkspaceMember()` and always filters by `workspace_id`. Cross-workspace tests cover this. RLS policies get added when moving to Supabase.
- **Files**: knowledge uploads go to `./.data/uploads` behind a `FileStorage` interface.
- **Dev worker**: delayed jobs are processed by an in-process interval worker (started once per server via `instrumentation.ts`) plus the `/api/jobs/tick` route.

### 8.2 LLM provider: Claude Haiku 5.5
Researched October 2026 list prices (input / output per 1M tokens):

| Model | Price | Note |
|---|---|---|
| **Claude Haiku 5.5** | **$0.10 / $0.50** | Official Anthropic price (≤100K-token prompts). Native structured outputs, which matter for flow generation. |
| Gemini 2.5 Flash-Lite | $0.10 / $0.40 | Reportedly being retired 16 Oct 2026. The successor 3.1 Flash-Lite is about $0.25 / $1.50. |
| DeepSeek V4-Flash | ~$0.14 / $0.28 | Sources disagree on peak/off-peak pricing. |
| OpenAI nano tier | $0.05–0.20 / $0.40–1.25 | Sources disagree on the current model and price. |

Choice: **`claude-haiku-5-5`** through the official `@anthropic-ai/sdk`. It's at the price floor of the major providers, and its structured-output support makes the AI flow generator reliable. Cost for this app's workload (short chats, ~2–4K-token prompts) is roughly $0.0005 per agent reply. The model ID is an env var (`AI_MODEL`), so it can be changed without code changes. **Mock mode** ($0) runs automatically when `ANTHROPIC_API_KEY` is unset.

## 9. Progress log

### Stage 2: done (2026-10-10)
- Next.js 16.4 (Cache Components + Partial Prefetching), Tailwind 4, shadcn/ui (Radix, Nova), theme tokens (dark sidebar, purple accent).
- PGlite + Drizzle with all 23 tables in `drizzle/0000_init.sql`, migrations applied automatically, and a process lock on the data dir.
- Local auth (scrypt, hashed session tokens, httpOnly cookie), sign-up/sign-in/sign-out, personal workspace on sign-up.
- Workspaces: create, switch, rename (admin+), member list, profile name. Non-members get a 404.
- App shell: collapsible sidebar (persisted), mobile drawer, workspace switcher, user menu, page header with breadcrumbs, skeletons.
- Sections for later stages show an explicit "not built yet / stage N" state with no actions.
- Checks: `tsc` strict, ESLint, 8 Vitest tests (auth, cross-workspace isolation, role checks, FTS index on EN/RU), `next build`.
- Note: PGlite runs in-process, so render-time data access must follow `connection()`, which `getOptionalUser`/`requireUser` already call.

### Stage 3: done (2026-10-10)
- Graph format v1 (`src/lib/domain/graph/schema.ts`): Zod configs for all 7 node types, handles, settings.
- Validator (`validate.ts`): one trigger, at least one reachable End, handle/edge integrity, required outputs (both condition branches), notes never connected, unreachable-node warnings, Tarjan cycle detection (a loop without a wait is an error), per-node config errors with field paths, workspace reference checks (agents, redirect targets).
- 8 built-in templates (one per category), synced into `templates` on every boot. Tests verify each one is valid.
- Automations service: list with search and status filter plus run stats, create (scratch or template), edit details, optimistic-concurrency graph save, duplicate, delete, activate (validates, then publishes an immutable content-hashed version, reusing identical ones), deactivate. "Unpublished changes" is detected by hash.
- UI: automations list (URL-backed search and filters, row menu, delete confirmation), create dialog (scratch / template / AI marked as stage 6), detail page (read-only React Flow preview, validation panel, details form, publishing info), dashboard with KPIs computed from the DB, performance, activity, conversations, quick actions, onboarding checklist.
- Checks: 35 tests (graph validator, all templates, automation lifecycle, cross-workspace isolation, dashboard metrics), tsc, ESLint, verified in the browser.
