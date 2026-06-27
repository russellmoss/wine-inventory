---
title: Readable lot codes + variety/vineyard abbreviations
type: feat
status: completed
date: 2026-06-27
branch: feat/lot-codes-abbreviations
depth: deep
units: 8
---

## Overview

Replace the opaque, random lot codes (`LOT-2024-7F3A1C`, `LEGACY-cmqj...`) with a
structured, human-readable scheme so a winemaker can read a lot code and instantly know
**when · where · what**: `YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG][-N]`, e.g.
`2024-GS-1-PN` or `2024-GS-1-A-PN-EXP`. Variety and vineyard abbreviations become
first-class, editable reference data; a pure code-generator builds codes at lot creation;
the 6 legacy lots get recoded once; and a subblock geography + lot variant-tag round out
the scheme.

## Problem Frame

Phase 2 made lots visible, but they're identified by random strings. A cellar lead
scanning `/lots` or a barrel tag can't tell `LOT-2024-7F3A1C` from `LOT-2024-9B2D04` —
the code carries zero meaning, so people fall back to memory or spreadsheets. The job:
"glance at a lot and know what it is." Structured codes solve exactly that.

**Product pressure test (noted):** the right problem is *recognizability*, not a new
data model. The 80/20 is abbreviations + a code generator + recoding the 6 legacy lots
(Phase A); the geographic subblock (Phase B) is real but secondary and is sequenced after.
Creation already happens vessel-first today (`addComponent`, `src/lib/bulk/actions.ts`),
so this needs no new capture surface — it honors D12.

## Requirements

- MUST: Variety and Vineyard each get an **abbreviation** (2–4 uppercase chars, **unique
  per type**), **editable + visible** in the Varieties & vineyards reference tab (`/reference`).
- MUST: a **pure, unit-tested code generator** produces `YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG][-N]`
  from a lot's origin; tokens uppercased/normalized.
- MUST: **auto-disambiguate** collisions with a numeric suffix (`-2`, `-3`), and let a
  user-supplied **sublot tag** (experiments / differential picks) override/augment the suffix.
- MUST: new lots created via the existing vessel-fill path get a generated code (no more
  random codes); abbreviations are **required at creation** with a friendly error if missing.
- MUST: a **one-time admin migration** recodes the 6 existing legacy lots to the new scheme
  (block omitted — unknown for legacy), treated as an explicit exception to code-immutability
  (D11-style), and refreshes their `lotCode` line snapshots.
- SHOULD: a **geographic subblock** under a vineyard block (managed like blocks), feeding
  the SUBBLOCK slot of the code (Phase B).
- SHOULD: backfill the abbreviations the user listed (PN/CS/CF/MR/MB, GS/NT/PS/PR/SB).
- MUST: honor `DESIGN.md` (token-driven reference UI) and the immutable-after-first-op rule
  for all NEW lots (code generated once at creation, never mutated afterward).
- NICE: when a sublot is *split from an existing parent lot*, record a `LotLineage` SPLIT edge
  (full split flow is Phase 5; here only the tag at fresh-creation is in scope).

## Scope Boundaries

**In scope:**
- Schema: `Variety.abbreviation`, `Vineyard.abbreviation`, `VineyardBlock.code`,
  `Lot.sublotTag` (Phase A); `VineyardSubblock` model + `Lot.originSubblockId` (Phase B).
- A pure code-gen lib (`src/lib/lot/code.ts`) + tests.
- Reference UI + actions for abbreviations; vineyard-setup UI for subblocks (Phase B).
- Wiring code-gen into the vessel-fill lot-creation path + the bottling-reversal lot path.
- One-time legacy recode script.

**Out of scope (and why):**
- **Splitting an existing lot into sublots** (true lineage split) — that's a ledger
  operation (Phase 5 blends/splits). Here "sublot" = an optional tag on a freshly created
  lot, plus geographic subblock geography.
- **Changing lot identity** — the code stays a human *label*; `Lot.id` (cuid) remains
  identity; vintage stays an attribute (D3). Codes are generated once, immutable after.
- **Rewriting historical ledger semantics** — only the legacy recode touches existing rows
  (label + snapshot refresh), as a declared one-time exception.
- **A dedicated lot-creation page** — creation stays vessel-first (D12).

## Research Summary

### Codebase Patterns
- **Reference UI:** `src/app/(app)/reference/page.tsx` (server) → `ReferenceClient.tsx`
  (varieties/vineyards lists + add forms) → `VineyardModal.tsx`/`VineyardSetup.tsx` (block
  editor). Actions in `src/lib/reference/actions.ts` (`createRef`, `setRefActive`,
  `cleanName` 2–80 chars; `@unique` on `Variety.name`/`Vineyard.name`). There is currently
  **no rename/edit** for variety/vineyard beyond color/active — adding an abbreviation needs
  a small **update action** too.
- **Reference normalization precedent:** `FieldInput` uses `cleanInputName` +
  `normalizeInputKey` (`src/lib/fieldnotes/sanitize.ts`) with `@@unique([type, normalizedKey])`
  — the model to copy for uppercase + unique abbreviations.
- **Lot code today (inline, random):** `src/lib/bulk/actions.ts:65` and
  `src/lib/bottling/run.ts:169` both do `` `LOT-${vintage}-${crypto.randomUUID().slice(0,6)}` ``.
  Day-Zero uses `LEGACY-${componentId}` (`scripts/migrate-legacy-lots.ts:26`). **No code-gen
  helper exists.** At `addComponent`, `varietyId`/`vineyardId`/`vintage` are all in scope.
- **Models:** `Variety`/`Vineyard` (`prisma/schema.prisma:146-174`) have only `name @unique`,
  `isActive`, (variety) `color`. `VineyardBlock` (`:198-224`) has free-text `blockLabel`
  ("Block 1"/"A"), no subblock, not unique. `Lot` (`:702-726`) has `originVineyardId`/
  `originBlockId`/`originVarietyId`/`vintageYear` (snapshots, no FK) + unique `code`.
  `LotLineage` (`:794-807`) is structure-only (read in `src/lib/lot/data.ts`, no writes yet).
- **Migration mechanics:** CHECK/unique/raw constraints go in a **raw-SQL migration** (see
  `prisma/migrations/20260625184313_add_vessel_transfer/migration.sql`); run via
  `npm run db:migrate` against the **unpooled** Neon URL (`DATABASE_URL_UNPOOLED`).

### Prior Learnings
- rstack learnings store isn't installed; the **context-ledger has no decisions** on lot
  codes/naming/abbreviations/sublots — design space is open.
- Binding locked decisions: **D3** (vintage is an attribute, not identity), **D11** (Day-Zero:
  no fake history; explicit migration exceptions), **D12** (capture is vessel-first), **D4**
  (controlled enums, no free-text for operation types). `docs/INVARIANTS.md:53`: lot
  `code`/origin/`vintageYear` **immutable after the first operation**. `ROADMAP.md:143`:
  "opaque `Lot.id` + human `code`; variety/vineyard/vintage are attributes; metadata
  immutable after first op (change via correction)."

### External Research
None needed — no new libraries; standard Prisma migration + Next 16 server actions.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Code format | `YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG][-N]` | freeform; opaque-only | Reads when·where·what at a glance; tag/seq disambiguate. Vintage in the *label* is fine (D3 keeps it out of *identity*). |
| Abbreviations | Required (app), **unique per type**, 2–4 uppercase chars; backfill listed values | optional w/ fallback | User chose required+unique+backfill; clean codes always. Nullable column in DB until backfilled, app-enforced. |
| Collisions | Auto numeric suffix `-N`; optional user **sublot tag** overrides/augments | tag-only; seq-only | User chose "auto-number + optional tag" — zero friction default, meaningful when wanted. |
| Sublot meaning | **Both**: geographic `VineyardSubblock` (Phase B) AND a lot-level `sublotTag` (Phase A) | lot-tag only; subblock only | User chose Both. Tag covers experiments/differential picks now; subblock geography is sequenced after. |
| Legacy lots | **Recode all 6** once (block omitted), refresh their `lotCode` snapshots | leave as-is | User chose recode. Declared one-time exception to code-immutability (D11-style); legacy block is unknown so omitted. |
| Where codes are built | At lot creation in the **vessel-fill path** (`addComponent`) + bottling-reversal path | new lot-creation UI | Creation is already vessel-first (D12); no new surface needed. |
| Immutability | Generate once at creation; never mutate a live lot's code | regenerate on edit | INVARIANTS: code immutable after first op. Only the one-time legacy migration is an exception. |

## Implementation Units

### Unit 1: Pure code-generation lib (test-first)
**Goal:** Build + disambiguate lot codes as pure functions, no DB.
**Files:** `src/lib/lot/code.ts` (new); `test/lot-code.test.ts` (new).
**Approach:** `normalizeAbbr(raw)` → 2–4 uppercase alphanumerics (strip/validate, throw on
empty). `blockToken(blockCode?, blockLabel?)` → normalized block token (e.g. "Block 1"→"1",
"A"→"A"), or "" when absent. `buildLotCode({ vintage, vineyardAbbr, blockToken?, subblockToken?,
varietyAbbr, tag? })` → joins present parts with `-`, dropping empty slots (legacy = no block).
`disambiguate(base, existingCodes: Set<string>)` → returns `base` if free, else `base-2`,
`base-3`… first free. All tokens uppercased; tag normalized like an abbreviation.
**Tests:** full code with block+variety; with subblock; legacy (no block) = `2023-GS-PN`;
with tag = `…-PN-EXP`; disambiguate appends `-2`/`-3`; missing required abbr throws; lowercase
input normalizes; tag + collision interaction.
**Depends on:** none
**Execution note:** test-first.
**Patterns to follow:** `src/lib/bottling/draw.ts` (pure + exhaustive tests), `test/draw.test.ts`.
**Verification:** `test/lot-code.test.ts` passes.

### Unit 2: Schema — abbreviations + block code + sublot tag
**Goal:** Persist the new fields (Phase A schema).
**Files:** `prisma/schema.prisma`; new migration under `prisma/migrations/`.
**Approach:** Add `abbreviation String?` to `Variety` and `Vineyard` (nullable for safe
migration; app-required), `code String?` to `VineyardBlock` (optional block token),
`sublotTag String?` to `Lot`. Add **unique** indexes on `Variety.abbreviation` and
`Vineyard.abbreviation` via raw SQL in the migration (partial/`WHERE abbreviation IS NOT NULL`
so existing nulls don't collide), following
`prisma/migrations/20260625184313_add_vessel_transfer/migration.sql`. Run with the unpooled URL.
**Tests:** none (schema); validated by build + later units.
**Depends on:** none
**Patterns to follow:** existing raw-SQL migration; `npm run db:migrate`.
**Verification:** `npm run db:generate` clean; `npx tsc --noEmit` clean; migration applies.

### Unit 3: Abbreviation reference UI + actions + backfill
**Goal:** Staff can set/see variety & vineyard abbreviations; seed the listed ones.
**Files:** `src/lib/reference/actions.ts`; `src/app/(app)/reference/ReferenceClient.tsx`;
`scripts/seed-abbreviations.ts` (new, idempotent).
**Approach:** Add `cleanAbbreviation(raw)` (2–4 uppercase alphanumerics; friendly errors).
Extend `createRef` to accept an optional abbreviation and add a `setAbbreviation(kind, id, value)`
update action with uniqueness check (catch the unique violation → friendly "that abbreviation
is taken"). In `ReferenceClient`, show the abbreviation as a small badge next to each
variety/vineyard and add an inline edit (mirror the color/active controls). Seed script writes
PN/CS/CF/MR/MB + GS/NT/PS/PR/SB by matching on name (skip unknown names; report).
**Tests:** unit-test `cleanAbbreviation` (valid, too long, lowercase→upper, symbols stripped,
empty throws) in `test/lot-code.test.ts` or a sibling.
**Depends on:** Unit 2
**Patterns to follow:** `src/lib/fieldnotes/sanitize.ts` (normalize), `src/lib/reference/actions.ts`
(`createRef`/`setRefActive`), `ReferenceClient.tsx` color/active inline controls.
**Verification:** dev server: set/rename an abbreviation, see it persist + uniqueness rejected;
seed script populates the 10 listed entries.

### Unit 4: Generate codes at lot creation (vessel-fill + reversal)
**Goal:** New lots get readable codes; sublot tag input added.
**Files:** `src/lib/bulk/actions.ts`; `src/lib/bottling/run.ts`;
`src/app/(app)/bulk/*` (the add-component form client).
**Approach:** Replace the inline `LOT-{vintage}-{uuid}` with `buildLotCode` fed by the
selected vineyard/variety abbreviations (load them in-tx), the block token, and an optional
`sublotTag` from the form. Compute the unique code in-tx: read existing codes sharing the base
prefix → `disambiguate`; rely on `Lot.code @unique` + a retry on unique-violation for races.
If a required abbreviation is missing, throw `ActionError` ("Set an abbreviation for {name} in
Varieties & vineyards first."). Persist `sublotTag` on the lot. Add the optional "sublot tag"
input to the add-component form.
**Tests:** the pure pieces are Unit 1; this is covered by build + manual (Unit 8).
**Depends on:** Units 1, 2, 3
**Patterns to follow:** `src/lib/bulk/actions.ts` (existing create + SEED), `ActionError` usage.
**Verification:** create a lot from the bulk form → code like `2024-GS-1-PN`; a second identical
one → `…-PN-2`; with a tag → `…-PN-EXP`; missing abbr → friendly error.

### Unit 5: One-time legacy recode migration
**Goal:** Rename the 6 legacy lots to the new scheme (block omitted) + refresh snapshots.
**Files:** `scripts/recode-legacy-lots.ts` (new, idempotent).
**Approach:** For each `isLegacy` lot, resolve vineyard/variety abbreviations (from the abbr
fields, falling back to `legacySnapshot` names → matched abbr), build `{year}-{vineyard}-{variety}`,
`disambiguate` against all existing codes, update `Lot.code`, and update the `lotCode` snapshot
on that lot's `LotOperationLine` rows (legacy lots have only the SEED op, so this is safe and
keeps the timeline consistent). Skip lots already in the new format (idempotent). Print a
before/after table. Document this as a declared exception to code-immutability (log via
`/decision`).
**Tests:** none (one-time script); verified by re-running (idempotent) + `/lots` showing the
new codes.
**Depends on:** Units 1, 2, 3 (abbreviations must exist first)
**Patterns to follow:** `scripts/migrate-legacy-lots.ts` (idempotent, deterministic, report).
**Verification:** run twice → second run is a no-op; `/lots` shows `2023-GS-PN`-style codes; the
timeline header shows the new code.

### Unit 6: Subblock geography — schema + reference UI (Phase B)
**Goal:** Manage geographic subblocks (A/B/C) under a vineyard block.
**Files:** `prisma/schema.prisma` + migration; `src/lib/vineyard/actions.ts`;
`src/app/(app)/reference/VineyardSetup.tsx`; `src/lib/lot/data.ts` (resolve subblock name);
add `Lot.originSubblockId String?`.
**Approach:** New `VineyardSubblock { id, blockId, label, code, sortOrder, isActive, createdAt }`
with `@@unique([blockId, code])` and a relation to `VineyardBlock`. Add create/update/delete
subblock actions mirroring the block actions; surface a small subblock list under each block in
the vineyard setup. Origin resolution adds the subblock token where present.
**Tests:** none new beyond build; subblock token already covered in Unit 1.
**Depends on:** Units 1, 2
**Patterns to follow:** `VineyardBlock` model + `createBlock`/`updateBlock`/`deleteBlock`
(`src/lib/vineyard/actions.ts`), `VineyardSetup.tsx` block list.
**Verification:** add subblocks A/B to a block; they persist and are editable.

### Unit 7: Feed subblock into creation + code (Phase B)
**Goal:** Choosing a subblock at lot creation puts it in the code.
**Files:** `src/lib/bulk/actions.ts`; `src/app/(app)/bulk/*` (form).
**Approach:** Add a subblock select (filtered by chosen block) to the add-component form;
pass `originSubblockId` + its code token into `buildLotCode`. Code becomes
`2024-GS-1-A-PN[-TAG][-N]`. Persist `originSubblockId` on the lot.
**Tests:** build + manual (Unit 8).
**Depends on:** Units 4, 6
**Patterns to follow:** Unit 4's form wiring.
**Verification:** create a lot with a subblock → `2024-GS-1-A-PN`.

### Unit 8: Verification
**Goal:** Prove it end-to-end with no regressions.
**Files:** none (verification).
**Approach:** `npx tsc --noEmit` clean; `npm run build` clean; full `npx vitest run` green
(incl. new code-gen tests); dev-server walkthrough: set abbreviations in `/reference`; create
lots from the bulk form → readable codes; collision → `-2`; tag → `-EXP`; subblock → `-A-`;
run the legacy recode → `/lots` shows readable legacy codes; missing-abbr error path.
**Tests:** the suite + manual walkthrough.
**Depends on:** Units 1–7
**Patterns to follow:** the Phase 1/2 verification approach.
**Verification:** build clean; suite green; the success criteria below all demonstrably true.

## Test Strategy

**Unit tests:** `test/lot-code.test.ts` for the pure generator + normalizers (format,
legacy/no-block, tag, subblock, disambiguation, validation). Existing suite (358) stays green.
**Build:** `npm run build` is the real RSC/type gate for the reference + bulk forms.
**Manual verification (dev server, logged in):** abbreviations editable + unique in `/reference`;
new lots get structured codes; collisions disambiguate; tag + subblock appear; legacy lots
recoded; missing-abbreviation produces a friendly error.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Recoding legacy lots violates code-immutability (INVARIANTS) | HIGH (by design) | MED | Declared one-time exception (D11-style), logged via `/decision`; only legacy lots; refresh snapshots so history stays consistent. |
| Abbreviation missing at creation blocks the user | MED | MED | Backfill the listed values up front; friendly error names the exact entity + where to fix it. |
| Code collision race on concurrent creates | LOW | MED | `Lot.code @unique` + retry-on-unique-violation around the in-tx disambiguation. |
| Unique abbreviation index fails on existing null rows | MED | LOW | Partial unique index `WHERE abbreviation IS NOT NULL` in raw SQL. |
| Stale `lotCode` snapshots on legacy ledger lines after recode | MED | LOW | Recode script refreshes those snapshots (legacy lots are SEED-only). |
| Scope creep from "Both" (subblock geography) | MED | MED | Phased: Phase A ships readable codes; subblock geography is Phase B (Units 6–7), independently shippable. |

## Success Criteria

- [x] `Variety` and `Vineyard` have unique abbreviations, editable + visible in `/reference`;
      the 10 listed abbreviations are seeded.
- [x] A pure, unit-tested generator produces `YEAR-VINEYARD-BLOCK[-SUBBLOCK]-VARIETY[-TAG][-N]`.
- [x] New lots created from the vessel-fill form get a generated code (no random codes);
      collisions auto-disambiguate; a sublot tag is honored; missing abbr → friendly error.
- [~] Legacy lots recoded to readable codes (block omitted), idempotently, with refreshed line
      snapshots; `/lots` shows them. **3 of 6 done**; the other 3 reference a variety/vineyard
      with no abbreviation yet — add those in `/reference` and re-run `scripts/recode-legacy-lots.ts`.
- [x] (Phase B) Subblocks are manageable under a block and appear in the code (`2024-GS-1-A-PN`).
- [x] Code is generated once at creation and never mutated for live lots (immutability honored);
      the legacy recode is the only declared exception.
- [x] `npx tsc --noEmit` clean; `npm run build` clean; full vitest green (376, +18 new).

**Verification (Unit 8):** `npx tsc --noEmit` clean · `npm run build` clean (all routes
compile incl. `/reference`, `/bulk`, `/lots`) · `npx vitest run` → **376 passed** (+18 new
code-gen tests) · `npm run lint` 0 errors (2 pre-existing warnings) · two migrations applied
to Neon (additive) · 10 abbreviations seeded · code-gen verified against live data
(`2024-GS-PN`, `…-EXP`, `2024-GS-1-A-PN`) · legacy recode applied (3/6) and idempotent on
re-run · dev-server routes respond (auth 307, no 500).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET — run `/autoplan` for the full review pipeline, or individual
reviews above. Recommended before `/work`: `/plan-eng-review` (schema migration + the legacy
recode exception are the load-bearing risks).
