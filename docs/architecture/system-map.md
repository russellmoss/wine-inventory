# System Map

> Plain-English mental model of how the app actually fits together, grounded in the real code.
> No need to read code to use this. When it drifts, ask Claude: *"Read the codebase and refresh
> docs/architecture/system-map.md."* Related: [[scale-register]], [[glossary]], [[ROADMAP]], [[VISION]].

## The stack (one line each)

- **Next.js 16.2** (app router) + **React 19** + **TypeScript** — `src/app/…`
- **Tailwind v4** — styling via design tokens (see [[DESIGN]]).
- **Prisma ORM → Neon serverless Postgres** — ~70 models in `prisma/schema.prisma` (2k+ lines).
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
- `tx.ts` — `runInTenantTx()` for model-write transactions, **plus `runInTenantRawTx()`** (Phase 8b / plan 029): the ONLY safe way to run raw `$queryRaw`/`$executeRaw`. Raw calls bypass the Prisma extension (it only hooks *model* operations), so they'd run with no `app.tenant_id` GUC → RLS matches zero rows (silent-empty in prod) and would leak cross-tenant if RLS were relaxed. `runInTenantRawTx` sets the GUC as the first statement and hands the callback the resolved `tenantId` for an explicit predicate.
- `resolve.ts` — single source of truth for session-based tenant resolution, shared by the Prisma extension and `runInTenantRawTx` so raw and model queries can never scope to different tenants.
- `system.ts` — `runAsSystem()` for owner-level cross-tenant maintenance (bypasses RLS).
- `models.ts` — `GLOBAL_MODELS` denylist: the auth tables (User/Session/Account/Verification/Organization/Member/Invitation) are the **only** non-tenant-scoped tables.
- **Guard:** `scripts/check-raw-sql-tenant-safety.ts` (`npm run verify:raw-sql`, wired into CI) statically fails if any raw call is made directly on a top-level client (`prisma`/`prismaBase`) outside the three allowlisted GUC-setters.
→ This is the #1 area to watch as you grow. See [[scale-register]] + [[security-register]].

### 2. The lot ledger (the spine) — `src/lib/ledger/`
A **lot** is a tracked quantity of wine (`Lot`, `LotOperation`, `LotOperationLine`, `VesselLot`,
`LotLineage`, `LotStateEvent` in the schema). Every action is an **append-only operation**; current
state is *derived* from the ledger, not stored loosely.
- `write.ts` — `runLedgerWrite()`, the single guarded path for ledger writes.
- `actions.ts` — the server actions the UI calls.
- `reverse.ts` + `reverse-guard.ts` — the **universal Undo**: `reverseOperationCore` dispatches an undo for *every* operation family (rack, bottle, sparkling, crush, press, saignée, blend), unwinding in LIFO order with guardrails.
- `math.ts`, `vocabulary.ts` — volume math + naming.
- **Deterministic folds at the chokepoint:** `writeLotOperation` runs a fixed set of projections once per op. Phase 8b adds a *fourth* — the **barrel-fill fold** (`cost/barrel-fold.ts`), run after the VesselLot diff to open/close barrel fills; it's a no-op unless an affected vessel is a barrel with a `BarrelAsset`.

### 3. Transforms (fruit → wine) — `src/lib/transform/`
The operations that change a lot's identity: `crush-core.ts` (`crushLotCore`), `press-core.ts`
(`pressLotCore`), and `reverse.ts` (`reverseTransformCore`) which restores stock + lineage on undo.

### 4. Cost engine (Phase 8a + 8b) — `src/lib/cost/`
Cost follows the wine. Fruit/supply cost attaches at crush and is carried, rolled up, and *negated on
reversal* through the same operations as the ledger.
- **Core (8a):** `rollup.ts`, `consume.ts`, `deplete.ts`, `cogs.ts`/`cogs-write.ts`, `policy.ts`, `reverse.ts`, `cache.ts`, `data.ts`.
- **Barrel amortization (8b, D7):** `barrel.ts` (PURE SYD accelerated depreciation over a barrel's fill-life; cost splits by volume × time) + `barrel-fold.ts` (the ledger-chokepoint fold that opens/closes fills and materializes a BARREL `CostLine` on close).
- **Post-bottling variance (8b, D12/D17):** `variance.ts` (PURE sold/unsold delta split) + `variance-detect.ts` — a backdated correction that changes a bottled lot's basis NEVER restates the frozen COGS snapshot; it emits an append-only `CostVarianceEvent` (sold → period COGS variance, on-hand → inventory-value adjustment).
- **Accounting export seam (8b, D18):** `export.ts` (PURE mapping to debit/credit lines) + `export-emit.ts` — expands each frozen snapshot/variance into immutable, idempotent, reversible `CostExportEvent` lines (per capitalized component) that a future Phase-15 layer posts as-is; incomplete-basis sources are withheld.
- **Bulk-wine receive-with-cost (8b, D20):** `receive.ts` — injects a MATERIAL `CostLine` as a mid-DAG cost node so purchased bulk wine capitalizes and rolls up like fruit/material cost.
- Schema: `SupplyLot`, `CostLine`, `SupplyConsumption`, `OperationCostTransfer`, `LotCostState`, `BottlingCostSnapshot`, `BarrelAsset`, `BarrelFill`, `CostVarianceEvent`, `AccountMapping`, `CostExportEvent`.
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
*Refreshed 2026-07-03 from the live codebase (Next 16.2, ~70 Prisma models; through Phase 8b cost + plan-029 raw-SQL tenant safety). Ask Claude to refresh after each phase.*
