---
title: Unified Inventory — one page, four sections, per-location consumables, costed equipment, manual+AI invoice, full assistant coverage
type: refactor
status: in-progress (Waves 1-3 SHIPPED — PRs #351, #376, #392; Wave 4 / U14-U17 BUILT on claude/plan-080-wave-4, PR not yet opened)
date: 2026-07-19
branch: shipped via PR #351 (Wave 1) + PR #376 (Wave 2)
depth: deep
units: 16
---

> **HARDENED 2026-07-19** via `/plan-eng-review` (4 findings) + `/council` (Codex gpt-5.4 + Gemini 3.1-pro,
> 7 criticals + 12 should-fixes) — see `council-feedback.md` and the review report at the end. Key council
> reversals folded in: consumption uses **negative-stock-at-location + reconcile flag** (NOT a silent
> all-location fallback); finished-goods cost lives in a **`FinishedGoodReceipt` weighted-avg cost-layer**
> (NOT a mutable SKU column); mixed invoices get **per-line GL routing** (pump→Fixed Assets, clamp→Supplies
> Expense, wine→Inventory Asset); `targetKind` is **required, no MATERIAL default**; transfer provenance via
> **`splitFromLotId` lineage** (NOT row-copy); the **In-progress section is DROPPED** → 3 sections, not 4.

## Overview

Collapse the scattered inventory surfaces (`/inventory` finished-goods + `/setup/expendables` +
`/setup/equipment` + `/locations`) into ONE tabbed Inventory page with three sections: Finished goods
(Wine / Merchandise), Consumables (today's Expendables), and Equipment & parts. (In-progress wine stays on
the vessel/cellar boards — the read-only in-progress tab was dropped in council.) Along the way: give
consumables the same per-location Receive/Adjust/Transfer that bottled wine
already has, make equipment costed (invoice + A/P), add a manual invoice-entry path that posts identically
to the AI uploader, rename "Expendables" → "Consumables" everywhere, and guarantee the AI assistant can
drive every one of these actions.

The point: a winery operator with a pump in the White Cellar and cases in the Sparkling Warehouse should
open ONE page, see where everything physically is, and bring new stock in with or without AI help. Today
they can't sort or locate anything, and consumables have no location at all.

## Problem Frame

Russell declined the band-aid (a one-item nav regroup, feedback `cmrquh58r0005l504k7w7b6oy` / #271) and
escalated to a full refactor. The current layout is "awful and hard to manage, hard to sort, and see where
everything is." Two root causes:

1. **Split IA.** Finished goods live at `/inventory`; raw consumables at `/setup/expendables`; equipment at
   an unlinked `/setup/equipment`; locations at `/locations`. No single place answers "what do we have and
   where is it."
2. **Consumables have no location dimension at all.** `CellarMaterial`/`SupplyLot` track a single flat
   on-hand total (Σ `qtyRemaining` over open lots) with no `locationId`. You cannot say "2 bags of KMBS in
   the Lab, 1 in Red Cellar." Bottled wine already has full per-location movement; consumables don't.

Do nothing → the operator keeps guessing where physical stock is, intake stays disjointed (AI-only, no
manual fallback), and equipment purchases never hit the books.

## Requirements

- MUST: ONE `/inventory` page, three sections (Finished goods {Wine, Merchandise}, Consumables, Equipment &
  parts). Old routes redirect in. (In-progress dropped in council — stays on vessel/cellar boards.)
- MUST: Consumables get FULL per-location parity with wine — per-location on-hand + Receive / Adjust /
  Transfer. Location is a required dimension on every consumable intake and move.
- MUST: Location required on EVERY intake across all four sections (managed flat list, existing `Location`
  model).
- MUST: Rename "Expendables" → "Consumables" in all user-facing nav, titles, labels, copy, and assistant
  tool *descriptions*. Do NOT rename internal identifiers (`CellarMaterial`, `SupplyLot`, tool `name`
  strings, committer keys, golden-case keys).
- MUST: Rename "+ Ingest invoice" → "+ Add invoice"; every invoice entry point offers Enter manually vs
  Use AI uploader. Same captured fields either way.
- MUST: Build a manual multi-line invoice entry form that posts to accounting IDENTICALLY to the AI path
  (one aggregate A/P Bill per invoice — AP-1; base-currency cost — COST-4).
- MUST: Equipment & parts reuse/extend the existing `EquipmentAsset` registry (individual assets) and the
  EQUIPMENT-category `CellarMaterial` (quantity-tracked parts). Equipment becomes costed: invoice (manual or
  AI) + purchase cost + A/P/QBO posting like consumables.
- MUST: The assistant can fully manage the refactored system — a write tool for every create / receive /
  adjust / transfer / add-invoice / add-finished-good / add-consumable / add-equipment action, with
  confirm-before-write for every money/stock write. `verify:ai-native`, `verify:parity`, `eval:assistant`
  stay green.
- MUST: Preserve tenant isolation (Phase-12 checklist) and all governed-money invariants (COST-1/2/4,
  AP-1, WORKORDER-3/7).
- SHOULD: Finished-goods "+ Add inventory" modal — category (pick/create), SKU, name; wine → vintage
  (optional, soft-confirm if blank), MSRP, COGS; optional opening qty + location inline. Merch / externally
  purchased wine can also come in via the invoice uploader (COGS from invoice).
- SHOULD: `+ Add equipment` modal lets the user choose "equipment = individual asset" vs "part =
  quantity-tracked" (classification drives capitalization: Equipment→Fixed Asset, Parts→expensed).
- NICE: Narrow the generic `adjust_inventory` / fence `db_create`/`db_update` now that typed inventory
  tools exist (already-flagged assistant-coverage follow-ups).

## Scope Boundaries

**In scope:**
- Per-location consumables stock (schema + cores + UI + assistant tools).
- Costed equipment (schema + intake + A/P) and the mixed-invoice apply path.
- Manual invoice entry form + manual/AI chooser.
- Unified tabbed IA + four section surfaces + route redirects.
- Full assistant/MCP tool coverage + golden/fleet cases + coverage-doc regen.
- Expendables → Consumables rename (user-facing only).
- Migrations + backfills + tenant-isolation cases + docs/registers refresh.

**Out of scope:**
- Changing how bottled wine flows from bottling (unchanged — COGS still auto-loaded).
- In-progress goods editing (stays in `/lots`, `/bulk`, `/ferment`).
- Renaming DB models/tables/columns or assistant tool `name` strings (cosmetic-internal, high blast radius,
  zero user value).
- Equipment maintenance/scheduling beyond the existing status field.
- Accountant GL sign-off on the equipment-capitalization posting direction (flag for review, not a blocker).

## Research Summary

### Codebase Patterns

**Stock movement engine to replicate for consumables** — `src/lib/stock/movements.ts`:
- `receiveStock` (l.132) / `adjustStock` (l.152, signed non-zero delta, reason required) / `transferStock`
  (l.211). Internal helpers: `movementCreate` (l.34, signed `deltaUnits`), `increment` (l.61, upsert on
  composite unique), `decrement` (l.77 — **race-safe conditional `updateMany` with a `gte` guard →
  `count > 0`**, never goes negative, no `SELECT FOR UPDATE`), `balanceAt` (l.93, failure-path),
  `decrementSourceOrExplain` (l.109, empty-vs-shortfall message). Transfer writes both legs with one
  `transferGroupId = crypto.randomUUID()` and touches location rows in **sorted order** (l.224-232) to avoid
  deadlock (LEDGER-5). All wrap `withWriteRetry(() => runInTenantTx(...))` — NOT `runLedgerWrite`.
- `moveStock` dispatcher (`src/lib/inventory/actions.ts:81`) is a `safeAction` (blocked-move reason must
  survive prod redaction).
- Balance models: `BottledInventory` / `FinishedGoodInventory`, both `@@unique([tenantId, itemId,
  locationId])`, `Int` balance. `StockMovement` append-only, `ItemKind`+`MovementKind` enums.

**Consumables cost/on-hand today (NO location anywhere)** — `src/lib/cellar/materials.ts`:
- `listMaterials` (l.94) sums `qtyRemaining` over open `SupplyLot`s (l.126) with **no location grouping** —
  this is the function that must become location-aware.
- `createStockMaterialCore` (l.293, accepts `injectedTx`), `updateMaterialCore` (l.379, never touches
  existing lots; `stockUnit` pinned once any lot exists), `receiveSupplyCore` (l.517, `skipApEmit` flag).
- FIFO draw: `depleteSupplyLotsTx` (`src/lib/cost/consume.ts:45`, reads open lots with **no location
  filter**), `planDepletion` (`src/lib/cost/deplete.ts:58`, oldest-first). `consumeMaterialCore` (l.106) is
  the dose adapter (activeFraction, UNKNOWN-cost on unconvertible).
- `SupplyLot` (`prisma/schema.prisma:2689`): decimal `qtyReceived`/`qtyRemaining`, `unitCost?` (null=unknown,
  ALWAYS base currency), FX quintet, `vendorId?`, `policyVersion`. **No `locationId`** — the central gap.

**Invoice ingest → accounting apply (the core the manual form must reuse)** —
`src/lib/ingest/ingest-invoice-core.ts`:
- Three stages: `createIngestedInvoiceCore` (l.64, stage header + `createMany` lines), edit cores, and
  **`applyIngestedInvoiceCore` (l.285)** — one `runInTenantTx` doing: concurrency claim → duplicate guard →
  doc-type gate → `allocateLandedCost` → reconciliation + partial-A/P gates (`needsAck`) → vendor
  find-or-create → FX resolve → per-line `createStockMaterialCore(openingQty:0)` or find + `normalizeLineToStock`
  + `receiveSupplyCore(skipApEmit:true)` + `LotDocument` → **ONE `emitApExportForInvoice`** (AP-1) → COA
  attach → mark applied. **Returns `{ok:false, needsAck}`, never throws.**
- A/P: `emitApExportForInvoice` (`src/lib/accounting/ap-emit.ts:133`, `postingKey = apinv:<id>`, builds
  `ApBillLine[]`, upserts PENDING `AccountingDelivery`). Manual single-lot receipts keep the per-lot
  `emitApExportForReceipt` (`ap:<lotId>`) path.
- Line shape a manual form maps onto: `IngestedInvoiceLine` (`prisma/schema.prisma:3485`).
- Pure helpers: `allocateLandedCost` (`landed-cost.ts:48`, tax excluded, unknown lines absorb nothing),
  `normalizeLineToStock` (`normalize-line.ts:45`, cross-dimension → null, never raw qty).

**Assistant tool architecture** — `src/lib/assistant/`:
- `registry.ts` (`AssistantTool` type l.25, `ALL_TOOLS` l.110, `getToolsFor` l.192). A write tool = the
  `run()` returning `signProposal(...)` + `needsConfirmation` (NO mutation) plus an exported `Committer`.
  `confirm.ts` (`signProposal` l.33 HMAC 5-min single-use nonce; `signResume` l.49 for picker choices;
  `verifyProposal` l.56). `commit.ts` (`COMMITTERS` map l.74; `commitProposal` l.132 burns nonce via
  `AssistantConfirmation` unique constraint). Template to copy: `tools/receive-supply.ts` (uses
  `pickMaterial`, `signProposal("receive_supply",…)`, `commitReceiveSupply → receiveSupplyAction`).
- A new write tool touches: `tools/<new>.ts`, `registry.ts` (import + `ALL_TOOLS`), `commit.ts` (import +
  `COMMITTERS`), `test/evals/assistant-write-tools.golden.ts` (+ fleet golden), and needs its wrapped
  `*-core.ts` reachable in the import graph.

**Parity guards** — `verify:ai-native` (`scripts/verify-ai-native.mjs`) fails if any `src/lib/**/*-core.ts`
exporting `*Core` is not transitively imported from a tool/registry (unless allowlisted
`INTERNAL`/`GAP_ALLOWLIST` with `MAX_ALLOWED`, which only shrinks). Regenerate coverage doc with
`npm run verify:ai-native -- --write`. `verify:parity` checks `covered` notes' `evidence:` paths resolve
(no "expendable" strings there — rename is parity-safe unless an evidence path points at a renamed folder).
`eval:assistant` fails a `kind:"write"` tool with no golden and no `UNCOVERED_OK` entry.

**Nav / IA** — `src/components/AppShell.tsx` `SETUP` array: `/locations` (l.47), `/setup/expendables`
"Expendables" (l.49). Equipment + finished-goods are NOT in the sidebar (finished-goods already
`redirect("/inventory")`). In-page tabs: `src/components/ui/Tabs.tsx` (all panels stay mounted) or the
URL-driven segmented `work-orders/WorkOrdersTabs.tsx` (`?view=…`, deep-linkable). No `setup/layout.tsx`.

### Prior Learnings (memory-note vault — see caveat below)

- **`ticket271-expendables-inventory-refactor`** — the charter; "Expendables" is a pure nav grouping,
  material `kind`/`category` are plain String columns (no Prisma enum) → rename is TS-const + UI, not a
  migration.
- **`plan053-work-order-builder`** — "Location ALREADY EXISTS — EXTEND, do NOT duplicate." `EquipmentAsset`
  is already a tenant-scoped RLS table with `/setup/equipment` CRUD + `work_order_task_equipment` join.
  Roles are owner/admin only (no "winemaker" role). **Client Component importing a VALUE export from a
  `src/lib` module that transitively imports prisma passes `tsc`+`check` CI but FAILS Vercel `next build`
  → run `npx next build` locally before merge; fix with a client-safe `*-shared.ts`/`vocab.ts`.**
- **`intake-ap-uom-gotchas`** — A/P asymmetry (`createStockMaterialCore` emits NO A/P; only
  `receiveSupplyCore` does → create-at-zero then receive); invoice units ≠ stock units (convert first);
  QBO `DocNumber` per-lot idempotency; `isDoseableCategory` is an ALLOWLIST (`UNCLASSIFIED`/`EQUIPMENT`
  non-doseable); cost cores accept an optional `injectedTx` for atomic multi-line apply.
- **`plan037-expendables-view-edit`** — `stockUnit` PINNED once any lot exists; material has NO stored
  price column (cost = read-only weighted-avg of open lots, null=unknown D14); edit NEVER touches existing
  `SupplyLot`/`CostLine` (D17).
- **`plan075-custom-units`** — **list/read cores called from server components must use the extended
  `prisma`, NOT `runInTenantTx`** (ALS-less → 500).
- **`prismabase-rls-zero-rows`** — `prismaBase` on an RLS table with no tenant GUC returns 0 rows; use
  `runAsSystem` for cross-tenant backfills.
- **`prisma-neon-migrations-windows`** — hand-author SQL via `prisma migrate diff --from-url … | grep -v
  search_vector`, then `migrate deploy` + `generate`; stop the dev server before `generate`; isolated
  `ALTER TYPE` for any new enum value (we're using strings, so this mostly doesn't bite).
- **`build-in-main-checkout-not-worktrees`** — builds/`verify:*` run in the MAIN checkout (has `.env` +
  node_modules), not `.claude/worktrees/*`.
- **`parity-ai-native-registers`** / **`assistant-coverage-waves`** — new `*-core.ts` breaks
  `verify:ai-native` until wired to a tool; every write tool needs a golden (+ fleet) case; the "marginal
  tool degrades the whole surface" stop rule; flagged follow-ups: fence `db_create`/`db_update`, narrow
  `adjust_inventory`.

### External Research
None needed — no new frameworks. All primitives (Prisma, `Tabs.tsx`, the stock ledger, the ingest apply
core, the assistant registry) already exist in-repo.

**Caveat surfaced by research:** the two automated memory stores this project is supposed to use are
effectively empty — the rstack learnings CLI bin is absent on this box, and the context-ledger has zero
confirmed precedents (only stale unreviewed Phase-6 drafts). All institutional memory above came from the
`~/.claude/projects/.../memory/` note vault. Worth fixing separately; not a blocker here.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where does consumable location live? | `locationId` on `SupplyLot` (FIFO cost lots become per-location); on-hand = GROUP BY location over open lots | Separate integer physical-balance table (`MaterialInventory`) layered over cost-agnostic lots | Keeps cost lineage and physical location on the SAME row; no double-book, no cost/location desync. One nullable-then-NOT-NULL column + index vs a whole new table + reconciliation. Cost-correct by construction. |
| Consumable transfer semantics | Lot-SPLIT: draw qty from source lot(s) oldest-first, create destination `SupplyLot`(s) carrying same `unitCost`/`receivedAt`/`policyVersion`, record movement w/ `transferGroupId` | Whole-lot relocate; or a location-agnostic "balance" transfer | Split preserves FIFO age + weighted-avg cost per location and supports partial transfers. Whole-lot relocate can't do partials; balance transfer loses cost. |
| Shortfall on user transfer/adjust | Throw specific `ActionError` ("only N at X" / "none at X") | Draw-to-zero + report | A user-initiated move is deliberate — a clear block matches the wine-stock UX. |
| Consumption from an empty location (council C1) | **Allow NEGATIVE at that location** at a KNOWN weighted-avg cost + flag for cycle-count reconciliation | Silent all-location FIFO fallback (eng-review, REJECTED); explicit `unassigned` bucket; hard-require source | Both models: a silent cross-location pull fabricates location balances. Negative is truthful ("used here, owe a receipt"), self-correcting, keeps COGS KNOWN. |
| Finished-goods cost (council C4) | `FinishedGoodReceipt` weighted-avg cost-layer for 3rd-party/merch; internally-bottled keeps specific-lot from bottling | Mutable `unitCogs` on the SKU (REJECTED: dual source of truth, no history); last-cost (REJECTED: whipsaws COGS) | A single mutable column isn't a governed cost model; weighted-avg receipts preserve valuation + history. |
| Mixed-invoice GL routing (council C3) | Per-line GL account by category (Fixed Assets / Supplies Expense / Inventory Asset); bill stays ONE (AP-1) | One debit account for the whole bill (REJECTED: corrupts the balance sheet) | Lines span asset/expense/inventory — each must code to its own account or the books are wrong. |
| Manual invoice A/P path | Route through `applyIngestedInvoiceCore` (stage a synthetic `IngestedInvoice`+lines, then apply) | Hand-roll A/P in a new core | Reuses dedup, landed-cost, FX, reconciliation gates, and the single aggregate `emitApExportForInvoice` → AP-1 + COST-4 satisfied by construction. Hand-rolling risks per-line bills (AP-1 violation). |
| Equipment costing / mixed invoice | Extend `IngestedInvoiceLine` with a REQUIRED target discriminator (no default, council C2); asset lines → N `EquipmentAsset`s via a join table (C5); one aggregate bill w/ per-line GL | Separate equipment-only path; single-FK per line (REJECTED: can't do qty>1); default MATERIAL (REJECTED: silent misposting) | One invoice mixes a pump + clamps + merch; ONE bill preserves AP-1; required target prevents silent misposting. Wave 3, alone. |
| Rename scope | User-facing copy + nav + tool *descriptions* + a `/setup/expendables` → `/inventory?section=consumables` redirect. Keep model/table/tool-name/committer/golden identifiers | Full rename incl. route segment + component names + DB | Charter says rename is UI-only; renaming tool `name`s/committer keys would break `COMMITTERS`, goldens, `UNCOVERED_OK`, parity evidence for zero user value. |
| IA mechanism | URL-driven segmented tabs on `/inventory` (`?section=…`, deep-linkable), panels lazy per section | `Tabs.tsx` (all panels mounted) | Deep links (assistant `navigate`, redirects from old routes) need addressable sections; avoids mounting four heavy data panels at once. |

## Implementation Units

> Sequencing: schema/cores first (Units 1-5), then IA + section UIs (6-10), then rename (11), then
> assistant coverage (12), then the verify/guardrail/backfill sweep (13). Units 1-3 are independent schema
> units and can go in parallel; 4-5 depend on 1-3; UIs depend on their cores.

### Unit 1: Per-location dimension on consumables — schema + migration

**Goal:** Add `locationId` to `SupplyLot` (+ movement provenance) so consumable stock is tracked per
location, following the Phase-12 tenant-scoped checklist.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_supplylot_location/migration.sql`,
`scripts/backfill-supplylot-location.ts`, `src/lib/tenant/models.ts` (confirm NOT in GLOBAL_MODELS),
`docs/architecture/system-map.md`.
**Approach (deploy-safe expand/contract — council S7):** add `locationId String?` **NULLABLE, NO
`@default("")`** (a `""` default lets a stale writer insert `''` → FK failure). Also add `splitFromLotId
String?` (transfer lineage, council S2) + `@@index([tenantId, locationId])` +
`@@index([tenantId, materialId, locationId, receivedAt, id])` (per-location FIFO scan with a deterministic
`(receivedAt, id)` tiebreak). Sequence: (1) **ensure/resolve the system "Winery" `Location` per tenant
FIRST** (create if missing — the backfill must not assume it exists), (2) add nullable column, (3) deploy
ALL writers with an explicit `locationId`, (4) backfill every existing `SupplyLot` to its tenant's system
location (`runAsSystem`, per-tenant loop), (5) add composite FK `(tenantId, locationId) → location(tenantId,
id)` ON DELETE RESTRICT + validate, (6) `ALTER COLUMN locationId SET NOT NULL`. Add a `MaterialMovement`
event table (append-only, mirrors `StockMovement`: `materialId`, `locationId`, `kind` RECEIVE|ADJUST|
TRANSFER|CONSUME, signed `deltaQty Decimal`, `supplyLotId?`, `transferGroupId?`, `reason?`) with
**composite FKs** `(tenantId, materialId)`, `(tenantId, locationId)`, `(tenantId, supplyLotId)` (council S3 —
append-only audit must not point at nonsense). `kind` stays a validated string to match the house pattern,
but is CHECK-constrained to the four values. Full RLS on `MaterialMovement` (ENABLE + FORCE +
`tenant_isolation` USING+WITH CHECK), app_rls grants, composite `@@unique([tenantId, id])`.
**Tests:** `test/tenant-isolation.test.ts` + `scripts/verify-tenant-isolation.ts` cases for `SupplyLot`
(location FK) and `MaterialMovement`. Migration idempotency check.
**Depends on:** none
**Execution note:** Windows migration rule — author SQL via `prisma migrate diff … | grep -v
search_vector`, `migrate deploy`, then `generate` (dev server stopped).
**Patterns to follow:** `BottledInventory` composite unique + FK (`schema.prisma:783`); `StockMovement`
(`:754`); AGENTS.md 9-step checklist.
**Verification:** `npm run verify:tenant-isolation` green incl. new cases; backfill leaves 0 null
`locationId` on Demo.

### Unit 2: Location-aware consumables cores (receive / adjust / transfer / consume)

**Goal:** Replicate the wine stock engine for consumables — per-location on-hand + race-safe
Receive/Adjust/Transfer with lot-split — and make FIFO consumption location-aware.
**Files:** `src/lib/cellar/material-stock-core.ts` (NEW — `receiveConsumableCore`, `adjustConsumableCore`,
`transferConsumableCore`), `src/lib/cellar/materials.ts` (make `listMaterials` group on-hand by location;
add `onHandByLocation`), `src/lib/cost/consume.ts` (`depleteSupplyLotsTx` optional `locationId` filter),
`src/lib/cost/deplete.ts` (location-scoped `available`), `src/lib/cellar/actions.ts` (safeAction wrappers).
**Approach:** New cores wrap `withWriteRetry(() => runInTenantTx(...))` and SHARE a conditional-decrement
helper mirrored from `movements.ts:77` (do NOT copy-paste the `updateMany`+`gte` guard — extract/reuse).
Receive → `receiveSupplyCore` at a location (opening lot carries `locationId`). Adjust → signed delta
against the location's open lots (positive = synthetic adjustment lot; negative = FIFO draw-down at that
location) + `MaterialMovement` row. Transfer → oldest-first draw at source (decrement `qtyRemaining`),
create destination lot(s) that **inherit `unitCost`, `receivedAt`, `expiresAt`, `vendorId`, `policyVersion`,
FX quintet** from the source lot and carry a **`splitFromLotId` lineage pointer** (council S2 — do NOT copy
`LotDocument` rows; provenance derives TRANSITIVELY through the lineage edge so later-added source docs still
resolve and delete semantics stay coherent); both legs share `transferGroupId`, touch location rows in
sorted order (deadlock rule). Shortfall on a user transfer → specific `ActionError` (mirror
`decrementSourceOrExplain`). **FIFO determinism + concurrency (council S4):** order candidate open lots
`(receivedAt, id)` with a matching index (partial-on-open if feasible); lock candidate lots in stable id
order (`FOR UPDATE`) or require+test serializable retry so concurrent transfer/adjust can't plan from a
stale read; pin ONE Decimal scale for material qty and round before every write so the `gte` guard is exact.

**Consumption location model — MECHANISM LOCKED (user-confirmed 2026-07-19, "negative reconcile-lot"):**
Per-location on-hand = Σ `qtyRemaining` of that location's lots (INCLUDING negatives). A dose past a
location's stock draws its positive lots to zero, then writes ONE negative `SupplyLot` at that location
(`qtyRemaining = −shortfall`, `unitCost` = the material's weighted-avg over its priced lots — location-first,
tenant-wide fallback — so cost stays KNOWN, NOT UNKNOWN, NOT $0). `planDepletion` + `weightedAvgUnitCost`
already filter to `qtyRemaining > 0`, so a negative lot is INERT to all FIFO/WA cost math — it only drags the
location's on-hand sum negative and IS the "Needs reconcile" signal (a later receipt/cycle-count nets it).
Single store (`SupplyLot`); `MaterialMovement` stays pure audit. No `CHECK(qtyRemaining>=0)` exists, so this
is legal; the existing non-located consumption path is untouched → `verify:cost` stays 55/55.
Below (superseded eng-review text kept for history): consumption draws from the op's location; if
insufficient it is **allowed to go NEGATIVE** at a real cost basis (never cross-pulls, never books UNKNOWN). A negative on-hand honestly means "consumed here, owe a receipt/transfer" and is **flagged for
mandatory cycle-count reconciliation**. Cost basis for a negative draw uses the material's location (or
tenant) weighted-avg so COGS stays KNOWN — NOT $0, NOT a cross-location silent pull (both models rejected the
silent all-location fallback: it fabricates location balances). Every CONSUME writes a `MaterialMovement`
row stamped with the op's location (Codex: a "best-effort/none" location = broken audit). Dosing that names
no location still books against the material tenant-wide (legacy behavior) but stamps the vessel's location
when resolvable.

**Opening-lot-correction after a split (RESOLVED by council):** the in-place opening-cost correction
**cascades the corrected cost to all UNCONSUMED child lots** (origin + split children). If ANY child lot has
already been consumed (hit COGS), the origin cost is **locked** and correction requires a manual journal
entry — NO retroactive COGS mutation after consumption.
**Tests:** `test/material-stock.test.ts` — receive-at-location, adjust up/down, transfer split preserves
Σqty + weighted-avg cost (COST-1 conservation), transfer split **inherits expiresAt + sets `splitFromLotId`
(provenance derives transitively)**, concurrent transfer never negative on a USER transfer
(conditional-decrement + `FOR UPDATE`), shortfall message empty-vs-partial, cross-location FIFO
`(receivedAt,id)` ordering. Extend `test/cost-consume.test.ts` for location-scoped depletion **+ a CRITICAL
regression (council C1): a dose from a location with zero local stock goes NEGATIVE at that location, books
KNOWN weighted-avg cost (NOT UNKNOWN, NOT $0), never pulls from another location, and flags the negative for
reconciliation** — this guards the money-correctness invariant.
**Depends on:** Unit 1
**Execution note:** test-first for the money-critical conservation + conditional-decrement paths.
**Patterns to follow:** `src/lib/stock/movements.ts` `decrement`/`transferStock`; `receiveSupplyCore`.
**Verification:** `npm run verify:cost` still 55/55 (no regression); new `test/material-stock.test.ts`
green; `npm run verify:tenant-isolation` green.

### Unit 3: Costed equipment — schema + intake core

**Goal:** Let an `EquipmentAsset` carry acquisition cost + vendor + invoice provenance, and add a core to
create a costed asset.
**Files:** `prisma/schema.prisma` (`EquipmentAsset`: add `purchaseCostBase? Decimal(18,8)` +
`sourceCurrency?`/`sourceAmount?`/`fxRate?`/`fxRateDate?` FX quintet mirroring `SupplyLot` — council S6, NOT
a bare `purchaseCost`+`currency` which is ambiguous under COST-4 — plus `purchaseDate?`, `vendorId?`),
`prisma/migrations/<ts>_equipment_cost/…`,
`src/lib/equipment/equipment-core.ts` (NEW — `createEquipmentAssetCore`, `createEquipmentAssetFromInvoiceCore`),
`src/lib/equipment/actions.ts`.
**Approach:** Additive nullable columns (no backfill needed; existing assets stay uncosted). Core creates
the asset at a `locationId`, optional `purchaseCost` (base currency, COST-4), optional `vendorId` via
`findOrCreateVendorCore`. Asset acquisition A/P is emitted through the SAME `emitApExportForInvoice`
aggregate (see Unit 5) — a standalone costed asset with an attached invoice uses the manual-invoice path,
NOT a bespoke per-asset emit. Parts remain `CellarMaterial` (EQUIPMENT category) → `SupplyLot` (already
costed via Units 1-2). `purchaseCost` is capitalized, NOT dosed (WORKORDER-7 — EQUIPMENT non-doseable).
**Tests:** `test/equipment-cost.test.ts` — create costed asset (base currency), vendor find-or-create,
uncosted asset still valid; schema test that EQUIPMENT category stays non-doseable.
**Depends on:** none (schema independent; A/P wiring lands in Unit 5)
**Verification:** `npm run verify:tenant-isolation` (EquipmentAsset already covered — confirm new columns
don't break); `npm run verify:work-orders-enhancements` (EquipmentAsset ↔ WO join intact).

### Unit 4: Manual multi-line invoice entry + manual/AI chooser

**Goal:** A manual invoice form that stages a synthetic `IngestedInvoice`+lines and applies it through the
exact same core as the AI path.
**Files:** `src/lib/ingest/manual-invoice-core.ts` (NEW — `createManualInvoiceCore`: build
`ExtractedDocument`-shaped header+lines → `createIngestedInvoiceCore` → return batch/invoice id for the
review screen), `src/lib/ingest/actions.ts` (`createManualInvoiceAction`), `src/components/ingest/AddInvoiceModal.tsx`
(NEW — "Enter manually" vs "Use AI uploader" chooser), `src/components/ingest/ManualInvoiceForm.tsx` (NEW —
vendor, invoice #, date, currency, per-line description/qty/unit/unitPrice/lineTotal + shipping/tax
charges), rename the launcher label.
**Approach:** Manual form produces the same `IngestedInvoiceLine` rows the extractor would; lines run
through `allocateLandedCost` + `normalizeLineToStock` at apply. After staging, land the user on the EXISTING
review screen (Unit 6 relocates it to `/inventory`) so dedup/reconciliation/FX gates and the aggregate A/P
(`emitApExportForInvoice`, AP-1) are shared. NO new A/P code. Chooser modal is reused by consumables,
equipment, and finished-goods intake.
**Tests:** `test/manual-invoice.test.ts` — staged manual invoice applies to N SupplyLots + ONE `apinv:<id>`
A/P event (AP-1); reconciliation-mismatch surfaces `needsAck`; foreign currency resolves one rate (COST-4).
**Depends on:** Units 1-2 (received lots now carry location — the manual form must capture a per-line or
per-invoice location).
**Patterns to follow:** `createIngestedInvoiceCore` (`ingest-invoice-core.ts:64`),
`applyIngestedInvoiceCore` (`:285`), `IngestReviewClient`.
**Verification:** `npm run verify:ingest` green (incl. a new manual-path assertion); manual + AI invoices
produce byte-identical A/P events for the same data.

### Unit 5: Mixed invoice apply — route lines to parts / equipment assets / finished goods

**Goal:** Let ONE invoice bring in quantity-tracked parts (→ `SupplyLot`), individual equipment assets
(→ `EquipmentAsset`), AND finished goods (→ integer `StockMovement`/`receiveStock` + stored unit COGS),
still emitting ONE aggregate bill.
**Files:** `prisma/schema.prisma` (`IngestedInvoiceLine`: `targetKind String?` **NULLABLE, no default** —
council C2 — {MATERIAL|EQUIPMENT_ASSET|FINISHED_GOOD}, CHECK-constrained + `finishedGoodTargetId?`; NEW join
table `IngestedInvoiceLineCreatedAsset(tenantId, lineId, equipmentAssetId)` for qty>1 — council C5, a single
FK can't represent N assets), migration, `src/lib/ingest/ingest-invoice-core.ts` (apply loop branches by
`targetKind`), `src/lib/accounting/ap-emit.ts` (per-line GL account, below), `src/components/ingest/…`
(per-line target selector, REQUIRED before apply).
**Approach (council-hardened):** the apply flow stays ONE `runInTenantTx`, ONE outbox event, ONE `apinv:<id>`
(AP-1). Refactor the per-target writers to **pure inner helpers that accept the OUTER tx + `emitAp:false`**
(council C-Codex — no nested tx/retry/emit, else double-post/partial-apply). Explicit `targetKind` is
**required at apply** — a null target is a hard `needsAck`, never a silent MATERIAL default (C2).
- `MATERIAL` → `receiveSupplyCore(skipApEmit:true)` at the line's location.
- `EQUIPMENT_ASSET` → `createEquipmentAssetCore` per unit; qty>1 → **N assets**, each linked via the join
  table; classification is by CATEGORY (council DQ2: Equipment=capitalized→N assets; Parts=expensed→treat as
  MATERIAL qty N, not assets).
- `FINISHED_GOOD` → resolve the `WineSku`/`FinishedGood` **at REVIEW time, not apply-time auto-create**
  (council S11 — apply-time create is irreversible), `receiveStock` the integer qty at the line's location,
  and write a **FG receipt cost-layer row** (Unit 7) at the landed unit cost — WEIGHTED-AVERAGE, never
  last-cost (council C4/DQ1). Internally-bottled wine is untouched (keeps specific-lot COGS from bottling).
- **Per-line GL routing (council C3):** `emitApExportForInvoice` maps EACH `billLine` to its own GL account
  by category — Equipment→Fixed Assets, Parts/consumables→Supplies Expense, Finished goods→Inventory Asset —
  so a truly mixed invoice doesn't corrupt the balance sheet. The bill stays ONE (AP-1); only the line
  account coding is per-category. **Accountant confirms the category→account map** before go-live.
- **Residual-allocation rule (council C7):** deterministic — per-line base amount, per-unit base-cost
  quantization at the pinned Decimal scale, rounding residual to the last unit/line so Σ(created costs) ==
  the aggregate bill EXACTLY. Test exact equality.
**Tests:** `test/mixed-invoice.test.ts` — invoice with 1 part + 1 asset(qty 2) + 1 merch line → 1 SupplyLot +
2 EquipmentAssets (join rows) + 1 FG receipt-layer row + ONE `apinv:<id>` bill whose per-line GL accounts
are correct AND whose total reconciles EXACTLY (residual rule); COST-1 conservation across all three kinds.
**Depends on:** Units 3, 4, 7 (FG receipt cost-layer)
**Execution note:** HIGHEST-risk unit — governed apply core, three target kinds, per-line GL. Wave 3, ALONE,
after council (done). Pure-inner-helper refactor is the load-bearing safety move.
**Verification:** `npm run verify:ingest` + `npm run verify:cost` green; exact reconciliation with all three
kinds + qty>1 + per-line GL on one invoice.

### Unit 6: Unified Inventory IA — tabbed page + route redirects

**Goal:** One `/inventory` page with four URL-addressable sections; old routes redirect in.
**Files:** `src/app/(app)/inventory/page.tsx` (read `?section=`), `src/app/(app)/inventory/InventoryTabs.tsx`
(NEW — segmented nav Finished goods / Consumables / Equipment & parts [In-progress dropped, Unit 10], +
Wine/Merch sub-tabs), move `setup/expendables/ingest` review under `inventory/invoice/`, redirect stubs at
`src/app/(app)/setup/expendables/page.tsx`, `setup/equipment/page.tsx`, `locations/page.tsx` (keep Locations
CRUD reachable as a section or a linked settings page), `src/components/AppShell.tsx` (drop the standalone
Expendables/Locations SETUP entries once folded).
**Approach:** Follow the URL-driven `work-orders/WorkOrdersTabs.tsx` (`?section=…`) so assistant `navigate`
deep links and redirects resolve to a section. Server component loads only the active section's data
(avoid mounting four heavy panels). Locations management stays reachable (a section tab or a
`/inventory?section=locations` sub-surface) since intake depends on it.
**Tests:** Route smoke — each `?section=` renders; old routes 308→ correct section. Playwright/manual (no
RTL in this repo).
**Depends on:** none structurally, but lands the shell the section UIs (7-10) fill.
**Patterns to follow:** `work-orders/WorkOrdersTabs.tsx`, `finished-goods/page.tsx` redirect.
**Verification:** `npx next build` locally (client-component-importing-src/lib rule); every old route
redirects; `?section=` deep links work.

### Unit 7: Finished goods section — "+ Add inventory" modal + invoice intake

**Goal:** The Finished goods section (Wine / Merchandise sub-tabs) with the add-SKU modal, stored COGS/MSRP,
and invoice intake.
**Files:** `prisma/schema.prisma` (NEW `FinishedGoodReceipt` cost-layer table — council C4 — tenant-scoped
RLS: `wineSkuId?`/`finishedGoodId?`, `qty Int`, `unitCostBase Decimal(18,8)`, `sourceCurrency`,
`fxRate?`, `locationId`, `receivedAt`, `sourceInvoiceLineId?`, provenance; on-hand valuation =
WEIGHTED-AVERAGE over receipts. `WineSku`/`FinishedGood` get `msrp? Decimal(18,2)` only — MSRP is a *price*,
fine on the SKU; do NOT put mutable COGS on the SKU, council C4 dual-source-of-truth), migration,
`src/app/(app)/inventory/sections/FinishedGoodsSection.tsx` (NEW, from current `InventoryClient.tsx`),
`src/components/inventory/AddFinishedGoodModal.tsx` (NEW), `src/lib/inventory/actions.ts`,
`src/lib/inventory/fg-cost-core.ts` (NEW — weighted-avg receipt writer, extended-`prisma` reader).
**Approach:** Modal: category pick-or-create, SKU, name; wine → vintage (**soft-confirm ONLY when
Category=Wine** — council S8, never on merch), MSRP; optional opening qty + location → `receiveStock` inline
(+ a FG receipt row at the entered COGS). **Internally-bottled wine keeps specific-lot COGS from bottling —
untouched.** 3rd-party/merch COGS lives ONLY in `FinishedGoodReceipt` (weighted-avg); a library buy-back CAN
be costed (council DQ1: lock ONLY when provenance is an internal bottling run). "+ Add invoice" (chooser from
Unit 4) for merch/external wine uses the Unit-5 `FINISHED_GOOD` target → a receipt row.
**Tests:** Add-wine soft-confirm fires on blank vintage for Wine only (NOT merch); opening-qty receive lands
at the chosen location + writes a weighted-avg receipt; bottling-sourced specific-lot COGS never touched.
**Depends on:** Units 4, 5, 6
**Verification:** `npx next build`; add-wine with/without vintage; opening stock appears per location; COGS
stored + shown.

### Unit 8: Consumables section — per-location on-hand + Receive/Adjust/Transfer + "+ Add consumable"

**Goal:** The Consumables section: per-location on-hand table and the full move UI, plus the
manual/AI-chooser add.
**Files:** `src/app/(app)/inventory/sections/ConsumablesSection.tsx` (NEW, from `ExpendablesClient.tsx`),
`src/components/inventory/MaterialMovePanel.tsx` (NEW — Receive/Adjust/Transfer, mirrors the wine Move
stock card), reuse `MaterialForm`, wire "+ Add consumable" → `AddInvoiceModal` chooser (manual → `MaterialForm`;
AI → uploader).
**Approach:** On-hand grouped by location (Unit 2 `onHandByLocation`). Move panel posts to the Unit 2
safeActions. "+ Add consumable" manual path uses the existing `MaterialForm` (unchanged fields) with a
required location; AI path uses the invoice uploader. Search/filter preserved.
**Tests:** Move panel renders locations; transfer shortfall shows the specific message. Manual QA on Demo
(controlled-input rule: click ref then type).
**Depends on:** Units 2, 4, 6
**Verification:** `npx next build`; DB proof via `runAsTenant("org_demo_winery", …)` reading per-location
rows after a transfer.

### Unit 9: Equipment & parts section — "+ Add equipment" (asset vs part)

**Goal:** The Equipment & parts section surfacing individual assets + quantity-tracked parts, with a costed
add flow.
**Files:** `src/app/(app)/inventory/sections/EquipmentSection.tsx` (NEW; fold in `setup/equipment` registry
view), `src/components/inventory/AddEquipmentModal.tsx` (NEW — choose asset vs part; manual or AI invoice).
**Approach:** Assets from `EquipmentAsset` (with new cost fields), parts from `CellarMaterial` EQUIPMENT
category (per-location on-hand via Unit 2). Asset add → `createEquipmentAssetCore` (+ optional invoice via
Unit 4/5). Part add → consumable intake scoped to EQUIPMENT category. Existing EQUIPMENT-category materials
surface here automatically (a category filter — no data move).
**Tests:** Asset with cost renders; part on-hand per location; EQUIPMENT category still non-doseable.
**Depends on:** Units 2, 3, 5, 6
**Verification:** `npx next build`; a costed asset shows purchase cost; a part transfers between locations.

### Unit 10: ~~In-progress goods section~~ — REMOVED (council decision)

**DROPPED.** Gemini argued a read-only tank/barrel list on the inventory page is a dead-end ("inventory is
for *doing*"); the user agreed to drop it. Bulk/in-progress wine stays managed on the existing vessel/cellar
boards (`/lots`, `/bulk`, `/ferment`) — the system of record. The unified Inventory page is now **THREE
sections**: Finished goods, Consumables, Equipment & parts. No `InProgressSection`, no `in-progress-view`
core. (Unit numbers kept stable to avoid cross-ref churn; this slot is intentionally empty.)

### Unit 11: Rename "Expendables" → "Consumables" (user-facing only)

**Goal:** All user-facing "Expendables" copy becomes "Consumables"; internal identifiers untouched.
**Files:** `src/components/AppShell.tsx` (nav label — now points at the folded section), page titles/copy in
the relocated section + review screens, assistant tool *descriptions* (`create-material.ts`,
`query-materials.ts`, `reverse-intake.ts` navigate label, `prompt.ts` guidance, etc.), `MaterialForm.tsx`
copy. Redirect stub keeps `/setup/expendables` working.
**Approach:** Mechanical copy swap. Do NOT touch: `CellarMaterial`/`SupplyLot` models, tool `name` strings
(`create_material`, `receive_supply`, `query_materials`), `COMMITTERS` keys, golden-case keys,
`UNCOVERED_OK` keys, parity `evidence:` paths. Leave `docs/plans/*`, `ROADMAP.md`, `NOW.md` history alone.
**Tests:** grep shows zero user-facing "Expendable" strings outside history/docs; tool `name`s unchanged.
**Depends on:** Units 6-10 (rename the relocated surfaces once they exist).
**Verification:** `npm run verify:parity` green (no dead evidence paths); `npm run verify:ai-native` green
(no tool-name drift); `eval:assistant` green.

### Unit 12: Assistant / MCP coverage for the whole system

**Goal:** A write tool for every inventory action, confirm-before-write, parity guards green.
**Files:** `src/lib/assistant/tools/{receive-consumable,adjust-consumable,transfer-consumable,
add-finished-good,add-equipment,add-invoice}.ts` (NEW), `src/lib/assistant/registry.ts` (+`ALL_TOOLS`),
`src/lib/assistant/commit.ts` (+`COMMITTERS`), `test/evals/assistant-write-tools.golden.ts` +
`assistant-fleet.golden.ts` (+cases), `docs/architecture/assistant-coverage.md` (regen).
**Approach:** Copy `receive-supply.ts`: `run()` resolves entities (`pickMaterial`/location resolver),
builds a preview, returns `signProposal(...)`+`needsConfirmation`; exported committer calls the Unit-2/3/4
safeActions; register committer. Every money/stock write goes through the confirm→`commitProposal` nonce
burn. `add-invoice` stages + navigates to the review screen (like `ingest_documents`). Each wrapped
`*-core.ts` is now reachable → `verify:ai-native` satisfied without allowlist. Add a golden per write tool
(+ fleet case for tool-selection). Consider narrowing `adjust_inventory` and fencing `db_create`/`db_update`
(flagged follow-ups) so typed tools win.
**Tests:** `eval:assistant` structural (each write tool has a golden); optional gated LLM eval
(`ASSISTANT_EVAL=1`).
**Depends on:** Units 2-5 (the cores/actions the tools wrap)
**Verification:** `npm run verify:ai-native -- --write` (regen coverage doc, 0 violations); `npm run
eval:assistant` green; `npm run verify:parity` green.

### Unit 13: Guardrails, backfills, tenant-isolation, docs

**Goal:** Close the loop — brain-hook coverage, invariants, isolation cases, prod backfill, brain docs.
**Files:** `.claude/hooks/inject-brain-context.mjs` (add `src/lib/cellar/`, `src/lib/ingest/`,
`src/lib/equipment/` to `HOT`), `docs/architecture/invariants/` (+ note if per-location material introduces
a conservation invariant, e.g. "material transfer conserves Σqty + cost"), `INVARIANTS.md`,
`scripts/verify-tenant-isolation.ts` + `test/tenant-isolation.test.ts` (SupplyLot-location, MaterialMovement,
equipment cost), `scripts/backfill-supplylot-location.ts` (prod run), `docs/architecture/system-map.md` +
scale/security registers, `docs/.brain-refresh-marker`.
**Approach:** The brain-hook gap (cellar/ingest not in `HOT` despite COST-4/AP-1/WORKORDER-7 naming them) is
fixed so future edits surface the invariants. Any new invariant gets a typed note + a `verify:` guard (so
`verify:invariants` stays green). Prod backfill documented as a deploy step (like the unbackfilled vendor
one). Refresh the system-map + registers at the phase boundary.
**Tests:** `npm run verify:invariants` (every invariant has a guard); `npm run verify:tenant-isolation`.
**Depends on:** Units 1-12
**Verification:** Full sweep green: `verify:tenant-isolation`, `verify:invariants`, `verify:cost`,
`verify:ingest`, `verify:ai-native`, `verify:parity`, `verify:work-orders-enhancements`, `eval:assistant`,
`npx next build`.

## Delivery Waves (phased, separate PRs — decided in eng-review)

Ship in three independently-verifiable PRs. Each wave is green on its own; nothing half-lands.

```
WAVE 1 — money spine (review in isolation)        WAVE 2 — surfaces                WAVE 3 — invoice breadth
┌──────────────────────────────────────┐         ┌───────────────────────────┐    ┌──────────────────────────┐
│ U1 SupplyLot.location + MaterialMove  │         │ U6 unified tabbed IA (3)    │    │ U5 mixed invoice apply    │
│ U2 location-aware consumable cores    │  ──────▶│ U7 finished-goods section  │───▶│  (parts+asset+FG target,  │
│ U3 costed EquipmentAsset schema/core  │         │ U8 consumables section     │    │   per-line GL routing)    │
│ U4 manual invoice — MATERIALS ONLY    │         │ U9 equipment & parts sec.  │    │ (+ FG/equipment invoice   │
│ U12 assistant tools for U1-U4 actions │         │ (U10 in-progress: DROPPED) │    │  target UIs light up)     │
│ U13a tenant-isolation + backfill      │         │ U11 rename sweep           │    └──────────────────────────┘
└──────────────────────────────────────┘         │ U12 assistant nav/deeplink │
   verify:cost / verify:ingest /                  │ U13b brain-hook + docs     │
   verify:tenant-isolation / verify:ai-native     └───────────────────────────┘
```

- **Wave 1** is the money/tenancy code — reviewed WITHOUT UI churn. Per council C6, Wave-1 invoices are
  **MATERIALS-ONLY** (no `targetKind` branching until U5); the manual form + assistant `add-invoice` refuse
  non-material targets until Wave 3 lands. Consumables become per-location and costed-equipment cores exist,
  driven via the assistant + existing screens, before the IA moves.
- **Wave 2** is pure presentation + the rename — no governed-money edits, so it reviews fast.
- **Wave 3** is the highest-risk governed-core change (Unit 5, three target kinds) landed LAST, alone, after
  council, so a problem there can't block the rest.

### Worktree parallelization

| Workstream | Modules touched | Depends on |
|-----------|-----------------|------------|
| A: consumable location (U1, U2) | `prisma/`, `src/lib/cellar/`, `src/lib/cost/` | — |
| B: costed equipment (U3) | `prisma/`, `src/lib/equipment/` | — |
| C: manual invoice (U4) | `src/lib/ingest/`, `src/components/ingest/` | A (lots now carry location) |
| D: assistant tools (U12) | `src/lib/assistant/` | A, B, C |
| E: IA + sections (U6-U11) | `src/app/(app)/inventory/`, `src/components/inventory/`, `AppShell.tsx` | Wave 1 |

Lanes A and B are independent (parallel worktrees, both touch `prisma/schema.prisma` — coordinate the
single migration-file sequence, else parallel; treat schema as the one shared-file conflict point). C waits
on A. D waits on A/B/C. E is Wave 2. **Conflict flag:** A and B both edit `prisma/schema.prisma` — serialize
the two migrations or author them in one pass to avoid a migration-order conflict.

## Wave 4 — field-report hardening (ADDENDUM, added 2026-07-20)

**Provenance.** Five Demo-Winery bug reports filed 2026-07-20 by `mike@bhutanwine.com`, surfaced by a
`/bug-triage` dry run. They are *not* five unrelated bugs: they are one winemaker walking through **one
flow** — setting up label materials to bottle Ann's Blend 2026 — and hitting a wall at every step. That
flow is exactly this plan's consumables/expendables seam, so they belong here rather than in a new plan.

**Why Wave 4 and not folded into Wave 3.** Wave 3 (U5) is deliberately isolated — highest-risk governed
apply core, landed ALONE after council, so a problem there blocks nothing else. Adding five field fixes
to it would destroy that property. Wave 4 runs **independently of Wave 3** (no shared files: U5 is
`src/lib/ingest/` apply-core; Wave 4 is consumables UOM/cost/receipt + the setup form), so the two may
proceed in parallel worktrees.

Plan-mode issues #366/#370/#373/#374/#377 exist but are **generic 880-char boilerplate with no analysis** —
do not `/work` them expecting a plan. The authoritative scope is below.

### Unit 14: Bifurcate consumable record setup from stock receipt  (ticket `cmrskv1w6…`, issue #377)

Creating a packaging/expendable record auto-books a receipt — reporter set up a label record and it
"automatically received 50 units" that were never physically received. Phantom on-hand poisons depletion
and unit cost downstream. Split record creation from receipt: creating a `CellarMaterial` books **no**
`StockMovement`; receipt is an explicit second action.

- **ERP standard to uphold (caution):** the already-booked phantom units must be unwound with a
  **reversing/correction `StockMovement`**, NEVER a hard delete of the receipt row (LEDGER-6, LEDGER-8,
  LEDGER-10, COST-1). Correction-as-event is the standard; deleting history is the failure mode.
- **Verify:** `verify:cost`; a `runAsTenant("org_demo_winery", …)` read proving record-create writes zero
  movements, and that the reversal nets the phantom units to zero without removing the original rows.

### Unit 15: Count/package UOM + pack size for consumables  (tickets `cmrsk1vhe…` + `cmrsl5iop…`, issues #366 + #370)

**Build as ONE unit — they are the same seam.** Labels can only be received in **grams** (#366); and a
"roll" unit does not record **how many labels are on a roll** (#370). Split across two instances they
collide in `src/lib/units` + `prisma/schema.prisma`. Together: a count/package dimension plus a pack-size
attribute, so "3 rolls @ 500 labels" resolves to 1,500 labels for bottling material planning.

- **ERP standard to uphold (caution):** a new unit must declare a real `{ dimension, perCanonical }` on the
  custom-unit spine — not a display-only label — because cost and depletion math ride on the conversion
  (COST-1). Pack size is a governed attribute keyed off the **immutable material id**.
- **⚠️ Identity trap:** `deriveMaterialFields` derives both `name` AND `normalizedKey` from `brandName` —
  a bulk metadata fill here can **silently re-key existing materials**. Dry-run a key comparison before any
  backfill (NAMING-1).
- **Verify:** `verify:cost`, `verify:naming`; unit tests on the conversion at pack boundaries.

### Unit 16: Surface cost on the consumable view  (ticket `cmrskell3…`, issue #374)

"Why is there no cost field or cost data for this expendable?" — the cost exists (derived from receipt /
ledger) but is not shown. Read-only column only.

- **ERP standard to uphold (caution):** materials carry **no price column** and cost is **read-only**,
  derived from receipts. Surface the existing derived cost — do **not** add an editable price field to the
  material record (COST-3). This is the cheapest unit here; it is also the easiest to get wrong by
  "just adding a price field."
- **Verify:** `verify:cost`; the displayed value must equal the weighted-average receipt cost.

### Unit 17: Vendor picker on the consumable/receipt screen  (ticket `cmrskpw5z…`, issue #373)

"We should have a vendor drop down or fuzzy logic on this screen" — free-text vendor entry on a screen
that already has first-class vendors (Plan 069).

- **ERP standard to uphold (caution):** the picker must persist the **immutable `vendorId`** and treat the
  vendor name as presentation only; the lookup stays inside the tenant fence. Never match or store on the
  mutable display name (NAMING-1, NAMING-2, TENANT-1).
- **Verify:** `verify:tenant-isolation`; a cross-tenant lookup must return nothing.

### Explicitly NOT in Wave 4

- **`cmrsisp2f…` / issue #365 "why is it showing no finished goods in inventory?" — DO NOT BUILD.**
  Investigated against the live Demo tenant 2026-07-20: `bottledInventory` holds **9 rows with stock**
  (incl. *Ann's Blend 2026 — 1,524 bottles* in Warehouse); `finishedGoodInventory` holds **0** because no
  merchandise has ever been created. `FinishedGoodsSection.tsx:37` defaults to the **All** sub-tab and
  merges both sources, so the wine does render. The reporter was almost certainly on the **Merchandise**
  sub-tab — a correct empty state — or misread the "Finished Goods" label. Disposition: **`unclear`, ask
  the reporter**; the only possible code change is a labelling/empty-state clarification, and even that
  should wait on his answer. Ranking it P0 and building a "fix" would have been a fabricated repair.
- **`cmrsl0awi…` / issue #371 popover dismissal** — unrelated to inventory (pure `src/components`
  dismissal semantics). Build standalone, in parallel; reuse the shipped pointerdown-origin pattern from
  ticket #310 / PR #318.

### Wave 4 build note (2026-07-20)

Built on `claude/plan-080-wave-4`. Two units landed differently from the spec above, both deliberately:

- **U15 needed NO schema change.** The plan called for a new count/package dimension plus a pack-size
  column. Both already exist: the units engine has a `count` dimension (canonical `unit`), and a custom
  unit carries its pack size as `perCanonical` — `CreateUnitModal`'s own hint is literally
  "e.g. a roll = 500 labels" (plan 075). Adding a second pack-size column would have created a competing
  source of truth for a number the cost engine divides by (a COST-1 hazard), so it was NOT built. The real
  gap was that the receive form was hard-locked to the material's canonical stock unit with no unit
  selector, so there was nowhere to say "3 rolls". Fixed with a pure `resolveReceiptQuantity` + an optional
  `qtyUnit` on the receive core. This also sidesteps the NAMING-1 backfill trap the plan flagged, since
  there is no backfill.
- **#366 and #374 look like DOWNSTREAM SYMPTOMS OF U14, not independent bugs.** The phantom opening lot
  pinned the material's stock unit (`updateMaterialCore` refuses a cross-dimension change while stock
  exists), which is why labels were stuck in grams (#366); and the phantom lots were created with no cost
  ("Opening stock 50 unit of 6BSS (cost unknown)"), which is why there was no cost data to show (#374).
  U14 stops both at the source. The U15/U16 work still stands on its own.

**Not applied:** the phantom-stock unwind. `scripts/unwind-phantom-opening-stock.ts` is a dry-run tool; the
live dry run finds 6 real candidates, one of them in `org_bhutan_wine_co` (the production tenant), so
running `--apply` is a human decision.

**Not browser-verified.** U15/U16/U17 all change UI and need a pass in the pane against Demo.

### Wave 4 parallelization

| Lane | Unit | Modules touched | Depends on |
|------|------|-----------------|------------|
| F | U14 receipt bifurcation | `src/lib/stock/`, `src/lib/inventory/`, setup form | — |
| G | U15 UOM + pack size | `src/lib/units/`, `prisma/schema.prisma` | — (serialize migration vs F if F needs schema) |
| H | U16 cost column | consumables section (read path) | G (cost display reads the conversion) |
| I | U17 vendor picker | `src/lib/vendors/`, receipt form | — |

F and I are disjoint and may run concurrently. G owns `prisma/schema.prisma` for this wave — coordinate
with any Wave-3 migration. H waits on G. **Critical path is F** (it rewrites the consumable create path
that H and I also touch at the form layer) — start it first.

## UI/UX Specification (design review, 2026-07-19)

Calibrated to DESIGN.md (warm-editorial **App UI**: calm surface hierarchy, `tabular-nums` tables,
sentence-case labels, ONE wine accent, cards only when the card IS the interaction, light-only). Reuse
`src/components/ui/` (`Button`/`Card`/`Badge`/`Modal`/`Eyebrow`/`Input`) + tokens — no hardcoded
colors/spacing. No AI-slop risk (established system; no 3-col icon grids, no gradients).

### Information architecture (Pass 1 — 5→9)
- **Section nav:** URL-driven segmented tabs on `/inventory` (`?section=finished|consumables|equipment`),
  the `work-orders/WorkOrdersTabs.tsx` pattern — a single row of text tabs under the page `Eyebrow`+`h1`, wine
  underline on active, NOT a card mosaic. Finished goods gets a second-level Wine/Merchandise segmented
  control. Deep-linkable for assistant `navigate` + old-route redirects.
- **On-hand table IA (the core decision):** **row per item**, columns: name · category `Badge` · **total
  on-hand** (`tabular-nums` + stock unit) · weighted-avg unit cost · vendor · a chevron. **Expanding** a row
  reveals a per-location breakdown (`White Cellar 8 kg · Lab 2 kg`) — an aggregate PER LOCATION, never raw
  micro-lots (council S1). Raw FIFO lots live one level deeper in an existing "Lot costing details" panel
  (`listMaterialLots`). Default sort: name; sortable by on-hand + category. A **Location filter** facet sits
  above the table (multi-select) so "show me Red Cellar" still works alongside the expandable rows.
- Equipment & parts: assets and parts are two grouped sub-lists under the section (assets = individual rows
  with status `Badge`; parts = the same expandable on-hand table, EQUIPMENT category).

### Interaction states (Pass 2 — 3→9)
Every new surface specifies all states (what the user SEES):

| Surface | Loading | Empty | Error | Success | Partial/edge |
|---------|---------|-------|-------|---------|--------------|
| Section on-hand table | skeleton rows (existing table skeleton) | warm empty state: line + primary "+ Add {consumable/equipment/inventory}" CTA + one-line context ("Nothing here yet — add your first item or import an invoice"), NOT "No items found." | inline `Badge tone="red"` row banner w/ retry | new row animates in (fast 120ms), toast | **negative on-hand** → `Badge tone="red"` "Needs reconcile" + the location breakdown flags the negative row |
| Move panel (Receive/Adjust/Transfer) | button spinner | n/a | field-level + the specific `ActionError` ("only 5 kg at White Cellar") inline, not a generic toast | success toast + table refresh (`router.refresh()`) | transfer shortfall message empty-vs-partial |
| Add-invoice (manual + AI) | dropzone processing state; per-line save spinner | blank manual form is the "empty" | reconciliation `needsAck` banner (amounts don't balance) + per-line validation | review screen → "Applied" + link to the created rows | partial-A/P / FX / duplicate `needsAck` gates each render a distinct explain-banner |
| Add-item modals | submit spinner | n/a | inline field errors | modal closes, row appears | blank-vintage soft-confirm (Wine only) is a secondary confirm step, not a blocking error |

- **Reconcile surfacing:** negative/flagged locations get a `Badge tone="red"` "Needs reconcile" and a
  section-level filter "Needs reconcile (N)" so an operator can find and cycle-count them. This is the visible
  half of the council-C1 negative-stock decision — without it, negatives are silent.

### User journey (Pass 3 — 6→8)
- **"Where is my stock" (5-sec):** land on `/inventory` → Consumables tab → scan totals → expand the one item
  in question → see per-location. No page hops.
- **"Bring in a delivery" (5-min):** "+ Add invoice" → one screen (AI dropzone on top, manual form below —
  council S9) → drop the PDF OR type lines → review (dedup/FX/reconcile gates) → apply → one QBO bill. Manual
  and AI converge on the SAME review screen so the mental model is one flow, not two.
- **"Move stock between cellars":** Consumables → Transfer → pick item, from/to location, qty → clear
  shortfall message if short. Mirrors the existing wine Move-stock card so it's already familiar.

### AI-slop (Pass 4 — 9/10) & design-system alignment (Pass 5 — 7→9)
No slop risk — extends the existing token/component system. Requirements: category chips use `Badge`
(reuse the existing tone map; do NOT invent colors — note the known `tone="gold"` drift in DESIGN.md, don't
depend on it); the manual-vs-AI chooser is NOT a modal-on-modal — it's the one-screen dropzone+form (S9);
soft-confirm is a `ConfirmButton`/secondary-confirm, not a blocking dialog; all money figures
`tabular-nums`; section headers use `Eyebrow` + `h1` (light 300).

### Responsive & accessibility (Pass 6 — 4→8)
- Wide on-hand tables scroll horizontally on mobile (`.app-main table` pattern, already in globals). The
  expandable row must remain operable at 375px (chevron is a real button, ≥44px touch target).
- **Expandable rows a11y:** the chevron is a `<button aria-expanded>` controlling the location sub-rows
  (`aria-controls`); keyboard-toggle; the sub-rows are a real `<tr>` group, not a tooltip. Location filter is
  keyboard-navigable.
- Move panel + modals: focus-trap (existing `Modal`), `:focus-visible` wine ring (`--shadow-focus`), labels
  tied to inputs, the specific error is announced (`aria-live="polite"`). Required-location select has a
  visible required marker.
- Color is never the only signal: the negative/reconcile state pairs the red `Badge` with the text "Needs
  reconcile" (not color alone) — matters for the light-only warm palette.

### Unresolved design decisions (Pass 7)
| Decision | If deferred |
|----------|-------------|
| Locations management home (a section tab vs a linked settings page) | resolved: keep `/inventory?section=…` reachable; Locations CRUD stays its own light page linked from each section's location picker ("+ manage locations") |
| Assistant proposal-card copy for a per-location move | falls back to generic text; spec: "Receive 10 kg KMBS into White Cellar" mirrors the move-panel summary |

## Test Strategy

**Unit tests (vitest):** money-critical paths test-first — Unit 2 conservation + conditional-decrement +
shortfall messages; Unit 4/5 AP-1 (one aggregate bill) + COST-4 (base currency) + reconciliation gates.
Follow `test/material-cost-safety.test.ts` (category cost-safety snapshot) and `test/cost-*.test.ts`.
**Integration / verify scripts:** `verify:cost` (55/55 no regression), `verify:ingest` (+ manual + mixed
assertions), `verify:tenant-isolation` (new tables/columns), `verify:invariants`, `verify:ai-native
--write`, `verify:parity`, `verify:work-orders-enhancements`, `eval:assistant`.
**Manual verification (Demo Winery only, QA-* fixtures, clean up after):** in the in-app Claude browser —
create a consumable, receive to White Cellar, transfer some to Red Cellar, confirm per-location on-hand;
"+ Add invoice" manually → apply → verify ONE QBO Bill; add a costed pump asset; add-wine with blank
vintage → soft-confirm; ask the assistant to do each and confirm the proposal card + nonce burn. Prove DB
writes with a `runAsTenant("org_demo_winery", …)` read-back (browser proves UI, script proves DB).
**Build gate:** `npx next build` in the MAIN checkout before any PR merges (client-component-importing-
`src/lib` server-only leak that `check` CI misses).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Per-location FIFO/cost bug double-books or strands cost | MED | HIGH | Unit 2 test-first for COST-1 conservation + conditional-decrement; `verify:cost` must stay 55/55; eng-review + council on the transfer-split math. |
| Manual/mixed invoice violates AP-1 (per-line bills) | MED | HIGH | Route through `applyIngestedInvoiceCore`; assert exactly one `apinv:<id>` event in tests; do NOT call per-lot emit in a loop. |
| Mixed-invoice apply (Unit 5) destabilizes the governed apply core | MED | HIGH | Isolate as its own unit; minimal per-line branch only; flag for eng-review + council; `verify:ingest` + `verify:cost` gate. |
| `verify:ai-native` breaks when new `*-core.ts` land uncovered | HIGH | MED | Plan the tool + golden in the SAME unit (Unit 12); regen coverage doc; allowlist only as last resort. |
| Vercel `next build` fails on a client component importing `src/lib` (passes `check`) | MED | MED | `npx next build` locally before merge; client-safe `*-shared.ts`/`vocab.ts` for value exports. |
| Server-component read core using `runInTenantTx` → 500 (ALS-less) | MED | MED | All read cores (Units 8/10) use the extended `prisma`; codified in the plan. |
| Prod backfill (SupplyLot.locationId) forgotten → null/FK failures on live tenants | MED | HIGH | Unit 13 documents the deploy backfill; `SET NOT NULL` only after backfill; `runAsSystem` per-tenant loop. |
| Windows/Neon migration phantom `search_vector` diff | MED | LOW | `migrate diff … | grep -v search_vector` → `migrate deploy` → `generate` (dev server stopped). |
| Route redirects miss a hard-coded `/setup/expendables` path → broken link/revalidate | MED | LOW | Keep a redirect stub; sweep the six `revalidatePath("/setup/expendables")` sites; update or leave (redirect covers). |
| Scope creep (13 units) stalls delivery | MED | MED | Independent schema units (1-3) parallel; ship in waves (schema+cores → UI → assistant); each unit independently verifiable. |
| Equipment capitalization GL direction wrong | LOW | MED | Flag for accountant sign-off (like the DTC/BillPayment tie-out); not a merge blocker; posts through the same reviewed poster. |

## NOT in scope (considered, deferred — with rationale)

- **Bottling COGS flow changes** — untouched; bottled wine still auto-loads COGS. Manual `unitCogs` is
  externally-sourced-only and must not clobber a bottling-sourced cost.
- **In-progress goods editing** — read-only reflection only; edits stay in `/lots`, `/bulk`, `/ferment`
  (that's the system of record; duplicating write paths would create two sources of truth).
- **Equipment maintenance/scheduling** beyond the existing status enum — out of this refactor's job.
- **Renaming DB models/tables/columns or assistant tool `name` strings** — high blast radius, zero user
  value (would break `COMMITTERS`, goldens, parity evidence).
- **Full location hierarchy (Winery → Building → sub-location)** — flat managed list only (your decision);
  hierarchy is a future change if multi-site grows.
- **Accountant GL sign-off on equipment capitalization + finished-goods COGS posting direction** — flagged
  for review, NOT a merge blocker (same posture as the DTC/BillPayment tie-out).

## Failure Modes (per new codepath — test + error-handling + visibility)

| Codepath | Realistic prod failure | Test? | Error handling? | User sees? |
|----------|------------------------|-------|-----------------|-----------|
| Consumption from empty location (U2) | Scoped location empty → UNKNOWN cost OR silent cross-location pull | YES (C1 regression, U2) | Go NEGATIVE at KNOWN weighted-avg cost + reconcile flag; never cross-pull | Negative on-hand + "reconcile" flag (truthful) |
| Transfer lot-split (U2) | Concurrent transfers double-draw a lot → negative stock | YES (conditional-decrement + `FOR UPDATE`) | `gte` guard → `count>0`, specific `ActionError` | "only N at X" message |
| Transfer lot-split provenance (U2) | Dest lot loses `expiresAt`/provenance → orphaned expiry/audit | YES (lineage test) | Inherit `expiresAt`; `splitFromLotId` lineage (derive docs transitively) | N/A (silent-correct) |
| Manual/mixed invoice A/P (U4/U5) | Per-line bills emitted → AP-1 violation, QBO dup (err 6140) | YES (one `apinv:<id>` assert) | Route through aggregate emit only | Reconciliation `needsAck` surfaced |
| Mixed invoice reconciliation (U5) | Three target kinds throw off Σ landed+tax vs total | YES (conservation test) | `needsAck:"reconcile"` gate | "amounts don't balance" ack |
| FG receive via invoice (U5/U7) | `receiveStock` at unresolved location → FK fail | YES (route smoke) | Require location; FK RESTRICT | Blocked with a clear message |
| New `*-core.ts` uncovered (U12) | `verify:ai-native` red → CI blocks | YES (verify sweep) | Wire tool same unit | (dev-time only) |
| Client component imports `src/lib` (U6-U10) | Vercel `next build` fails, `check` CI passes | Build gate | `*-shared.ts`/`vocab.ts` split | (dev-time only) |

**No critical gaps** (no failure mode is untested AND unguarded AND silent). The one that WOULD have been —
post-backfill consumption under-booking — is now covered by the U2 P0 regression + all-location fallback.

## Success Criteria

- [ ] One `/inventory` page with three addressable sections (Finished goods / Consumables / Equipment &
      parts); `/setup/expendables`, `/setup/equipment`, `/finished-goods`, `/locations` redirect in.
- [ ] Consumables show per-location on-hand and support Receive / Adjust / Transfer with correct
      cost-preserving lot splits.
- [ ] Location is required on every intake across all four sections.
- [ ] "+ Add invoice" offers manual vs AI; a manually entered invoice produces an identical single
      aggregate A/P Bill to the AI path (AP-1) in base currency (COST-4).
- [ ] Equipment can be added as an individual costed asset or a quantity-tracked part, via manual or AI
      invoice; purchase cost posts A/P; EQUIPMENT stays non-doseable (WORKORDER-7).
- [ ] Finished-goods "+ Add inventory" modal works incl. blank-vintage soft-confirm + optional opening
      qty/location; bottled-wine auto-flow unchanged.
- [ ] Consumption from an empty location goes NEGATIVE at a KNOWN cost + is flagged for reconciliation
      (never a silent cross-location pull, never UNKNOWN cost).
- [ ] Mixed invoices post per-line to the correct GL accounts (Fixed Assets / Supplies Expense / Inventory
      Asset) while remaining ONE bill (AP-1); Σ(created costs) reconciles exactly.
- [ ] "Expendables" is gone from all user-facing copy; internal identifiers + tool names unchanged.
- [ ] The assistant can perform every inventory action with confirm-before-write; `verify:ai-native`,
      `verify:parity`, `eval:assistant` green.
- [ ] Full verify sweep green + `npx next build` clean; Demo browser + DB read-back proof captured.
- [ ] No regressions: `verify:cost` 55/55, `verify:ingest`, `verify:tenant-isolation`, `verify:invariants`.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Charter + two clarifying rounds + code map all agree. |
| Scope Boundaries | HIGH | In/out explicit; reuse-not-duplicate confirmed against schema. |
| Implementation Units | MEDIUM-HIGH | Units 1-4, 6-13 well-grounded in existing patterns. Unit 5 (mixed-invoice apply into the governed core) is the LOW spot — needs eng-review + council to lock the per-line branch and asset-qty>1 semantics. |
| Test Strategy | HIGH | Reuses `verify:*` suite + test-first for money paths; Demo browser+DB proof. |
| Risk Assessment | MEDIUM-HIGH | Money/tenancy/parity risks identified with concrete mitigations; residual unknown is the equipment capitalization GL direction (accountant sign-off). |

**What would raise Unit 5 to HIGH:** council confirming the per-line target-discriminator branch (now THREE
kinds: material / equipment-asset / finished-good) keeps the reconciliation/A/P scaffolding intact, plus
locked decisions on: asset qty>1 (N assets vs 1+note), finished-goods COGS rule (weighted-avg vs last-cost),
and the opening-lot-correction ambiguity after a transfer-split.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Council (Codex + Gemini) | `/council` | Cross-LLM adversarial | 1 | ISSUES FOLDED | 7 critical + 12 should-fix, all folded |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 4 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | CLEAR (FULL) | score 5/10 → 9/10, UI/UX spec added |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**ENG-REVIEW FINDINGS (all resolved):**
- P0 — post-backfill consumption under-books COGS → fixed in Unit 2 (later SUPERSEDED by council C1: negative-at-location, not all-location fallback).
- P1 — transfer lot-split orphans provenance → Unit 2 (council S2 upgraded the fix: `splitFromLotId` lineage, not row-copy).
- P1 — finished-goods invoice/COGS needs new schema → Units 5+7 (council C4 upgraded to a `FinishedGoodReceipt` weighted-avg cost-layer).
- P2 — Unit 5 rides the governed apply core → Wave 3, alone, after council.

**COUNCIL FINDINGS (Codex gpt-5.4 + Gemini 3.1-pro — all folded; see `council-feedback.md`):**
- C1 consumption model → NEGATIVE-at-location + reconcile (reversed the eng-review fallback). C2 `targetKind` required, no default. C3 per-line GL routing. C4 FG receipt cost-layer (weighted-avg). C5 asset join table for qty>1. C6 Wave-1 invoices materials-only. C7 residual-allocation rule. S1-S12 folded (micro-lot UI grouping, lineage provenance, MaterialMovement FKs, FIFO `(receivedAt,id)`+`FOR UPDATE`, N+1, deploy-safe nullable, FX capture, vintage-Wine-only, one-screen chooser, review-time FG resolve).
- **USER decisions:** consumption=negative+reconcile; FG cost=receipt cost-layer; GL=per-line-by-category now; **In-progress tab DROPPED** (4 sections → 3).

**DESIGN-REVIEW (plan-stage, 5/10 → 9/10):** added a full UI/UX Specification — 3-section segmented-tab IA;
**on-hand table = row-per-item + expandable per-location breakdown** (hides micro-lot fragmentation, council
S1); a complete interaction-state table (loading/empty/error/success/edge for every surface); the
**negative-stock "Needs reconcile" `Badge` + filter** (the visible half of council-C1); one-screen
manual/AI invoice chooser (S9); vintage-soft-confirm Wine-only (S8); responsive wide-table scroll +
expandable-row a11y (`aria-expanded`, 44px targets, color-never-alone). All calibrated to DESIGN.md tokens/
components. No AI-slop risk (extends the existing system).

**UNRESOLVED:** 0. **VERDICT:** ENG CLEARED + COUNCIL FOLDED + DESIGN CLEARED (9/10). Harden chain complete —
ready to `/work` **Wave 1** (money spine: U1-U4, U12 tools, U13a). Then Wave 2 (surfaces + rename), Wave 3
(mixed-invoice apply). Reminder: build in the MAIN checkout (has `.env`), not this worktree.
