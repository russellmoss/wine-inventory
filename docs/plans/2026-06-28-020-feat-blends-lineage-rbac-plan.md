---
title: Blends, Lineage Tree & RBAC Redesign (Phase 5)
type: feat
status: completed
date: 2026-06-28
branch: main
depth: deep
units: 12
---

> **Built on `main`** (2026-06-29): Phase 4 chemistry/tasting was merged to `main`, but the
> original worktree branch `claude/zen-chebyshev-b2195e` lacked it. Per the Phase-5 dependency
> on Phase 4, the work was executed on `main` (which has Phase 4). All 12 units (+ 8b) shipped;
> `scripts/verify-blends.ts` = 39/39 PASS; full suite 486 tests; build clean.

## Overview

Phase 5 makes **blending** a first-class ledger operation: draw (partial or full) from N
parent lots across vessels, originate a **new child lot** with its own code/identity/
records, and record a parent→child **lineage DAG**. It ships the **lineage-tree
visualization** (walk a lot's ancestors + descendants), **bench trials** (throwaway
small-scale trial blends that don't touch the ledger until one is *promoted*), and the
**D9 RBAC redesign** so a lot whose sources span multiple vineyards is authorized
correctly — the hard prerequisite the ROADMAP says must land before blends.

The blend goes **through** `writeLotOperation` (unlike Phase 4 chemistry, which is
off-ledger). It's "rack from N sources into one new lot," conserving volume under the
existing double-entry + SERIALIZABLE + capacity guarantees.

## Problem Frame

A winery's signature wines are blends. Today the ledger can move and treat wine but
**cannot homogenize multiple lots into a new wine with its own identity** — the one
operation that defines a winemaker's craft. Phases 1–3 deliberately built the bones for
this (`LotLineage` with `fraction`/`kind`, vintage-as-attribute, snapshot-only lot
origin) and deferred the operation itself to here. Phase 4 sharpened the need: it
established that *a multi-lot vessel IS a blend* ("you can't analyze one part of a
blend") and pointed every multi-resident case at "record a blend (Phase 5)."

Do nothing and: blends stay in spreadsheets, lineage/traceability is impossible, the cost
roll-up (Phase 8) has no DAG to traverse, and the Phase 4 multi-resident-vessel notice
points at a feature that doesn't exist.

**Product pressure test — the RBAC reframe.** The ROADMAP frames D9 as a scary
"redesign RBAC before blends." Research says otherwise: cellar/lot/vessel reads have
**zero** vineyard scoping today (any manager sees every lot), and the single-vineyard
assumption lives in exactly one column (`User.assignedVineyardId`) + one predicate
(`canManagerAccessVineyard`), used in only 3 vineyard-ops domains. So the real D9 work is
small and surgical: a membership *set* instead of a single FK, a source-vineyard set on
each lot, and a decision about whether to *start* scoping lot reads. That decision (Unit
10) is the single biggest open product call — flagged for the reviews.

## Requirements

- MUST: a **`BLEND` ledger operation** through `writeLotOperation` — draws (partial/full)
  from N parent lots in their vessels, seeds a **new child lot** in a destination vessel,
  volume-conserving (`sum(deltaL)=0`), SERIALIZABLE + capacity-guarded (D2/D14).
- MUST: the blend **originates a new Lot** with its own generated code, its own
  attributes (vintage as a nullable attribute — D3; NV/multi-vintage are first-class),
  its own timeline + Phase 4 chemistry/tasting records.
- MUST: write **parent→child `LotLineage` edges** (`kind="BLEND"`, `fraction` = each
  parent's contribution ÷ child total). Support **partial draws** (blend part of a lot,
  leave the rest) and **one-parent→many-children** splits via the same edges → a DAG.
- MUST: **lineage-tree visualization** on the lot detail — walk ancestors + descendants,
  cycle-guarded, reusing the hand-rolled SVG / token conventions (no graph dep).
- MUST: **D9 RBAC redesign** — replace single `assignedVineyardId` with a **vineyard
  membership set**; a per-lot **source-vineyard set**; a set-based access predicate;
  update the 3 existing scoped domains without breaking them. Migration must be safe.
- MUST: **bench trials** — off-ledger trial blends (component lots + proportions + tasting
  outcome + chosen flag); discardable with **zero ledger impact**; a **promote** path that
  turns the chosen trial into a real blend operation.
- MUST: **blend-builder capture UI** (N source vessels/lots + per-source volume →
  destination → new lot), reusing the Phase 3 filterable multi-select + provenance/
  aria-live/≥44px conventions.
- MUST: **two blend modes** — NEW-LOT (empty destination → mint a `[vintage]-BL-<TOKEN>`
  child) and GROW-EXISTING (destination holds one resident lot → it absorbs the draws, keeps
  its code/identity, gains lineage). The winemaker chooses; codes are never rewritten.
- MUST: the existing **Rack action is blend-aware** (Unit 8b) — racking into a vessel holding
  a different lot auto-routes to a GROW-EXISTING blend (keeps destination identity), closing
  the Phase 4 co-residence loophole; racking into empty or same-lot stays a plain rack/merge.
- MUST: **blend correction** (D6/D15) — compensating CORRECTION returns wine to original
  vessels + marks the child CORRECTED (kept), behind a confirmation dialog; blocked only on a
  compositional/locational change (not a tasting note/measurement).
- MUST: a manager can **trace a blend touching their vineyard via an opt-in read-only lens**;
  the cellar itself stays tenant-wide (crews manage vessels, not vineyards) — the ROADMAP
  exit criterion, without restricting cellar collaboration.
- SHOULD: live **composition rollup** (variety/vineyard/vintage %) + a "deplete vessel"
  option in the builder; a flat-composition lineage view by default.
- NICE: live running total + per-component percentage in the builder.

## Scope Boundaries

**In scope:** the BLEND ledger op + new-lot origination; partial draws + lineage DAG;
lineage-tree viz; D9 RBAC (membership set + lot source set + set predicate + the 3 scoped
domains + admin UI); bench trials + promote; blend-builder UI; blend correction.

**Out of scope (and why):**
- **Cost roll-up through blends** — Phase 8. But design the lineage `fraction` + DAG so
  cost traversal is possible later (it's the whole reason the ledger is append-only).
- **Crush/press kg→L transforms originating multiple child lots** — Phase 6. Phase 5
  builds the *split/originate primitive* (one parent → many children via lineage + partial
  draws) general enough that Phase 6 builds press-fraction splits on top of it.
- **Sparkling assemblage/tirage** — Phase 7. **Work orders** — Phase 9.
- **Assistant/voice blend capture** — D10 keeps lineage-mutating ops UI-only; the blend
  builder is UI-only this phase (no voice path).
- **A general policy engine** — D9 stays two predicates (`canAccessVineyard` +
  `canAccessLot`), not an ACL framework.

## Research Summary

### Codebase Patterns

- **Ledger chokepoint** (`src/lib/ledger/write.ts:66`): `writeLotOperation(tx, input)`;
  `WriteOpInput` = `{ type, lines: LedgerLine[], actorUserId, enteredBy, captureMethod,
  note, observedAt, correctsOperationId, lotCodes, vesselCodes, capacityByVessel }`;
  `LedgerLine = { lotId, vesselId|null, deltaL, reason? }`. `assertBalanced` first
  (sum=0, tol 1e-6); capacity guard folds lines vs `capacityByVessel`; updates `VesselLot`
  projection by folding; `runLedgerWrite` wraps in SERIALIZABLE + `withWriteRetry` (P2034
  ×5). **A multi-line op is exactly N parent negatives + child positive(s) [+ optional
  loss line to `vesselId:null`].**
- **Rack planner = the blend template** (`src/lib/ledger/math.ts:81`):
  `planLedgerRack(source, toVesselId, drawL, lossL)` → proportional draw across source
  lots via `computeProportionalDraw` (`src/lib/bottling/draw.ts`), builds `-deduct` source
  lines + `+(deduct-loss)` destination lines + loss line; `foldLines`, `balanceKey`,
  `FUNCTIONAL_ZERO_L=0.01`, Decimal/centiliter math. A blend generalizes this from 1
  source → N sources, destination lot = a freshly minted child (not pre-existing).
- **New-lot origination (SEED)** (`src/lib/bulk/actions.ts:91`): inside `runLedgerWrite`,
  `nextLotCode(tx, {vintage, vineyardAbbr, varietyAbbr, blockCode, ...})` then
  `tx.lot.create({ data: { code, form, originVineyardId, originVarietyId, vintageYear,
  ... } })`, then lines `[{lotId, vesselId, +V}, {lotId, vesselId:null, -V, reason:"seed"}]`.
  Lot model: `code @unique`, `form LotForm`, `origin*Id String?` (snapshots, **no FK**),
  `vintageYear Int?`, `sublotTag?`, `legacySnapshot Json?`, `parentEdges`/`childEdges`.
- **Lot code gen** (`src/lib/lot/code.ts:45` `buildLotCode`, `src/lib/lot/generate.ts:23`
  `nextLotCode` + `disambiguate`): produces `YEAR-VINEYARD-BLOCK[-SUB]-VARIETY[-TAG]`,
  race-safe inside the tx. **`buildLotCode` requires vineyard+variety abbr** → a blend
  spanning vineyards needs a NEW blend-code path (Unit 4).
- **LotLineage** (`prisma/schema.prisma:844`): `{ parentLotId, childLotId, fraction
  Decimal?(6,5), kind String (SPLIT|BLEND|TRANSFORM), @@unique([parentLotId,childLotId]) }`;
  parent `onDelete:Restrict`, child `onDelete:Cascade`. **First real use = Phase 3 topping**
  (`src/lib/cellar/topping.ts:104` upserts edges with `kind:"TOPPING"`, fraction). Read flat
  in `getLotDetail` (`src/lib/lot/data.ts:171`) → `lineage:{parents,children}`. **No graph
  walk exists yet.**
- **Phase 3 multi-select** (`src/app/(app)/bulk/GroupActions.tsx`): filterable (type/fill/
  vineyard/variety) sectioned vessel multi-select with lot badges (`VesselChip` shows 2 codes
  + "+N"); `Set<string>` selection state. **The blend-builder source picker base.**
- **Rack form** (`src/app/(app)/bulk/CellarActions.tsx:476` `RackForm`): source vessel →
  `drawL` (litres out) → destination select → `landedL` (measured in) → `rackVesselAction`;
  derived loss; `inputMode="decimal"`, `aria-live`, ≥44px. **Generalize 1→N sources.**
- **Correction guard (D6/D15)** (`src/lib/cellar/correct.ts:72`): finds later
  non-CORRECTION lines (`operationId > opId`, `vesselId != null`), builds `touchedKeys` of
  `balanceKey(vesselId,lotId)`, `planCorrection(origLines, currentBalances, touchedKeys)`
  refuses on `downstream-activity` or shortfall → `CONFLICT`. **Reuse verbatim for blend
  correction; child-lot downstream ops will trip it.**
- **Lot detail** (`src/app/(app)/lots/[id]/`): server page awaits `params` (Next 16),
  `getLotDetail` → `LotDetailClient`; renders header + current state + timeline; **lineage
  section slot is empty** (flat parents/children only). SVG reference: `BrixChart.tsx`
  (viewBox 800×h, `scaleLinear`, tokens, `<title>` tooltips) + the Phase 4
  `AnalyteTrendChart`.
- **Server-action conventions**: `action()`/`adminAction()` wrappers
  (`src/lib/actions.ts`), `"use server"` thin wrappers + `revalidatePath`, `writeAudit(tx)`
  in-tx, Prisma singleton. Vitest pure tests in `test/ledger-math.test.ts` etc.

### Prior Learnings / Decisions

- **Context-ledger empty** (confirmed) — VISION §11 + ROADMAP authoritative.
- **`OperationType` has NO `BLEND` value yet** — must add it in its **own enum-only
  migration** (Postgres `ALTER TYPE … ADD VALUE` can't run in a txn nor be used in the same
  migration that adds it — the locked Phase 3 gotcha). D4: controlled enum, extended per
  phase.
- **`LotLineage` is structure-only + first-used by topping** — Phase 5 is its first
  blend use. `fraction`/`kind` already model partial draws + DAG.
- **Lot origin = snapshots, no FK, immutable after first op** (`Lot.originVineyardId?`,
  etc.). A blend has no single origin → set them NULL and rely on a new source-set table.
- **Windows/Neon migrations** (`memory/prisma-neon-migrations-windows.md`): `migrate dev`
  broken; hand-author SQL via `migrate diff --from-url $DATABASE_URL_UNPOOLED | grep -v
  search_vector` **in the Bash tool**, `migrate deploy`, stop dev server before `generate`;
  `@unique` on nullable = partial unique; **new enum values isolated**.
- **Phase 4 memory** (`measurements-attach-to-one-lot.md`): a multi-lot vessel IS a blend;
  the analysis belongs to the combined lot. Phase 5's destination rule (resident lot must
  be a parent or vessel empty) enforces that physically.

### External Research (winemaking domain)

- **Blends** combine separately-kept component lots (variety/vineyard/vintage/barrel/
  free-run vs press) into a new wine with one identity; can assemble into a fresh tank OR
  "blend B into A's tank" — either way once homogenized it's a new lot, never un-blendable.
  → **new child lot + N parent lineage edges, regardless of physical vessel.**
- **NV/multi-vintage (TTB 27 CFR 4.27):** vintage date needs ≥95% (AVA) / ≥85%
  (state/county) from one year; NV blends carry no vintage; réserve-perpétuelle toppings
  are continuously multi-vintage. → **vintage is a nullable attribute, never identity (D3).**
- **Bench trials:** small graduated-cylinder trials (e.g. 60/30/10), tasted/scored, one
  winner *chosen*, then *promoted* (scaled to tank). Trials are throwaway until chosen; not
  ledger ops. → trial needs component lines (lot + mL/%) + base size + tasting outcome +
  chosen flag; promote scales ratios to tank litres.
- **Partial blends / splits:** blending only part of a lot (200 of 500 L) and splitting one
  lot into many children (free-run vs press, reserves) are standard → partial draws +
  many-edges-from-one-parent (the DAG).

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|-------------|-----------|
| Blend = ledger op | Through `writeLotOperation`: N parent `-draw` lines + child `+total` line (+ optional `-loss` to `vesselId:null`); generalize `planLedgerRack` → `planBlend` | Off-ledger like Phase 4 chemistry | A blend MOVES liters and conserves volume — it's the archetypal ledger op (D2). Phase 4 records describe liquid; blends transform it. |
| New `OperationType` value | Add `BLEND` in an **isolated enum-only migration** (Unit 1), separate from the migration that uses it | Reuse `RACK`; free-text | D4 controlled enum; Postgres enum-add gotcha forces isolation. A blend is semantically distinct (originates a lot). |
| **Blend target — two modes (council C1, user)** | **NEW LOT** (empty destination, or winemaker picks "new blend") → mint a child lot. **GROW EXISTING** (destination holds one resident lot) → the resident lot **absorbs** the draws, keeps its identity + code, gains parent lineage edges + updated composition (generalizes Phase 3 topping to N sources) | Always mint a new lot for every blend | Not every blend is a new wine — adding 2% PV to the Estate Cab, or press back into free-run, should grow the existing lot, not spawn a code. The mode is the winemaker's explicit choice. |
| **Rack ↔ Blend unification (user)** | The existing **Rack action becomes blend-aware** (Unit 8b): rack into an **empty** vessel → plain RACK (unchanged); into a vessel holding the **same** lot → merge (no blend); into a vessel holding a **different** lot → **auto GROW-EXISTING blend** — destination keeps its identity, gains lineage + composition, with an inline "blended into <code>" note and a one-tap "make a new blend instead" escape (mints a `BL-<TOKEN>`). Shares `blendLotsCore`. The `/blend` builder stays for deliberate multi-source assembly + trial promotion | Tell the user "go use the blend feature" (redirect); block rack-into-occupied; let racking silently create co-resident lots (today's loophole) | Racking into occupied wine IS a blend physically; forcing a separate tool fights the cellar workflow (design review). Sequential rack-rack-rack now accretes correct lineage with zero extra steps. Closes the Phase 4 multi-lot-vessel loophole at its source. |
| **Child-lot code (user)** | New blend lot code = **`[vintage]-BL-<TOKEN>`**, `<TOKEN>` = a winemaker-set 2–4 letter tag (e.g. `2024-BL-EST`); NO vineyard/variety segment; `origin*Id` NULL. **Codes are immutable once a lot has ops** — GROW-EXISTING keeps the resident's code unchanged | Force a dominant vineyard/variety into a blend code; rewrite an existing lot's code when it becomes a blend | A multi-source blend must NOT masquerade as single-origin (user). Code immutability is a Phase 1 invariant (codes are stamped on every ledger line) — so "becoming a blend" with a new code = the NEW-LOT mode; growing keeps identity. Traceability lives in lineage + composition rollup, not the code string. |
| Lot source-vineyard set | New **`LotVineyard`** join `(lotId, vineyardId)`; populated at SEED (from `originVineyardId`) and at BLEND (**union of parents' full source sets** — inductively transitive; **contagious `provenanceComplete=false` if any parent has unknown membership** — council C6); backfilled for existing lots | Re-derive by walking lineage on every read; union only *known* parent rows | A blend has many source vineyards; a cheap set is materialized at write time. Inductive union stays complete because every parent already carries its full set; a null-origin parent must taint, not silently shrink, the child's provenance. |
| D9 membership model | New **`UserVineyard`** join `(userId, vineyardId)` (`@@id([userId,vineyardId])`) replacing single `User.assignedVineyardId`; backfill, **dual-read for one release**, then drop `assignedVineyardId` in a separate migration (council S3) | Keep single FK; array column; full ACL engine | The single-vineyard assumption is one column + one predicate. A set is the minimal correct shape; dual-read before the irreversible drop. |
| Access predicate | `canAccessVineyard(user, vineyardId)` = admin OR `vineyardId ∈ user.vineyardIds`; `canAccessLot(...)` = admin OR source-set ∩ user set ≠ ∅. Update the **3 existing scoped domains** (harvest/fieldnotes/assistant) to set-membership | Keep equality on a single id | Equality can't express a multi-vineyard blend. (Used for the read-only lens, not to restrict the cellar — see below.) |
| **Cellar access — keep tenant-wide (council C4, user)** | **Do NOT scope cellar/lot reads.** Cellar/lot/vessel reads stay visible to all managers (crews manage vessels, not vineyards). D9 = the membership model + per-lot source set + set predicate + the 3 existing scopes; **add a vineyard-manager "my fruit downstream" read-only LENS** (a filter, not an access wall) to satisfy the ROADMAP exit | Restrict `listLots`/`getLotDetail` by source-vineyard membership | **Both reviewers + research:** scoping the cellar by grape origin hides co-managed tank wine from the crew racking it, and (Codex) would leak via vessels/counts/search/lineage unless scoped everywhere. The lens gives managers traceability without breaking collaboration. |
| Destination vessel rule | NEW-LOT mode: destination must be **empty** (validated on the **post-op** resident set — council S4: `toVesselId` ends holding exactly the child). GROW mode: destination holds **exactly one** resident lot, which absorbs the draws | Allow blending into a tank holding an unrelated foreign lot | Never leave two unrelated lots co-resident (Phase 4 memory). Post-op validation closes the "destination is also a source" gap. |
| Bench trials | Off-ledger `BlendTrial` + `BlendTrialComponent` (component lot + mL/%/volume) + tasting outcome (reuse Phase 4 `TastingScoreScale`/`TastingReadiness`) + `status DRAFT/CHOSEN/PROMOTED/DISCARDED`. **Promote** = prefill the blend builder with the chosen ratios scaled to tank litres → real BLEND op; link `promotedToLotId` | Trials as draft ledger ops; trials mutate lineage | Trials are throwaway tasting experiments — zero ledger impact until promoted (parallels Phase 4 off-ledger records + the real bench workflow). |
| Blend correction (D6/D15, council C5 + user) | Compensating CORRECTION op returns each parent's drawn volume **to its original source vessel/position**; mark child `status=CORRECTED` (keep row + lineage for audit). **Confirmation dialog** states "wines return to their original vessels [list]" and confirms before executing. **Blocked only on a compositional/locational change** (child racked, another lot added, bottled) — **NOT** on a tasting note or measurement (those reattach to the parent or orphan) | Hard-delete; block on ANY later record incl. tasting/measurement | D6 append-only (keep-and-mark). User: an undo right after a blend is a mistake-fix — wines go back where they came from, with a confirm. Council C5: tasting/measuring right after a blend is normal; locking on it is a support-ticket magnet. |
| Lineage viz (council S8) | `src/lib/lot/lineage.ts` graph walk (cycle-guarded, batched loads) feeding TWO views: a **flat composition rollup** (weighted % by variety/vineyard/vintage — the default) + a node tree **defaulting to immediate parents/children** with "expand ancestry" | Deep node graph as the primary view | A multi-vintage solera's ancestry is unreadably deep; winemakers want "what's in this wine" (flat %) first, the graph second. Design review owns the visual. |
| Composition rollup (council S7) | Live on the blend builder + lot detail: weighted variety / vineyard / vintage % from component volumes, with a vintage-eligibility flag (e.g. "2023 eligible 86%") | Make the winemaker compute blend % by hand | Winemakers blend specifically to hit label %s; the data's all present. (Display/derive only — full TTB compliance engine stays out of scope.) |

## Implementation Units

### Unit 1: Add `BLEND` to the OperationType enum (isolated migration)

**Goal:** Make `BLEND` a valid controlled operation type, in its own migration.
**Files:** `prisma/schema.prisma` (enum), `src/lib/ledger/vocabulary.ts` (TS mirror +
`OPERATION_TYPES`), `prisma/migrations/<ts>_add_blend_optype/migration.sql`.
**Approach:** Add `BLEND` to `OperationType` (after `CAP_MGMT`) and to the TS
`OPERATION_TYPES` tuple. The migration is **enum-only** — `ALTER TYPE "OperationType" ADD
VALUE 'BLEND'` — authored alone so no later migration in the same step uses it (Postgres
gotcha). Hand-author per the Windows/Neon flow (Bash tool, `grep -v search_vector`,
`migrate deploy`, stop dev server, `generate`).
**Tests:** none (enum). Build + `generate` clean.
**Depends on:** none. **Execution note:** must land before Unit 5 uses the value.
**Patterns to follow:** the Phase 3 enum-add (`ADDITION`/`FINING`/… migration).
**Verification:** `migrate deploy` + `generate` clean; `BLEND` typechecks in `OperationType`.

### Unit 2: Schema — source set, RBAC membership, bench trials

**Goal:** Add `LotVineyard`, `UserVineyard`, `BlendTrial`, `BlendTrialComponent` + relations.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_blend_lineage_rbac/migration.sql`.
**Approach:** Conventions: `@id @default(cuid())`, `@@map` snake_case, `Decimal @db.Decimal`.
- `LotVineyard`: `{ id, lotId, vineyardId, createdAt }`, `@@unique([lotId, vineyardId])`,
  `@@index([vineyardId])` (the scoping query: "lots whose vineyard ∈ my set"). Relation to
  `Lot` (`onDelete:Cascade`) + FK to `Vineyard` (`onDelete:Restrict` — vineyards are durable
  registry rows).
- **BACKFILL (eng-review P1 — non-optional):** the migration MUST populate `LotVineyard`
  for **every existing lot** from `originVineyardId` (and `legacySnapshot.vineyardName`
  resolved to an id where possible). Lots with no resolvable origin vineyard get **zero
  rows and are treated as admin-only-visible** (a defined NULL-source bucket) until
  classified — never silently hidden from everyone. Without this, Unit 10's scoping makes
  every current lot vanish.
- `UserVineyard`: `{ id, userId, vineyardId, createdAt }`, `@@unique([userId, vineyardId])`,
  relations to `User`/`Vineyard` (`onDelete:Cascade`). This replaces `User.assignedVineyardId`
  (dropped in Unit 3 after backfill).
- `BlendTrial`: `{ id, name, note?, baseVolume Decimal? , baseUnit?, status (enum
  BlendTrialStatus DRAFT|CHOSEN|PROMOTED|DISCARDED @default(DRAFT)), score Int?, scoreScale
  TastingScoreScale?, readiness TastingReadiness?, tastingNotes?, chosenAt?, promotedToLotId?
  , provenance block (enteredAt/enteredById/enteredByEmail), createdAt }`. Reuse the Phase 4
  tasting enums. `promotedToLotId` → `Lot` (`onDelete:SetNull`).
- `BlendTrialComponent`: `{ id, trialId, lotId, proportion Decimal(6,5)? , volume Decimal?,
  unit?, createdAt }`, `@@unique([trialId, lotId])`, relation to `BlendTrial`
  (`onDelete:Cascade`) + `Lot` (`onDelete:Restrict`).
- New enum `BlendTrialStatus`. Back-relations on `Lot`/`User`/`Vineyard`.
**Tests:** none (schema). **Depends on:** none (parallel to Unit 1).
**Execution note:** hand-author SQL (Bash tool, `grep -v search_vector`), `prisma validate`
→ `migrate deploy` → stop dev server → `generate`. Add CHECK `proportion ∈ (0,1]` and
`score`-with-scale together-or-neither (mirror Phase 4 S4).
**Patterns to follow:** Phase 4 schema unit; `LotLineage`/`VesselGroupMember` join shapes.
**Verification:** `migrate deploy` + `generate` clean; new models typecheck.

### Unit 3: D9 RBAC — membership set + set predicate + migrate the 3 scoped domains

**Goal:** Replace single-vineyard auth with set membership without breaking existing views.
**Files:** `src/lib/access.ts` (predicate), `src/lib/dal.ts` (`userSelect`/`toAppUser` —
load `vineyardIds`), `src/lib/users/actions.ts` + `src/app/(app)/users/UsersClient.tsx`
(multi-select assignment), `src/lib/harvest/actions.ts`, `src/lib/fieldnotes/actions.ts`,
`src/lib/assistant/scope.ts` + `tools/{query-brix,query-recent-harvests,db-create,db-update}.ts`,
`src/app/(app)/vineyards/{harvest,field-notes,maps}/page.tsx`, a data migration,
`test/access.test.ts`.
**Approach:** Load `vineyardIds: string[]` onto `AppUser` (from `UserVineyard`). Rewrite
`canManagerAccessVineyard` → **`canAccessVineyard(user, vineyardId)`** = admin OR
`vineyardIds.includes(vineyardId)`; keep a thin back-compat alias so call sites migrate
cleanly. Update every site from §3A/3B/3C of the research to set-membership (5 write
checks, 3 read pages, 6 assistant scopes) — the read pages that read
`user.assignedVineyardId` now branch on the set (a manager with N vineyards sees N).
**Data migration (reversibility — eng-review P2):** backfill `UserVineyard` from existing
`assignedVineyardId` (one row each) and **verify single-vineyard-manager parity BEFORE
dropping anything**; **drop `assignedVineyardId`** (column + index + FK) in a **separate
migration step** after the backfill is confirmed, so a backfill bug doesn't ride with an
irreversible column drop. Admin UI becomes a multi-select of vineyards.
**Tests:** `access.test.ts` (pure): admin sees all; member sees only assigned set; empty
set sees none; `canAccessLot` intersection. **Regression (IRON RULE):** a single-vineyard
manager sees EXACTLY the same harvest / field-notes / assistant scope after the
`UserVineyard` migration as before (parity test over the 3 scoped domains).
**Depends on:** Unit 2. **Execution note:** this is the riskiest unit — keep the predicate
pure + unit-tested; do the call-site sweep exhaustively (research lists every site).
**Patterns to follow:** `src/lib/access.ts:31` `canManagerAccessVineyard`;
`src/lib/assistant/scope.ts:13`.
**Verification:** existing harvest/field-notes/assistant scoping still works for a
single-vineyard manager; a 2-vineyard manager sees both; `npm run build` + tests pass.

### Unit 4: Blend lot-code generation (pure)

**Goal:** Generate a unique code for a blend lot that has no single vineyard/variety.
**Files:** `src/lib/lot/code.ts` (add `buildBlendLotCode`), `src/lib/lot/generate.ts` (add
`nextBlendLotCode`), `test/lot-code.test.ts`.
**Approach (user-specified format):** `buildBlendLotCode({ vintage?, token })` →
**`[vintage]-BL-<TOKEN>`** where `<TOKEN>` is a **winemaker-set 2–4 letter tag**
(uppercased/slugged), e.g. `2024-BL-EST`; `NV-BL-<TOKEN>` when no vintage. **No
vineyard/variety segment** — a multi-source blend must not masquerade as single-origin.
Validate `token` is 2–4 `[A-Z]`. Reuse `disambiguate` for `-2/-3`. `nextBlendLotCode(db,
input)` mirrors `nextLotCode` (race-safe inside the tx). NOTE: only the **NEW-LOT** blend
mode generates a code; GROW-EXISTING keeps the resident lot's immutable code.
**Tests:** vintage present/absent; token validation (rejects too long/non-alpha);
uppercasing; disambiguation; collision with an existing blend code.
**Depends on:** none (pure). **Execution note:** test-first.
**Patterns to follow:** `src/lib/lot/code.ts:45` `buildLotCode`, `generate.ts:23`.
**Verification:** `npm test -- lot-code` passes.

### Unit 5: Blend ledger core — `planBlend` + `blendLotsCore`

**Goal:** Execute a blend (NEW-LOT or GROW-EXISTING), drawing from N parents, writing lines
+ lineage + source set, in one transaction.
**Files:** `src/lib/ledger/math.ts` (add `planBlend`), `src/lib/blend/blend-core.ts` (new),
`src/lib/blend/actions.ts` (new, `"use server"`), `test/blend-math.test.ts`.
**Approach:** `planBlend(components: {vesselId, lotId, drawL}[], toVesselId, childLotId,
lossL=0)` → `-drawL` per component (validate each ≤ that position's balance — partial draws
OK), one `+(Σdraw − loss)` child line, optional `-loss` to `vesselId:null`; reuses shared
`assertBalanced`/`computeProportionalDraw` (DRY). **Lineage fraction = gross input share
`parentGross / ΣparentGross`, derived from the persisted negative lines, not request inputs
(council S1 — loss-independent).** **Aggregate per DISTINCT parent lot BEFORE writing edges
(council C2):** if the same lot is drawn from two vessels, sum its contributions into ONE
`LotLineage` row (the `@@unique([parentLotId,childLotId])` would otherwise collapse them /
corrupt the fraction).
`blendLotsCore(actor, input)` runs in `runLedgerWrite`. **Two modes:**
- **NEW-LOT:** validate destination **post-op** holds exactly the child (council S4),
  `nextBlendLotCode(tx,…)`, `tx.lot.create` (origin NULL, vintage from input), the child line
  targets the new lot.
- **GROW-EXISTING:** destination holds exactly one resident lot → that lot is the "child"
  (keeps its code/identity); the child line credits the resident lot; parents that AREN'T
  the resident get lineage edges into it.
Then `writeLotOperation({type:"BLEND", lines, capacityByVessel, lotCodes, vesselCodes})`,
upsert aggregated `LotLineage` edges, populate child `LotVineyard` = **union of parents'
full source sets; set `provenanceComplete=false` if any parent's set is empty/incomplete
(council C6)**, `writeAudit`. **Retry-idempotency (council C3):** on `P2002(code)` regenerate
the code and retry (the SERIALIZABLE `withWriteRetry` only covers P2034). Returns
`{ operationId, childLotId, childCode, mode }`.
**Tests:** `blend-math.test.ts` — 3 parents → balanced child; partial draw leaves remainder;
loss balances; fraction = gross share, sums to 1 (±dust); **same parent from two vessels →
one aggregated edge**; rejects draw > balance; rejects NEW-LOT destination not empty post-op;
GROW mode credits the resident lot.
**Depends on:** Units 1, 2, 4. **Execution note:** test the planner pure; core verified in
Unit 11.
**Patterns to follow:** `planLedgerRack` (`math.ts:81`), SEED origination
(`bulk/actions.ts:91`), topping lineage upsert (`cellar/topping.ts:104`).
**Verification:** `npm test -- blend-math`; build clean.

### Unit 6: Blend correction (D6/D15)

**Goal:** Undo a blend safely — reverse parent draws, mark the child lot CORRECTED (kept for
audit) — or refuse.
**Files:** `src/lib/blend/blend-correct.ts` (or extend `src/lib/cellar/correct.ts`),
`test/blend-correct.test.ts`.
**Approach:** Reuse the existing guard: collect later non-CORRECTION `touchedKeys`; refuse
(`CONFLICT`) **only on a compositional/locational change** — the child was racked, another lot
entered the destination, or it was bottled (council C5 + user). **A tasting note or
measurement does NOT block** (they reattach to the surviving parent, or orphan/soft-delete).
On success, write a `CORRECTION` op with inverse lines returning **each parent's drawn volume
to its ORIGINAL source vessel/position** (user), and **mark the child `Lot.status =
"CORRECTED"`, KEEPING the row + `LotLineage` + `LotVineyard` for audit (no hard delete)**.
The UI shows a **confirmation dialog** first: *"Undo this blend? The wines return to their
original vessels: [list]."* (user). Parity stays ledger-fold vs `VesselLot` (NOT presence of
`Lot` rows — council S2); assert the correction leaves **no residual `VesselLot`** for the
child; `CORRECTED` lots are excluded from active lists by explicit predicate, kept in lineage.
**Tests:** correct a fresh blend → parents restored to original vessels, child CORRECTED +
lineage retained; **a blend with only a tasting note still undoes** (note reattaches/orphans);
refuse when the child was racked; refuse when another lot entered the destination; parity
holds after correction.
**Depends on:** Unit 5. **Patterns to follow:** `src/lib/cellar/correct.ts:72`
(`planCorrection` + downstream guard).
**Verification:** `npm test -- blend-correct`; build clean.

### Unit 7: Lineage graph walk + lineage-tree visualization

**Goal:** Walk a lot's ancestry/descendants and present BOTH a flat composition rollup
(default) and a node tree (immediate-first).
**Files:** `src/lib/lot/lineage.ts` (pure walk + rollup), `src/lib/lot/data.ts` (load lineage
for the detail), `src/components/lot/LineageTree.tsx` + `CompositionRollup.tsx` (new),
`src/app/(app)/lots/[id]/LotDetailClient.tsx` (render), `test/lineage.test.ts`.
**Approach:** `lineage.ts`: BFS up/down with a `visited` cycle guard, bounded depth, batched
edge loads + a single `IN` query for codes/source-sets (no N+1). Add **`composeRollup(lot)`**
→ weighted **% by variety / vineyard / vintage** from the lineage fractions (council S8/S7).
**Two views (council S8):** `CompositionRollup` (flat %, the DEFAULT — "what's in this wine")
+ `LineageTree` defaulting to **immediate parents/children** with an "expand ancestry" toggle
(a solera's full tree is unreadable). Hand-rolled, tokens, `<title>` tooltips. **Design
(plan-design-review):** the common case is a lot with NO lineage (not a blend) — render
nothing/omit the section rather than an empty graph; composition rollup uses the harvest
variety colors; the tree is a tight token-styled 2-level diagram with fraction-labeled edges,
not decorative nodes.
**Tests:** `lineage.test.ts` (pure) — multi-parent resolves all parents; split resolves all
children; cycle terminates; depth bound; **`composeRollup` weights a 60/30/10 blend to the
right variety/vineyard/vintage %s**.
**Depends on:** Unit 2 (edges written by Unit 5). Build the walk against fixtures first.
**Patterns to follow:** flat lineage read (`lot/data.ts:171`); `BrixChart.tsx` SVG +
tokens.
**Verification:** `npm test -- lineage`; a blended lot shows its parents + the child shows
on each parent; design-review pass.

### Unit 8: Blend-builder capture UI

**Goal:** A vessel-first surface to assemble a blend (new lot OR grow existing): pick N
source vessels/lots + per-source volume → destination → execute.
**Files:** `src/app/(app)/blend/page.tsx` + `BlendBuilderClient.tsx` (new), nav entry in
`src/components/AppShell.tsx`, wiring to `blendLotsAction` (Unit 5).
**Approach:** Reuse the Phase 3 filterable multi-select (`GroupActions`) for source
vessels/lots; per-source volume input (`inputMode="decimal"`, default = full balance) with a
**"deplete vessel completely" checkbox** (council S5 — pull the stated volume, zero the
source, write the heel off as loss; kills 5 L ghost lots). Live running total + **composition
rollup** (variety/vineyard/vintage % + vintage-eligibility flag — council S7, `aria-live`).
**Destination select drives the mode:** an empty vessel → NEW-LOT (show the `BL-<TOKEN>` +
optional vintage fields); a vessel with one resident lot → GROW-EXISTING (show "adds to
<lot code>", no new code). Optional loss. Provenance + ≥44px + "Logged · Undo" toast; Undo →
the Unit 6 **confirmation dialog** ("wines return to their original vessels"). Server
re-validates the destination rule + live balances.
**Design specs (plan-design-review):**
- **Layout — single page + sticky summary (user).** Source rows in the main column; a
  **persistent summary panel** (running total, composition %, current MODE, Execute) docked
  to the side on desktop, a **sticky bottom bar on tablet** (the cellar device) so total +
  Execute stay visible. Hierarchy: sources → volumes (running total dominant) → destination
  → name → execute.
- **Mode banner:** unmistakable — *"Creating new lot 2024-BL-EST"* vs *"Adding to
  2024-GS-CAB"* — so it's always clear whether a new code is minted.
- **Interaction states:** `<2 sources` → "Pick at least two wines to blend" (Execute
  disabled); over-draw → inline error on the offending row; empty cellar → guidance, not a
  blank grid; saving → busy Execute; **on success navigate to the new/destination lot's
  detail** (its lineage + composition), not back to an empty builder.
- **Composition rollup** reuses the harvest dashboard variety colors (no new palette).
- **Responsive:** source rows stack on tablet; summary → sticky bottom bar; ≥44px targets.
**Tests:** none new (UI); logic mirrors `RackForm`/`GroupActions`. Covered by Unit 11.
**Depends on:** Units 5, 6. **Patterns to follow:** `GroupActions.tsx` (multi-select),
`CellarActions.tsx` `RackForm` + toast/Undo.
**Verification:** in `/blend`, select 3 vessels, set volumes → execute → new lot appears
with lineage; Undo reverses it.

### Unit 8b: Rack action becomes blend-aware (close the co-residence loophole)

**Goal:** Make the existing per-vessel **Rack** action route to a blend when the destination
already holds a different lot, so incremental rack-rack-rack into one vessel accretes correct
lineage — without a separate tool or silent co-residence.
**Files:** `src/lib/vessels/rack-core.ts` (branch on destination residents),
`src/app/(app)/bulk/CellarActions.tsx` (`RackForm` — inline destination note + escape),
`src/lib/cellar/actions.ts` (wire), `test/rack-blend.test.ts`.
**Approach:** In `rack-core`, inspect the destination's `VesselLot` residents:
- **empty** → plain `RACK` op (today's path, unchanged);
- **same lot** as the source → plain `RACK`/merge (the `(vessel,lot)` balance just grows; no
  lineage, not a blend);
- **different lot** → route through `blendLotsCore` in **GROW-EXISTING** mode: the resident
  lot absorbs the rack, keeps its code/identity, gains a `BLEND` lineage edge + updated
  `LotVineyard` (writes a `BLEND` op, not `RACK`).
`RackForm` detects an occupied-by-different-lot destination and shows an inline note —
*"Tank 4 holds 2024-GS-CAB. Racking here blends them — kept as 2024-GS-CAB."* — with a
one-tap **"make a new blend instead"** (mints a `BL-<TOKEN>`, NEW-LOT mode). This **closes
the Phase 4 multi-lot-vessel loophole at the write path**: racking can no longer leave two
unrecorded co-resident lots. Lees-loss on the rack is still derived (out − landed) as today.
**Tests:** `rack-blend.test.ts` — rack into empty = RACK, no lineage; rack same lot = merge,
no lineage; rack different lot = BLEND op + grow-existing edge + destination keeps code; the
"new blend" escape mints a `BL-` lot. Projection parity holds in every case.
**Depends on:** Units 5 (blend core), 6 (correction). **Patterns to follow:**
`src/lib/vessels/rack-core.ts`, `src/lib/cellar/topping.ts` (lineage upsert), `RackForm`.
**Verification:** rack barrel A into a tank holding lot B → tank shows ONE lot (B, grown)
with a lineage edge from A; no co-resident rows; `/lots/B` shows A as a parent.

### Unit 9: Bench trials + promote-to-blend

**Goal:** Create/edit/score throwaway trial blends; promote the chosen one into a real blend.
**Files:** `src/lib/blend/trials.ts` (new core), `src/lib/blend/actions.ts` (trial actions),
`src/app/(app)/blend/trials/` (list + editor) or a tab on `/blend`, nav entry.
**Approach:** `createTrialCore`/`updateTrialCore` (components = lot + proportion or volume;
plus a **`targetWine`/intent field** so trials group by what they aim at — council S9),
`scoreTrialCore`, `chooseTrialCore` (CHOSEN), `discardTrialCore` (DISCARDED — zero ledger
impact). **`promoteTrialCore` does NOT auto-execute (council S6):** it opens the Unit 8
builder **prefilled** with the trial's ratios scaled to target tank litres (mL→L), the
winemaker **tweaks absolute litres at the tank** and confirms; on execute, `blendLotsCore`
runs and the trial flips `status=PROMOTED` + `promotedToLotId`. Re-validate parent volumes at
execution (a parent may have drained/depleted since the trial). Trials never call
`writeLotOperation` until execution. UI: a trials list grouped by target/intent (DRAFT/CHOSEN)
+ an editor with component rows + tasting fields + Choose/Discard/Promote. **Design
(plan-design-review):** warm empty state ("No trials yet — start one to compare blend
ratios" + primary action), not "No items found"; discard confirms (feels reversible); the
editor reuses the builder's running-total + composition panel so a trial previews the blend
it will become.
**Tests:** trial create/score/choose/discard pure logic; promote scales 60/30/10 of 600 L →
360/180/60 (mL→L); a depleted component is flagged at promote, not silently mis-scaled.
**Depends on:** Units 2, 5, 8. **Patterns to follow:** Phase 4 off-ledger record cores +
`action()` wrappers; the blend builder.
**Verification:** create a 60/30/10 trial, score it, choose, promote → a blend lot with
3 parents at the right volumes; discard a trial → no ledger rows.

### Unit 10: "My fruit downstream" read-only lens (cellar stays tenant-wide)

**Goal:** Satisfy the ROADMAP exit (a manager can trace a blend touching their vineyard)
**without** restricting the cellar — cellar/lot/vessel reads stay visible to all managers
(council C4 + user: crews manage vessels, not vineyards).
**Files:** `src/lib/lot/data.ts` (add an OPTIONAL `sourceVineyardIn` *filter* to `listLots`,
NOT an enforced scope), `src/app/(app)/lots/` (a "My vineyards' lots" toggle/lens for
managers), `src/lib/access.ts` (`canAccessLot` exists for the lens/highlighting, not gating),
`test/access.test.ts`.
**Approach:** Do **NOT** add a mandatory vineyard `where` to `listLots`/`getLotDetail` — they
stay tenant-wide (no behavior change, no regression). Instead add an **opt-in lens**: a
manager can filter the lot list to "lots whose source set intersects my vineyards" (uses
`LotVineyard` + `canAccessLot`), and a blend spanning their vineyard surfaces in it
(intersection non-empty). The lens is a *view*, not a wall — admins and other managers still
see everything. This keeps Codex's leak surface (counts/search/vessels/lineage) a non-issue
because nothing is hidden.
**Tests:** `access.test.ts` — the lens for a manager of A returns a blend with sources {A,B}
and excludes a {C}-only lot; with the lens OFF the manager still sees all lots (tenant-wide).
**Depends on:** Units 3, 5 (LotVineyard populated). **Patterns to follow:** `assistant/scope.ts`
set logic (for the lens predicate), `lot/data.ts` `listLots` optional filters.
**Verification:** the ROADMAP exit criterion — a one-vineyard manager, via the lens, sees a
blend spanning theirs; with the lens off, still sees the whole cellar (no regression).

### Unit 11: Verify script + exit-criteria proof

**Goal:** Prove the Phase 5 exit criteria end-to-end deterministically.
**Files:** `scripts/verify-blends.ts` (new, `tsx --env-file=.env`).
**Approach:** Seed 3 lots in 3 vessels across 2 vineyards → NEW-LOT blend (partial draw from
one) → assert: one new child lot with a `BL-<TOKEN>` code, 3 aggregated BLEND lineage edges,
fractions (gross share) summing to 1, volume conserved (projection == fold), child
`LotVineyard` = union of parents', partial-drawn parent retains its remainder. Assert the
**lens** for a manager of A returns the blend; lens for C does not; **lens-off, the A manager
still sees the whole cellar** (no scoping regression). GROW-EXISTING blend → resident lot
keeps its code, gains an edge. Same parent from two vessels → one aggregated edge. Create +
promote a 60/30/10 bench trial → correct blend volumes; discard a trial → zero ledger rows.
Correct a fresh blend → parents restored to original vessels, child CORRECTED + lineage kept;
a blend with only a tasting note still undoes; re-blend + rack the child + attempt correct →
refused (D15). **Rack-aware (Unit 8b):** rack lot A into a tank holding lot B → assert ONE
resident lot (B, grown) + a BLEND op + lineage edge from A + no co-resident rows; rack into an
empty vessel → plain RACK, no lineage; rack the same lot → merge, no lineage. Print PASS/FAIL.
**Tests:** the script IS the integration test.
**Depends on:** Units 1–10 + 8b. **Patterns to follow:** `scripts/verify-cellar-ops.ts`,
`verify-projection.ts`.
**Verification:** `npx tsx --env-file=.env scripts/verify-blends.ts` → all PASS.

## Test Strategy

**Unit (Vitest, pure):** `planBlend` (balance, partial draw, loss, fractions, rejects);
blend lot-code gen; lineage walk (multi-parent, split, cycle, depth); `canAccessVineyard`/
`canAccessLot` set logic; trial ratio→litre scaling; blend-correction guard.
**Regression (eng-review, IRON RULE):** single-vineyard-manager parity across harvest/
field-notes/assistant after the `UserVineyard` migration; `LotVineyard` backfill maps an
existing single-origin lot to exactly one membership row (and a NULL-origin lot to zero,
admin-only).
**Integration:** `scripts/verify-blends.ts` (blend, lineage, source-set, RBAC intersection,
trial promote/discard, correction allow+refuse, projection parity).
**Manual:** `/blend` builder (3 sources → new lot); lot detail lineage tree; trials
create→choose→promote; a 2-vineyard manager's lot list; admin vs manager visibility.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| RBAC migration drops `assignedVineyardId` and breaks the 3 scoped domains | MED | HIGH | Backfill `UserVineyard` first; exhaustive call-site sweep (research lists every site); keep predicate pure + unit-tested; verify single-vineyard manager parity before dropping the column. |
| Cellar scoping decision (RESOLVED — council + user) | — | — | **Keep cellar tenant-wide**; D9 = membership model + per-lot source set + the 3 existing scopes + an opt-in "my fruit downstream" lens. No mandatory lot-read scoping → no regression, no leak surface. |
| Lineage edge collapse — same parent from two vessels (council C2) | MED | HIGH | Aggregate per distinct parent BEFORE writing edges; one `LotLineage` row per (parent,child) with summed gross share. Tested. |
| Blend-mint retry mints a duplicate lot (council C3) | LOW | HIGH | Retry `P2002(code)` (regenerate) in addition to P2034; idempotency key on the blend op. |
| Incomplete provenance silently shrinks a child's source set (council C6) | MED | MED | Child `LotVineyard` = union of parents' FULL sets; contagious `provenanceComplete=false` if any parent is unknown — never union only known rows. |
| Blend correction corrupts lineage / leaves orphan child | LOW | HIGH | Keep-and-mark `CORRECTED` (no delete); reuse D15 guard; parity = fold vs `VesselLot`, assert no residual child `VesselLot`. Covered by `blend-correct.test.ts` + Unit 11. |
| Multi-line balance / partial-draw rounding (centiliter) | MED | MED | Reuse `assertBalanced` + `FUNCTIONAL_ZERO_L` + Decimal math; fractions from integer centilitres; dust-tolerant fraction-sum test. |
| Destination vessel ambiguity (foreign resident lot) | LOW | MED | NEW-LOT: post-op destination holds exactly the child; GROW: exactly one resident absorbs; validated client + server (Phase 4 "one homogeneous lot per vessel"). |
| Rack-into-occupied silently surprises the winemaker (Unit 8b) | MED | MED | Inline note before commit ("blended into <code>, kept as <code>") + one-tap "new blend" escape; same-lot rack is a plain merge (NOT a blend) so consolidation isn't mislabeled; "Logged · Undo" reverses it like any blend. |
| Rack auto-blend hides an honest error (meant to rack into the wrong tank) | LOW | MED | The destination note makes the blend explicit pre-commit; Undo (blend correction) returns wine to original vessels behind the confirm dialog (Unit 6). |
| Postgres enum-add gotcha (`BLEND`) | MED | MED | Isolated enum-only migration (Unit 1) before any migration/usage of the value. |
| Lineage viz scope creep | MED | LOW | Ship a bounded-depth tree; design-review owns polish; defer pan/zoom if needed. |
| Trial ↔ blend drift (promoted ratios ≠ executed) | LOW | MED | Promote prefills the builder but the real blend is the source of truth; link `promotedToLotId`; the builder re-validates volumes against live balances. |

## Success Criteria (Phase 5 exit)

- [x] Blend 3 lots → 1 new child lot with correct multi-parent lineage + fractions; volume
      conserved (projection == fold); a partial-drawn parent keeps its remainder.
- [x] The child lot has its own code, timeline, and can carry Phase 4 chemistry/tasting.
- [x] A manager, via the opt-in lens, traces a blend touching their vineyard; with the lens
      off they still see the whole cellar (tenant-wide, no regression); admin sees all.
- [x] Existing single-vineyard harvest/field-notes/assistant scoping still works after the
      `UserVineyard` migration.
- [x] Both blend modes work: NEW-LOT mints a `BL-<TOKEN>` child; GROW-EXISTING keeps the
      resident lot's code and adds lineage.
- [x] Racking into an occupied vessel (different lot) auto-creates a GROW-EXISTING blend (one
      resident, lineage recorded, no co-resident rows); rack into empty/same-lot stays a rack.
- [x] A bench trial can be created, scored, chosen, and promoted (via the prefilled builder)
      into a real blend — or discarded with zero ledger impact.
- [x] The lot detail shows a flat composition rollup + an (immediate-first) lineage tree.
- [x] A fresh blend can be corrected (wine back to original vessels, child marked CORRECTED);
      a blend with downstream activity refuses correction (D15); a tasting note does not block.
- [x] All Vitest tests pass; `scripts/verify-blends.ts` all PASS; `npm run build` clean;
      no regressions.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (blend ledger + RBAC migration) | 1 | ✅ done | 2 P1 (LotVineyard backfill, append-only correction) + 2 P2 (separate column-drop, N+1) — all folded in; 2 regression tests added |
| Council | `/council` | Cross-LLM adversarial (Codex correctness + Gemini domain) | 1 | ✅ done | Codex: 5 CRITICAL (lineage-edge collapse, mint retry-idempotency, transitive provenance, scope-leak, parity) ; Gemini: 3 CRITICAL (blend-into-existing, cellar RBAC, undo strictness) — all folded |
| Design Review | `/plan-design-review` | Blend builder + lineage-tree + trials UI | 1 | ✅ done | 6.5/10 → 9/10; states table, builder hierarchy + sticky summary, mode banner, responsive, empty states, post-execute landing folded in (text-only — design binary absent) |

**Design-review decisions (user):** blend builder = **single page + sticky summary** (source
rows main column; total/mode/Execute always visible; sticky bottom bar on tablet). Folded:
interaction-states table (<2 sources, over-draw, empty, saving, success→lot detail); mode
banner (new-lot vs grow); lineage section omitted when a lot has no parents; composition
rollup reuses harvest variety colors; trials warm empty state + builder-preview editor.

**Eng-review decisions (user):** keep-and-mark `CORRECTED` (append-only); ship as one
combined change; backfill `LotVineyard` from existing origins. **Council decisions (user):**
(1) **two blend modes** — NEW-LOT (`[vintage]-BL-<TOKEN>`, winemaker token, no fake
single-origin code) + GROW-EXISTING (resident lot keeps its immutable code, absorbs draws);
(2) **keep the cellar tenant-wide** + an opt-in "my fruit downstream" read-only lens (Unit 10
reframed — no scoping behavior change); (3) **undo returns wine to original vessels behind a
confirm dialog**, blocked only on compositional/locational change (not a tasting note).
Folded engineering fixes: aggregate lineage per distinct parent; `P2002` mint-retry; gross-
share fractions from ledger lines; contagious incomplete provenance; post-op destination
validation; dual-read before column drop; composition rollup; deplete-vessel; promote-as-
draft + revalidate; flat-composition lineage default; trial target/intent field.

**Post-review addition (user):** **Unit 8b — rack becomes blend-aware.** Racking into a
vessel holding a different lot now auto-routes to a GROW-EXISTING blend (shares
`blendLotsCore`), closing the Phase 4 co-residence loophole; rack-into-empty/same-lot
unchanged. Consistent with council C1 (grow-existing) + the design-review "don't fight the
cellar workflow" steer. (12 units now.)

**VERDICT:** ENG + COUNCIL + DESIGN CLEARED. All three reviews complete; every CRITICAL +
SHOULD-FIX folded into the plan; the Unit 10 open question resolved (cellar tenant-wide +
opt-in lens). Plan is ready for `/work`.
