# System Map

> Plain-English mental model of how the app actually fits together, grounded in the real code.
> No need to read code to use this. When it drifts, ask Claude: *"Read the codebase and refresh
> docs/architecture/system-map.md."* Related: [[scale-register]], [[glossary]], [[ROADMAP]], [[VISION]].

## The stack (one line each)

- **Next.js 16.2** (app router) + **React 19** + **TypeScript** — `src/app/…`
- **Tailwind v4** — styling via design tokens (see [[DESIGN]]).
- **Prisma ORM → Neon serverless Postgres** — ~80 models in `prisma/schema.prisma` (2k+ lines).
- **better-auth** — authentication (`@node-rs/argon2` for password hashing).
- **Vercel** — hosting. `npm run build` runs `prisma migrate deploy` first, so **deploys apply migrations automatically**.
- **Sentry** — error monitoring (`instrumentation.ts`, `sentry.*.config.ts`) → auto-opens GitHub issues.

## How the code is organized
- `src/app/` — pages + API routes. Everything real lives under the **`(app)`** route group (inventory, lots, vessels, blend, bottling, compliance, samples, reports, assistant, settings, users, audit…). Auth pages (login, reset-password) sit outside it.
- `src/lib/<domain>/` — the brains. One folder per domain: `tenant`, `ledger`, `transform`, `cost`, `compliance`, `assistant`, `voice`, `blend`, `bottling`, `sparkling`, `cellar`, `ferment`, `harvest`, `vineyard`, `chemistry`, `inventory`, `stock`, `map`, etc.
- `src/components/` — UI. `src/styles/` — tokens.
- `scripts/` — verification + seeding (`verify:ttb`, `verify:cost`, `verify:reverse`, `seed:demo-tenant`, …).

---

## The major subsystems

### 1. Multi-tenancy + isolation (the backbone) — `src/lib/tenant/`
Every winery is a **tenant**. The tenant is carried through the request in an `AsyncLocalStorage`
context and **auto-injected** into every DB query, so app code rarely passes `tenantId` by hand.
Postgres **Row-Level Security (RLS)** enforces isolation at the database itself — the app connects
as the restricted **`app_rls`** role, which *cannot* bypass RLS.
- `context.ts` — `runAsTenant()`, `getTenantId()`, `requireTenantId()`, `injectTenantId()`.
- `tx.ts` — `runInTenantTx()` for transactions.
- `system.ts` — `runAsSystem()` for owner-level cross-tenant maintenance (bypasses RLS).
- `models.ts` — `GLOBAL_MODELS` denylist: the auth tables (User/Session/Account/Verification/Organization/Member/Invitation) are the **only** non-tenant-scoped tables.
→ This is the #1 area to watch as you grow. See [[scale-register]].

### 2. The lot ledger (the spine) — `src/lib/ledger/`
A **lot** is a tracked quantity of wine (`Lot`, `LotOperation`, `LotOperationLine`, `VesselLot`,
`LotLineage`, `LotStateEvent` in the schema). Every action is an **append-only operation**; current
state is *derived* from the ledger, not stored loosely.
- `write.ts` — `runLedgerWrite()`, the single guarded path for ledger writes.
- `actions.ts` — the server actions the UI calls.
- `reverse.ts` + `reverse-guard.ts` — the **universal Undo**: `reverseOperationCore` dispatches an undo for *every* operation family (rack, bottle, sparkling, crush, press, saignée, blend), unwinding in LIFO order with guardrails.
- `math.ts`, `vocabulary.ts` — volume math + naming.

### 3. Transforms (fruit → wine) — `src/lib/transform/`
The operations that change a lot's identity: `crush-core.ts` (`crushLotCore`), `press-core.ts`
(`pressLotCore`), and `reverse.ts` (`reverseTransformCore`) which restores stock + lineage on undo.

### 4. Cost engine (Phase 8a) — `src/lib/cost/`
Cost follows the wine. Fruit/supply cost attaches at crush and is carried, rolled up, and *negated on
reversal* through the same operations as the ledger.
- `rollup.ts`, `consume.ts`, `deplete.ts`, `cogs.ts`/`cogs-write.ts`, `policy.ts`, `reverse.ts`, `cache.ts`.
- Schema: `SupplyLot`, `CostLine`, `SupplyConsumption`, `OperationCostTransfer`, `LotCostState`, `BottlingCostSnapshot`.
- Cost is computed largely on read (rollup) — a scale watch-item, see [[scale-register]].

### 5. Compliance engines (Phase 14) — `src/lib/compliance/`
Generates the two federal TTB reports from the ledger:
- **5120.17** (operations) and **5000.24** (excise/tax) — **one shared table** (`ComplianceReport`),
  strictly separated by `formType` (`form-type.ts`, `form-map.ts`) so the two filing chains never cross.
- `cbma.ts` (tax-credit ladder), `excise.ts`/`generate-excise.ts`, `fill-pdf.ts`/`fill-5000-24-pdf.ts` (produce the actual PDFs via `pdf-lib`), `deadlines.ts` + `reminders.ts` + `ics.ts` (deadline reminders + calendar), `anomaly.ts`.

### 6. The assistant (chat + voice) — `src/lib/assistant/` + `src/lib/voice/`
A natural-language assistant over the whole app, powered by `@anthropic-ai/sdk`.
- `run.ts` — the tool-use loop; `tools/` + `registry.ts` — the actions it can take; `scope.ts` — permissions.
- **Writes require explicit confirmation:** `confirm.ts` + `commit.ts` (signed-token / single-use nonce).
- `conversations.ts` / `history.ts` — persisted, shared across text + voice.
- **Voice mode** reuses the *same* `/api/assistant` stream + tool loop (one brain); ElevenLabs does STT + TTS. Server key stays server-side.

### 7. Vineyard + maps — `src/lib/map/`, `src/lib/vineyard/`
Satellite basemap (Esri keyless, or Google Map Tiles if keyed) with drawable blocks (`leaflet` +
geoman), export to PNG or WGS84 shapefile.

## How a typical write flows
1. UI (or the assistant) calls a **server action**.
2. The action runs inside the **tenant context** → Prisma auto-injects `tenantId`; **RLS** enforces it at Postgres.
3. Ledger writes go through **`runLedgerWrite`**; the **cost engine** updates alongside.
4. Everything is reversible via the timeline **Undo** (`reverseOperationCore`).

---
*Refreshed 2026-07-02 from the live codebase (Next 16.2, ~80 Prisma models). Ask Claude to refresh after each phase.*
