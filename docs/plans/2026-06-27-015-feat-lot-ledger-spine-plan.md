---
title: Lot + Ledger Spine (Phase 0 + Phase 1)
type: feat
status: draft
date: 2026-06-27
branch: claude/zen-chebyshev-b2195e
depth: deep
units: 11
---

## Overview

Introduce a persistent **Lot** identity for wine, backed by an **append-only operation
ledger** (the new source of truth for bulk wine) with a **materialized current-state
projection** and **lineage edges**. Cut racking, manual bulk edits, and bottling draw
over to the ledger, and migrate all existing wine to "Legacy Lots" at a clean Day-Zero
boundary. This is the foundation every later winery-ERP phase depends on; nothing else
ships until the wine has a name and every change to it is an immutable event.

## Problem Frame

Today wine "identity" is an implicit tuple — `(vesselId, varietyId, vineyardId,
vintage)` on `VesselComponent` — and operations **mutate those rows in place**. That is
fine for an inventory app and fatal for an ERP: it cannot express blends (which
homogenize into a new wine), cannot roll cost through a blend, and "undo" only works
because identity is local and history is thin. The council review (Gemini + Codex) was
unanimous: bulk wine needs the same append-only ledger discipline bottled wine already
has (`StockMovement` + `BottledInventory`), and the missing ledger is the core
architectural smell.

Doing nothing keeps this an inventory app. The winemaker's job — follow one batch of
wine vine-to-bottle with every operation recorded against it — is impossible without a
durable Lot. This phase makes the Lot real and proves it end-to-end through one rack.

## Requirements

- MUST honor the locked decisions in `VISION.md §11` — specifically **D1, D2, D3, D6,
  D11, D12, D13, D14, D15** for this phase (see Key Decisions).
- MUST make bulk wine an **append-only ledger of operations** with signed volumetric
  lines; the truth is the ledger, not mutable rows (**D2**).
- MUST maintain a **transactional projection** of current state ("what's in this vessel
  / where does this lot live"); the projection MUST always equal the fold of the ledger.
- MUST give every Lot an identity that **does not include vintage** in its key (**D3**);
  vintage is an attribute.
- MUST replace racking's in-place row mutation with a **RACK operation** through the
  ledger, preserving the existing capacity checks, loss handling, and error messages.
- MUST replace the current row-reversion undo with a **compensating CORRECTION
  operation** with a temporal-validity guard; the original operation stays immutable
  (**D6**).
- MUST cut **manual bulk edits** (`addComponent` / `updateComponentVolume` /
  `removeComponent`) and **bottling draw** over to the ledger, including a `lotId` on
  `BottlingSource`.
- MUST perform a **Day-Zero migration** that wraps each existing `VesselComponent` into a
  Legacy Lot seeded at its current volume, stores the old tuple as a JSON snapshot, and
  **fabricates no historical lineage** (**D11**).
- MUST keep the app building and **all existing tests passing**; pure math gets new unit
  tests in the established vitest pattern.
- SHOULD keep `VesselTransfer` working as a denormalized read-model of RACK operations so
  the existing `/vessels` history UI and the assistant `query-transfers` tool keep
  working during transition.
- SHOULD define an **open operation vocabulary** and a **Lot form enum** as code
  constants now (Phase 0), even though only a few op types are exercised this phase.
- NICE: record D1–D11 into the context-ledger so later phases query precedent instead of
  re-reading prose.

## Scope Boundaries

**In scope:**
- New models: `Lot`, `LotOperation`, `LotOperationLine`, `LotLineage`, and a projection
  table (`VesselLot`).
- The transactional ledger-write chokepoint and the pure fold/plan/correction math.
- Cutover of racking, revert→correction, manual bulk edits, and bottling draw.
- Read-path migration for vessel composition (`fill`, `blend`, vessel/bulk pages,
  assistant component reads).
- Day-Zero migration of existing data to Legacy Lots.

**Out of scope (and why):**
- **Harvest pick → Lot creation.** A pick is fruit in **kg**; becoming wine in **L**
  needs the crush/press transform with measured yield (**D8**) — that is Phase 6. Phase 1
  lots originate via the Day-Zero seed and manual create-in-vessel.
- **Blends that originate new lots.** Phase 5. The schema MUST NOT preclude it (lineage
  table + lot-per-vessel projection are built now), but no blend operation ships here.
- **Chemistry / tasting / timeline UI.** Phases 2 and 4.
- **RBAC redesign for multi-vineyard lots (D9).** Not needed until blends (Phase 5);
  Phase 1 keeps the existing per-vineyard scoping for single-origin legacy lots.
- **New cellar operations (additions, topping, fining, loss as ops).** Phase 3. Only
  RACK / SEED / ADJUST / DEPLETE / BOTTLE / CORRECTION are exercised now.
- **Assistant coverage of new ops beyond updating the existing rack/revert tools.**

## Research Summary

### Codebase Patterns
- **Append-only ledger to mirror:** `src/lib/stock/movements.ts` — `receiveStock`/
  `adjustStock`/`transferStock` append a `StockMovement` and update the
  `BottledInventory` cached balance in one `$transaction`, paired legs share a
  `transferGroupId`, and `withWriteRetry` handles P2034 serialization conflicts. This is
  the template for the bulk-wine ledger + projection.
- **Racking seam:** `src/lib/vessels/transfer.ts` — `transferWine` (deduct at
  `transfer.ts:112-119`, upsert-merge on the composite key at `transfer.ts:122-141`,
  record `VesselTransfer` + audit at `transfer.ts:146-166`); `revertTransfer`
  (`transfer.ts:242-372`) mutates rows and sets `revertedAt`/`revertsId`. Pure planning
  in `src/lib/vessels/transfer-math.ts` (`planTransfer` `:31-74`, `planRevert` `:99-128`,
  lot key `${varietyId}|${vineyardId}|${vintage}` at `:89-90`).
- **Proportional draw to reuse:** `src/lib/bottling/draw.ts:33-72` `computeProportionalDraw`
  — centiliter largest-remainder distribution, sum-exact invariant; `round2` at `:4-6`.
- **Bottling consumption + provenance:** `src/lib/bottling/run.ts` `applyBottling`
  (`:33-90`) draws across components, writes a `BottlingSource` per tuple at `run.ts:72`,
  deletes/updates components at `:73-74`, then writes `StockMovement` + `BottledInventory`.
- **Manual mutation sites:** `src/lib/bulk/actions.ts` `addComponent` (`:31-81`),
  `updateComponentVolume` (`:83-107`), `removeComponent` (`:129-147`).
- **Read sites:** `src/lib/vessels/fill.ts` `computeFill`, `src/lib/bulk/blend.ts`
  `classifyBlend` (groups by `varietyId`), the `/vessels` and `/bulk` pages, assistant
  component reads.
- **Action / audit / tx conventions:** `src/lib/actions.ts` `action()` wrapper supplies
  `{user, actor}`; `src/lib/audit.ts` `writeAudit(tx, …)` runs in the same tx; throw
  `ActionError(msg, code)` with codes like `CONFLICT`. `src/lib/prisma.ts` singleton.
- **Migrations:** `prisma/migrations/<timestamp>_<desc>/migration.sql`; raw SQL used for
  composite indexes / JSON / generated columns (see the field-notes and vessel-transfer
  migrations). `npm run db:migrate` for history; Neon needs the unpooled URL for DDL.
- **Tests:** vitest; pure-function tests in `test/` (`test/draw.test.ts`,
  `test/blend.test.ts`) assert invariants and edge cases. Pure math is the testable seam.
- **Units:** wine = L `Decimal(10,2)` (centiliter), harvest = kg `Decimal(12,3)`; storage
  metric, convert at UI only.

### Prior Learnings
- **context-ledger is empty** and the rstack learnings CLI is unavailable on this Windows
  machine. `VISION.md §11` (D1–D11) and `ROADMAP.md` Phases 0–1 are the authoritative
  source. Phase 0 still owes the ledger the D1–D11 records (Unit 1 does this).
- The just-shipped revert work (commits `92fa964`, `297baf0`, `7d54a27`) is **on the
  chopping block** — D6 mandates migrating it to compensating corrections, not extending
  it.

### External Research
- `AGENTS.md` caveat: this is a modified Next.js 16 — read `node_modules/next/dist/docs/`
  before route/server-component work. This phase is overwhelmingly `src/lib/**` + Prisma;
  minimal route surface, so exposure is low. Confirm before touching any `page.tsx`.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Source of truth for bulk wine | Append-only `LotOperation` + `LotOperationLine`, with a transactional `VesselLot` projection | Keep mutable `VesselComponent`; pure event-sourcing with replay reads | D2; mirrors proven `StockMovement`/`BottledInventory`. Pure replay rejected as too heavy (VISION §3). |
| Lot identity | Opaque `Lot.id` + human `code`; variety/vineyard/vintage are **attributes**; identity metadata **immutable after the first op** (change via correction) | Composite tuple incl. vintage as identity; freely-mutable metadata | D3; NV/multi-vintage blends, reserves, declassification. Mutable provenance after ops makes history unstable (eng review). |
| Projection shape | New `VesselLot(vesselId, lotId, volumeL)` table; `VesselComponent` retired after backfill | Repurpose `VesselComponent` in place | One source of truth; lot-keyed projection is what blends/cost need. Reads join `VesselLot`→`Lot`. |
| Double-entry model | Each operation's lines sum to zero across volume; "outside the cellar" = lines with `vesselId = null` (seed-in, bottle-out, loss-out) | Allow unbalanced create/bottle ops | Clean, single invariant: `sum(deltaL)=0` per op always. Loss is an explicit external line (D7-ready). |
| Undo | `CORRECTION` op (`correctsOperationId`, unique) with inverse lines; **blocked if any later non-correction op touched the affected positions** (D15); originals immutable | "Enough volume present" math-only guard; `revertedAt`/`revertsId` row reversion | D6/D15; a math-valid inverse can silently rewrite a topped/blended composition (eng review). |
| `VesselTransfer` | **Derived read-model only**: unique `lotOperationId` FK, written solely by the ledger writer; "reverted" derived from a correction op's existence | Keep mutable `revertedAt`/`revertsId` as authoritative | Keeps `/vessels` history + `query-transfers` working without rebuilding the old undo-state bug surface (eng review). |
| Concurrency | **SERIALIZABLE isolation + canonical row-lock the involved `VesselLot` rows**; DB constraints `CHECK(volumeL>0)`, `deltaL<>0`, unique `correctsOperationId`, race-safe capacity; `withWriteRetry` on P2034 | App-side fold under Read Committed + app-only assertions | Both reviewers: app folds lose updates and overfill vessels. Precedent: `bottling/run.ts` already uses Serializable. |
| Operation type | **Controlled Prisma enum** (`SEED`/`RACK`/`LOSS`/`ADJUST`/`DEPLETE`/`BOTTLE`/`CORRECTION`), extended per phase | Open free-text `type` string | D4 refined; free-text in a correctness-critical ledger is a mistake (both reviewers). |
| Ordering + provenance | Monotonic `sequence` (autoincrement) for deterministic fold; `observedAt`/`enteredAt`/`enteredBy`/`captureMethod` on every op | `occurredAt` as the sole sort key | Timestamps collide and clocks drift; provenance cheap now, expensive to retrofit (eng review). |
| Vessel groups | `VesselGroup` + `VesselGroupMember` (**structure-only** this phase, like lineage) | Add later via migration | D13; lets group ops fan out to children in Phase 3 with no schema change. |
| Day-Zero | Wrap each `VesselComponent` as a Legacy Lot at current volume + JSON snapshot; deterministic + idempotent; verify volume conservation + projection==fold; **no fabricated lineage, NO `BottlingSource.lotId` backfill**; archive old table in a **later** step | Reconstruct historical lots; backfill `lotId` from present-day lots; archive in the cutover commit | D11; collapsed tuples make lineage unrecoverable, and inferred `lotId` is fabricated provenance (both reviewers). Much code still reads `vessel_component`. |
| Cutover style | Expand → backfill → **parity-verify** → switch app reads/writes in one gated commit (Units 5–9) → archive old table later; snapshot + maintenance window | One commit that also drops the old table; long-lived dual-write | Code-path switch in one commit is right; destructive DB cleanup is a separate, later step (eng review). |

## Implementation Units

### Unit 1: Phase 0 — lock decisions, invariants, vocabulary, form enum
**Goal:** Make the spine's rules executable and queryable before any schema work.
**Files:** `docs/INVARIANTS.md` (new); `src/lib/ledger/vocabulary.ts` (new — op-type +
Lot form enums + provenance field list as code); context-ledger records (external).
**Approach:** Write `INVARIANTS.md` distinguishing **DB-level constraints** from app
checks (D14): (a) per-op `sum(deltaL)=0`; (b) projection == fold of the ledger; (c)
`CHECK(volumeL > 0)` on `VesselLot` and `deltaL <> 0` on lines; (d) unique
`correctsOperationId`; (e) race-safe vessel-capacity guard; (f) corrections never mutate
prior events; (g) a correction is blocked if a later non-correction op touched the
positions (D15). Define the **controlled operation-type enum** (`SEED`, `RACK`, `LOSS`,
`ADJUST`, `DEPLETE`, `BOTTLE`, `CORRECTION` to start — extended per phase, NOT free-text,
D4) plus the `LotForm` enum (`FRUIT`, `MUST`, `JUICE`, `WINE`, `BOTTLED_IN_PROCESS`,
`FINISHED`). Specify the **capture-provenance** fields every op carries: monotonic
`sequence`, `observedAt`, `enteredAt`, `enteredBy`, `captureMethod`. Record D1–D15 into
the context-ledger via the MCP (`propose_decision` → `confirm_pending`).
**Tests:** none (enums + docs); Unit 11 asserts the invariants in code.
**Depends on:** none
**Patterns to follow:** mirror enum style in `prisma/schema.prisma` + `src/lib/` modules.
**Verification:** `vocabulary.ts` exports compile; `query_decisions` returns D1–D15.

### Unit 2: Prisma schema + migration for Lot, ledger, lineage, projection
**Goal:** Land the data model the spine rides on.
**Files:** `prisma/schema.prisma`; new migration under `prisma/migrations/`.
**Approach:** Add models: **`Lot`** (`id`, unique `code`, `form` `LotForm`, optional
`originVineyardId`/`originBlockId`/`originVarietyId`, optional `vintageYear`, `status`,
`isLegacy`, `legacySnapshot Json?`, `note?`, timestamps; provenance metadata immutable
after first op); **`LotOperation`** (`id`, **`sequence` autoincrement** for deterministic
fold ordering, `type` **`OperationType` enum** (not free-text, D4), `observedAt`,
`enteredAt`, `actorUserId?`/`enteredBy`, `captureMethod`, `note?`, `correctsOperationId?`
self-relation **with a unique constraint** (D14/D15), `metadata Json?`); **`LotOperationLine`**
(`id`, `operationId`, `lotId`, `vesselId?` null=external, `deltaL Decimal(10,2)` signed
**`CHECK(deltaL <> 0)`**, `reason?` e.g. `"loss"`, snapshot `lotCode`/`vesselCode`);
**`LotLineage`** (`parentLotId`, `childLotId`, `fraction Decimal?`, `kind`) — structure only;
**`VesselGroup`** + **`VesselGroupMember`** (structure only, D13); **`VesselLot`** projection
(`vesselId`, `lotId`, `volumeL Decimal(10,2)` **`CHECK(volumeL > 0)`**, `updatedAt`,
`@@unique([vesselId, lotId])`). Add a unique **`lotOperationId` FK on `VesselTransfer`**
(derived read-model; stop treating `revertedAt`/`revertsId` as authoritative). Index for
history/aggregate reads, mirroring `vessel_transfer`/`stock_movement`. Add `lotId` FK to
`BottlingSource` (**nullable; NOT backfilled** — D11). Keep `VesselComponent` for the
Day-Zero read in Unit 10. CHECK constraints + autoincrement go in a **raw-SQL migration**
(Prisma can't express them); use `npm run db:migrate` (unpooled Neon URL).
**Tests:** none directly; schema compiles, client regenerates, constraints apply.
**Depends on:** Unit 1
**Patterns to follow:** `prisma/migrations/20260625184313_add_vessel_transfer/migration.sql`
(raw SQL for indexes/constraints).
**Verification:** migration applies cleanly to a Neon branch; `prisma generate` succeeds;
inserting a negative/zero balance or a duplicate `correctsOperationId` is rejected by the DB.

### Unit 3: Pure ledger math (test-first)
**Goal:** Encode fold/plan/correction as pure, exhaustively tested functions.
**Files:** `src/lib/ledger/math.ts` (new); `test/ledger-math.test.ts` (new).
**Approach:** All math in **integer centiliters / `Prisma.Decimal`** — never `parseFloat`
(a single float op randomly breaks `sum=0`). `foldLines(balances, lines)` → new balances +
invariant assertions (sum-zero, no-negative) with a **dust/functional-zero rule**: a
residual `< 0.01 L` after a draw folds into the op's loss line and the `VesselLot` row is
removed (no microscopic lot fractions). `planLedgerRack(sourceBalances, drawL, lossL)` →
operation lines: proportional draw across the source vessel's lots (reuse
`computeProportionalDraw`), `−deltaL` per (source vessel, lot), `+` into destination per
lot, explicit `vesselId=null reason="loss"` line for `lossL`. `planCorrection(originalOp,
laterOps, currentBalances)` → inverse lines **+ the D15 guard: refuse if any later
non-correction op touched the affected (vessel, lot) positions** (return a structured
"cannot correct — later activity" with the offending ops), then also check the inverse is
balance/capacity-valid. Stricter than `planRevert`.
**Tests:** sum-exact draw across multiple lots; loss line balances the op to zero; dust
residual folds into loss; correction restores balances when clean; **correction blocked
when a later op touched the positions** (not just when volume is short); tiny-volume
largest-remainder cases (port `test/draw.test.ts` style).
**Depends on:** Unit 1
**Execution note:** test-first.
**Patterns to follow:** `src/lib/bottling/draw.ts`, `src/lib/vessels/transfer-math.ts`,
`test/draw.test.ts`.
**Verification:** `test/ledger-math.test.ts` passes; invariants hold on all cases.

### Unit 4: Transactional ledger-write chokepoint
**Goal:** One audited, transactional path that every operation goes through.
**Files:** `src/lib/ledger/write.ts` (new).
**Approach:** `writeLotOperation(tx, { type, lines, actor, captureMethod, note?,
correctsOperationId?, observedAt? })` runs at **`SERIALIZABLE` isolation** (like
`bottling/run.ts:18`) and **locks the involved `VesselLot` rows in canonical (sorted)
order** before folding, to defeat lost-update/overfill races. Insert `LotOperation`
(+monotonic `sequence`) + its lines; apply each to `VesselLot` (increment/decrement,
delete at functional-zero); rely on **DB constraints** (`volumeL>0`, `deltaL<>0`, unique
`correctsOperationId`) as the real guard, with app assertions as defense-in-depth; verify
the **vessel-capacity** invariant (a non-negative `VesselLot` can still overfill a vessel);
create Lot rows for any new lots; `writeAudit` in the same tx. Wrap callers in
`withWriteRetry` for P2034/serialization retries. Single chokepoint for Units 5–8.
**Tests:** concurrency + integration in Unit 11; pure math in Unit 3.
**Depends on:** Units 2, 3
**Patterns to follow:** `src/lib/stock/movements.ts` (`withWriteRetry`, in-tx `writeAudit`),
`src/lib/bottling/run.ts:18` (Serializable), `src/lib/audit.ts`.
**Verification:** a SEED op creates a Lot + `VesselLot` row equal to the line; two
concurrent racks from one vessel can't overdraw or overfill (DB rejects, retry resolves).

### Unit 5: Cut racking over to a RACK operation
**Goal:** `transferWine` becomes a ledger RACK, not a row mutation.
**Files:** `src/lib/vessels/transfer.ts`.
**Approach:** Read source `VesselLot` balances; keep all current guards (empty source,
draw ≤ source, loss ≤ draw, destination capacity, inactive vessels) and `ActionError`
messages verbatim. Call `planLedgerRack` then `writeLotOperation({type:"RACK", …})`. Write
the denormalized `VesselTransfer` read-model row in the same tx (so history UI +
`query-transfers` keep working), with its `components` snapshot derived from the operation
lines. Keep `revalidatePath(["/bulk","/vessels"])` and the result message shape.
**Tests:** integration in Unit 11; message-shape unchanged.
**Depends on:** Unit 4
**Patterns to follow:** existing `transferWine` structure (`transfer.ts:42-183`).
**Verification:** racking 45 L Barrel→Tank yields matching `VesselLot` balances and a RACK
op whose lines fold to the new state.

### Unit 6: Replace revert with a CORRECTION operation (D6)
**Goal:** Undo becomes a compensating event; originals stay immutable.
**Files:** `src/lib/vessels/transfer.ts`; `src/lib/assistant/tools/revert-transfer.ts`;
`src/lib/assistant/commit.ts` (committer wiring).
**Approach:** Replace `revertTransfer`'s row reversion with `correctOperation({operationId})`:
load the original op's lines + any later ops on those positions, run `planCorrection`, and
`writeLotOperation({type:"CORRECTION", correctsOperationId, lines: inverse})`. Enforce the
**D15 guard**: throw `ActionError(…, "CONFLICT")` if a later non-correction op touched the
positions ("can't undo — Tank X has been racked/topped/bottled since"), reusing the existing
shortfall wording for the volume case. Originals and their lines are never deleted; the
unique `correctsOperationId` constraint blocks a double-correction race. `findRevertableTransfer`
resolves the most recent RACK op with no later activity and no existing correction. Repoint
the assistant revert tool's committer.
**Tests:** Unit 3 covers the math; Unit 11 covers the flow.
**Depends on:** Units 4, 5
**Patterns to follow:** current `revertTransfer` guards/messages (`transfer.ts:242-372`),
assistant tool pattern (`tools/revert-transfer.ts`, `commit.ts`).
**Verification:** correcting a rack restores prior balances and leaves both the original
RACK and the CORRECTION op present and immutable.

### Unit 7: Cut manual bulk edits over to the ledger
**Goal:** `addComponent`/`updateComponentVolume`/`removeComponent` become ledger ops.
**Files:** `src/lib/bulk/actions.ts`.
**Approach:** `addComponent` → create a `Lot` (single-origin, attributes from the form) +
a `SEED` op (+line into the vessel). `updateComponentVolume` → an `ADJUST` op (signed
delta to reach the target, external counter-line). `removeComponent` → a `DEPLETE` op
(−line to external). All via `writeLotOperation`; keep the existing form inputs, audit
summaries, and `ActionError`s.
**Tests:** Unit 11 integration.
**Depends on:** Unit 4
**Patterns to follow:** existing `bulk/actions.ts` validation + `parseVolume`.
**Verification:** adding 100 L creates a lot + `VesselLot` row at 100 L via a SEED op.

### Unit 8: Cut bottling draw over to a BOTTLE operation
**Goal:** Bottling consumes lots through the ledger and records `lotId` provenance.
**Files:** `src/lib/bottling/run.ts`; `src/lib/bottling/actions.ts` (if signatures shift).
**Approach:** In `applyBottling`, read `VesselLot` balances for the selected vessels,
`computeProportionalDraw` across **lots**, write a `BOTTLE` op (−lines from vessels to
external) via `writeLotOperation`, and create each `BottlingSource` with `lotId` set **for
new runs going forward** (plus the existing snapshot columns during transition; historical
rows stay null — D11). Keep the `StockMovement` + `BottledInventory` writes exactly as
today. `reverseBottlingTx` becomes a CORRECTION op over the BOTTLE op (D15 guard applies).
**Tests:** Unit 11; preserve `test/draw.test.ts` (pure draw unchanged).
**Depends on:** Units 4, 6
**Patterns to follow:** `bottling/run.ts:33-90`, `draw.ts`.
**Verification:** a bottling run reduces the right `VesselLot` balances and records
`BottlingSource.lotId`; reversing it restores them via a CORRECTION.

### Unit 9: Migrate read paths to the projection
**Goal:** Everything that read `VesselComponent` reads `VesselLot`→`Lot`.
**Files:** `src/lib/vessels/fill.ts`; `src/lib/bulk/blend.ts`; `src/lib/vineyard/data.ts`
or vessel data reads as found; `src/app/(app)/vessels/page.tsx`,
`src/app/(app)/bulk/page.tsx`; assistant component reads (e.g.
`src/lib/assistant/tools/query-transfers.ts` and any vessel-composition reader).
**Approach:** `computeFill` sums `VesselLot.volumeL`. Keep `classifyBlend`'s input
signature `(varietyId, varietyName, volumeL)` stable (map `VesselLot`+`Lot` into it) so
`test/blend.test.ts` is untouched. Update page/data loaders to join `VesselLot`→`Lot`.
Confirm Next.js 16 server-component conventions against `node_modules/next/dist/docs/`
before editing any `page.tsx`.
**Tests:** `test/blend.test.ts` stays green unchanged.
**Depends on:** Units 2, 4
**Patterns to follow:** existing read loaders; `blend.ts:16-28`.
**Verification:** `/vessels` and `/bulk` render correct composition from the projection.

### Unit 10: Day-Zero migration to Legacy Lots (D11)
**Goal:** Move all existing wine into the new model without fabricating history.
**Files:** new migration + a one-shot script `scripts/migrate-legacy-lots.ts`.
**Approach:** In **one transaction**, for each `VesselComponent`: create a `Lot`
(`form=WINE`, `isLegacy=true`, attributes from the tuple, `vintageYear` from `vintage`,
`legacySnapshot` = the tuple JSON); a `SEED` `LotOperation` with a `+volumeL` line into the
vessel; the `VesselLot` balance. **Idempotent** via a deterministic mapping from each
`VesselComponent.id` → exactly one legacy Lot + one SEED op (re-runs must not duplicate).
**Do NOT backfill `BottlingSource.lotId`** (fabricated provenance — D11). **No** links to
historical `HarvestPick`/`VesselTransfer`. After writing, **recompute the projection from
the ledger and assert it matches** the rows just written, and assert per-vessel volume
conservation; **abort on any drift > 0.01 L**. Leave `vessel_component` in place and
readable — **archiving/dropping it is a SEPARATE later step, not this migration** (Units
5–9 still read it until they cut over; eng review). Take a Postgres snapshot first; run on a
Neon branch before main.
**Tests:** the migration-verification asserts conservation + projection==fold (Unit 11).
**Depends on:** Units 2, 4
**Patterns to follow:** raw-SQL migration style; Neon branch dry-run.
**Verification:** for every vessel, Σ`VesselLot.volumeL` == Σ old `VesselComponent.volumeL`
(±0.01 L); projection == fold of the seeded ledger; re-running the script changes nothing;
no orphan balances; `BottlingSource.lotId` untouched (null on historical rows).

### Unit 11: Invariant harness + concurrency + parity verification
**Goal:** Prove the spine: projection always equals the fold of the ledger, even under
concurrent writes, and provide a rebuild/parity tool for operational recovery.
**Files:** `test/ledger-projection.test.ts`, `test/ledger-rack-e2e.test.ts`,
`test/ledger-concurrency.test.ts` (new); `scripts/verify-projection.ts` (parity checker +
rebuild-from-ledger).
**Approach:** Property-style test: apply a sequence (seed → rack → correct → bottle) and
assert the running projection equals `foldLines` over the full ledger at each step, no
negatives, every op summing to zero, deterministic by `sequence`. **Concurrency test:** two
racks from one vessel (and a rack racing its correction) must not overdraw/overfill — one
wins, the other retries or fails cleanly via the DB constraints. A scripted e2e (Neon test
branch) racks a legacy lot and corrects it, asserting balances + op immutability + that the
D15 guard blocks a correction after a later op. **`verify-projection.ts`** recomputes
`VesselLot` from the ledger and diffs it against stored rows (a drift becomes operationally
recoverable, not silent).
**Tests:** this unit is tests + the parity tool.
**Depends on:** Units 3–10
**Patterns to follow:** `test/draw.test.ts`, `test/blend.test.ts`.
**Verification:** full vitest suite green (incl. concurrency); `npm run build` clean;
existing tests unchanged; `verify-projection.ts` reports zero drift post-migration.

## Test Strategy

**Unit tests (primary):** pure ledger math in `test/ledger-math.test.ts` — fold invariants,
proportional rack across lots, loss balancing, correction restore + blocked-correction,
tiny-volume edge cases. Preserve `test/draw.test.ts` and `test/blend.test.ts` unchanged as
regression guards.
**Property test:** `test/ledger-projection.test.ts` asserts projection == fold-of-ledger
across an operation sequence.
**Integration / manual verification:** on a Neon branch, run the Day-Zero migration and
confirm per-vessel volume conservation; in the running app, rack wine between two vessels
and confirm `/vessels` composition; correct the rack and confirm restoration plus that both
operations remain in the ledger; run a small bottling and confirm `BottlingSource.lotId` and
`BottledInventory` are correct.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Concurrency: lost updates / vessel overfill under racing writes** | MED | HIGH | SERIALIZABLE + canonical row-lock + DB constraints (`volumeL>0`, capacity, unique `correctsOperationId`); `withWriteRetry`; explicit concurrency test (Unit 11). |
| **Float drift breaks `sum(deltaL)=0`** | MED | HIGH | Integer-centiliter / `Prisma.Decimal` math only, never `parseFloat`; dust/functional-zero rule; sum-exact tests. |
| Day-Zero backfill miscounts volume or orphans balances | MED | HIGH | One-tx idempotent deterministic mapping; Neon-branch dry-run + snapshot; abort on >0.01 L drift or projection≠fold; parity checker. |
| Cutover (Units 5–9) leaves a dual-source-of-truth window | MED | HIGH | Expand→backfill→parity-verify→one gated code-switch commit; archive old table later; maintenance window. |
| Correction semantically wrong despite valid math (topped/blended onward) | MED | HIGH | D15 guard: block if any later non-correction op touched the positions; not "enough volume" alone; explicit blocked-case test. |
| `VesselTransfer` read-model drifts from the ledger | LOW | MED | Unique `lotOperationId` FK; written only by the ledger writer; "reverted" derived from a correction op. |
| Next.js 16 server-component API drift on page edits | LOW | MED | Page edits are read-only loaders; confirm against `node_modules/next/dist/docs/` before touching `page.tsx`. |
| Scope creep into blends/harvest/RBAC | MED | MED | Hard scope boundaries above; lineage + vessel-group tables are structure-only this phase. |

## Success Criteria

- [ ] `Lot`, `LotOperation` (enum type, monotonic `sequence`, provenance), `LotOperationLine`,
      `LotLineage`, `VesselGroup`/`VesselGroupMember`, `VesselLot` exist; migration applies;
      `prisma generate` succeeds.
- [ ] DB constraints enforced: `CHECK(volumeL>0)`, `deltaL<>0`, unique `correctsOperationId`,
      vessel capacity; rejected at the DB, not just app code.
- [ ] D1–D15 recorded in the context-ledger; `docs/INVARIANTS.md` + `src/lib/ledger/
      vocabulary.ts` exist.
- [ ] Racking writes a RACK operation; the projection == the fold of the ledger, including
      under two concurrent racks (no overdraw/overfill).
- [ ] Undo is a CORRECTION operation; originals immutable; the correction is blocked when a
      later op touched the positions (D15).
- [ ] Manual bulk edits and bottling draw go through the ledger; new bottling runs set
      `BottlingSource.lotId`; historical rows untouched (no fabricated provenance).
- [ ] Day-Zero migration wraps every component as a Legacy Lot with a snapshot, no fabricated
      lineage, per-vessel volume conserved (±0.01 L), idempotent; old table left readable.
- [ ] `verify-projection.ts` reports zero drift; all existing tests pass; new ledger math +
      projection + concurrency tests pass; `npm run build` is clean.
