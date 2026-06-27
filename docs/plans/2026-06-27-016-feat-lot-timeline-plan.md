---
title: Lot Timeline (Phase 2)
type: feat
status: completed
date: 2026-06-27
branch: claude/zen-chebyshev-b2195e
depth: standard
units: 7
---

## Overview

Make the Phase 1 ledger visible. Build a read-only **Lot timeline**: a list of wine lots,
and a per-lot detail page with a current-state header (where the wine lives, how much,
what it's made of) over a CRM/Salesforce-style reverse-chronological feed of every
operation in the lot's life, read straight from the ledger. Plus the two-way linkage:
click a vessel, see its lots; open a lot, see its life. This is the first surface a
winemaker actually *sees*, and it's the review/audit spine the whole ERP hangs off (D12).

## Problem Frame

Phase 1 gave every batch of wine a durable identity and an append-only operation ledger,
but it's invisible: nothing on screen reads it. Until the winemaker can open a lot and
read its story, the spine looks like it did nothing. This phase turns the ledger into the
thing the user came for — traceability they can actually look at.

**Product pressure test (noted, not blocking):** the right problem is *review*, not
capture. Per D12, capture is vessel-first and lives on the cellar surface (Phases 3/6);
this phase deliberately ships **zero write affordances**. The simplest valuable framing is
exactly this: a read-only list + timeline + vessel cross-link. Anything more (filters,
charts, lineage graphs) is gravy and can follow. User = winemaker/cellar lead doing
investigation and planning; job = "follow one wine vine-to-bottle" and "what's in my
cellar right now."

## Requirements

- MUST be **read-only** — no new server actions, no write/capture UI (D12).
- MUST read the **ledger** for history (`lot_operation` + `lot_operation_line`, ordered by
  `LotOperation.id` ascending = the monotonic fold order; reverse for display) and the
  **projection** (`vessel_lot` → `lot`) for current state. MUST NOT read `vessel_component`.
- MUST resolve lot origin names (variety/vineyard) via batch lookups (no FK relations),
  falling back to `legacySnapshot` for legacy lots.
- MUST render operation lines using the durable `lotCode`/`vesselCode` snapshots; a line
  with `vesselId = null` renders as "outside the cellar" (seed-in / loss / bottle-out),
  not a broken vessel link.
- MUST show corrections as first-class events and visibly mark a corrected operation
  (`correctsOperationId` / `correctedBy`), never hide them (D6).
- MUST provide the two-way linkage: vessel → its lots, and lot → its vessel(s).
- MUST honor `DESIGN.md` — token-driven, warm editorial, no hardcoded colors/spacing.
- SHOULD show lineage (parent/child) on the lot header when present (structure exists from
  Phase 1; blends arrive Phase 5, so most lots have none yet).
- SHOULD have graceful empty states (no lots, a lot with no current volume, a depleted lot).
- NICE: a vessel filter on the lot list (`/lots?vessel=<id>`); CSV export of the lot list.

## Scope Boundaries

**In scope:**
- New routes `/lots` (list) and `/lots/[id]` (detail) + their client components.
- Pure display/derivation helpers (operation → human summary, current-state summary).
- A lot data-loader lib (list + detail) reading the ledger/projection.
- A "Lots" nav entry; vessel↔lot cross-links on the existing vessels view.

**Out of scope (and why):**
- **Any write/capture** (logging, racking, editing) — D12; capture is the vessel surface,
  Phases 3/6.
- **Chemistry/tasting records on the timeline** — Phase 4 (no such records exist yet).
- **Charts/analyte trends** — Phase 4.
- **Blend lineage graph visualization** — Phase 5 (only structure exists now; render simple
  parent/child links if present).
- **Migrating other read screens** (bulk/bottling/reports) to the projection — they keep
  reading `vessel_component` (the synced second projection) per the Phase 1 Unit 9 decision.
- **The "Fermentation Round" capture grid** — Phase 6.

## Research Summary

### Codebase Patterns
- **Page pattern:** server component calls `requireReadyUser()` (`src/lib/dal.ts:81`),
  fetches via prisma (or a lib fn), maps to typed rows, passes to a `"use client"`
  component. Examples: `src/app/(app)/vessels/page.tsx:5-38`, `src/app/(app)/audit/page.tsx:16-30`,
  `src/app/(app)/vineyards/harvest/page.tsx`. Next 16: `params`/`searchParams` are
  `Promise<T>` — await them; `notFound()`/`redirect()` throw.
- **Nav:** `src/components/AppShell.tsx:10-36` defines nav arrays (`MAIN`/`WINERY`/`VINEYARDS`/
  `SETUP`); add `{ href: "/lots", label: "Lot timeline" }` to `WINERY`.
- **UI kit + tokens:** `src/components/ui/` (`Card`, `Badge` tones, `Metric`, `Eyebrow`,
  `Button`, `ExportCsvButton`), barrel `index.ts`. Feed/list patterns to mirror: the audit
  table (`audit/page.tsx:55-82`), `bottling/BottlingClient.tsx`, `bulk/BulkClient.tsx`.
  Tokens via CSS vars (`--accent`, `--surface-*`, `--text-*`, `--space-*`) + Tailwind
  bridge (`bg-cream`, `text-wine`). `DESIGN.md` is the source of truth.
- **Ledger models** (`prisma/schema.prisma`): `Lot` (origin id columns, NO relations;
  `legacySnapshot` JSON), `LotOperation` (autoincrement `id` = fold order; `type` enum;
  `observedAt`/`enteredBy`/`captureMethod`; `correctsOperationId`/`correctedBy`),
  `LotOperationLine` (`vesselId?` null=external; signed `deltaL`; durable `lotCode`/
  `vesselCode`), `VesselLot` (current state), `LotLineage` (parent/child).
- **Helpers:** `round2` (`src/lib/bottling/draw.ts:4`); date display via
  `date.toISOString().slice(0,10)`; vessel label `BARREL → "Barrel <code>"`, `TANK → "Tank
  <code>"` (see `src/lib/assistant/tools/rack-wine.ts`, `entities.ts`).
- **Tests:** vitest, pure-fn tests in `test/` mirroring module name.

### Prior Learnings
- **context-ledger empty, rstack CLI unavailable** — `VISION.md §5/§11` is authoritative.
- **Ordering correction:** there is NO `sequence` column; `LotOperation.id` (autoincrement)
  IS the monotonic fold order (schema comment). Order the feed by `id`. (Phase 1 prose/
  INVARIANTS say "sequence" — cosmetic doc drift; note for a later cleanup, code is right.)
- D2 + D12 (verbatim) govern: ledger+projection is truth; the timeline is the review spine,
  vessel-first capture stays elsewhere.

### External Research
- `AGENTS.md`: modified Next.js 16 — read `node_modules/next/dist/docs/` before writing any
  `page.tsx`/server-component code. Confirm `params` Promise handling there.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Data source | History from `lot_operation`(+lines) ordered by `id`; current state from `vessel_lot`→`lot` | Read `vessel_component` | D2/D12 + Phase 1 Unit 9: ledger is truth; `vessel_component` is the legacy synced projection, on the retirement path. |
| Feed ordering | `LotOperation.id` descending | `observedAt` desc | `id` is the monotonic fold order; timestamps collide/drift (D14). `observedAt` shown as a label only. |
| Origin names | Batch-lookup variety/vineyard by id; fall back to `legacySnapshot` | Add FK relations to `Lot` | Avoids a schema change this phase; origin is provenance, not a hot relation. |
| Line display | Render from durable `lotCode`/`vesselCode`; `null` vessel = "outside the cellar" | Re-join live lot/vessel | History survives renames/deletes; external legs aren't real vessels. |
| Corrections | Shown as events; corrected op visibly flagged via `correctedBy` | Hide corrected ops / collapse pairs | D6: corrections are compensating events, not deletions; the audit story must stay legible. |
| Architecture | Pure derivation helpers (`src/lib/lot/timeline.ts`) unit-tested; thin server routes → client components | Inline all logic in the page | Matches the codebase; makes the human-summary logic testable without a DB. |
| Write affordances | None | Add quick actions on the lot page | D12 — capture is vessel-first (Phases 3/6); this is the review surface. |

## Design Specification

Resolved in the design review (all token-driven per `DESIGN.md`; light-only; sentence-case
labels; no hardcoded colors/spacing). The known DESIGN.md drift applies: `Badge tone="gold"`
renders wine burgundy — do not rely on `gold`; use `neutral`/`maroon`/`green`/`blue`.

### Lot list (`/lots`) — table on desktop, cards on mobile
- **Desktop (>768px):** a `Card padding="0"` table mirroring the audit log
  (`audit/page.tsx:55-82`): columns **Lot code · Form · Origin (variety · vineyard · vintage)
  · Current volume · Location · Status**. Rows separated by `1px solid var(--border-strong)`;
  the whole row links to `/lots/[id]`. Volume right-aligned, `font-variant-numeric: tabular-nums`.
- **Mobile (≤768px):** the same rows reflow to stacked `Card`s (code + form badge on top
  line, origin + volume + location beneath). The app shell already switches at 768px.
- **Status filter:** a small segmented control / link row — **Active (default) · Depleted ·
  Archived · All** — driven by `?status=`. Active = current cellar; the other tabs reach a
  bottled/depleted lot's full history (the traceability payoff).
- **Form + status as text `Badge`** (never color-only): `WINE`/in-process tones neutral/
  maroon; `FINISHED` green; `isLegacy` a quiet neutral "legacy" badge.

### Lot detail (`/lots/[id]`) — header hierarchy, then an editorial timeline rail
- **Header, in this read order (first → third):**
  1. **What it is:** lot `code` (Inter Tight / `Eyebrow` for the "Lot" label), `form` Badge,
     `status` Badge (e.g. a quiet "Depleted" when empty).
  2. **Where it is now:** current total volume as a `Metric` (tabular-nums) + location chips
     ("Barrel 14", "Tank 1") that link back to the vessel. If empty: "Not currently in any
     vessel" (depleted), not a blank.
  3. **Provenance:** origin variety · vineyard · vintage; lineage parent/child links when
     present (none yet pre-Phase-5). Legacy lots show the `legacySnapshot` origin.
- **Timeline = an editorial vertical rail** (semantic `<ol>`), newest first, one `<li>` per
  operation:
  - a thin left rule/rail (`var(--border-strong)`); a small **type `Badge`** (SEED / RACK /
    LOSS / ADJUST / DEPLETE / BOTTLE / CORRECTION) — text + tone, never a colored dot alone;
  - **one-line human summary** (from `describeOperation`): e.g. "Racked 40 L from Barrel 14
    to Tank 1 (2 L lost)", "Seeded 225 L into Barrel 14", "Bottled 0.75 L";
  - **muted meta line:** `observedAt` via `<time dateTime>` (`toISOString().slice(0,10)`),
    `enteredBy`, and a quiet `captureMethod` tag when not MANUAL;
  - **volume legs** rendered small/tabular; an external (`vesselId null`) leg reads as plain
    muted text "→ outside the cellar (loss/seed/bottle)", NOT a link;
  - **corrections stay visible (D6):** a CORRECTION row is labeled "Reverted operation #N";
    a corrected op gets a quiet "corrected" pill and slightly reduced emphasis — dimmed, not
    struck-through, never hidden.
  - Legacy lots: the first (SEED) event reads "Seeded at cutover (Day-Zero)" so the story's
    start is honest about the D11 boundary.

### Interaction states
| Surface | Loading | Empty | Error | Depleted |
|---|---|---|---|---|
| `/lots` | RSC (no spinner) | Warm "No lots yet" + one line of context + link to Vessels/Bulk | n/a | shown under Depleted/All filter |
| `/lots/[id]` | RSC | a lot always has ≥1 op (SEED) | bad id → `notFound()` | header shows "Depleted", full history still renders |

### Responsive & accessibility
- **Responsive:** desktop header is a metric row + chips; ≤768px metrics/chips stack and the
  feed rows reflow (summary over meta). List table → cards ≤768px.
- **A11y:** timeline is an `<ol>`; dates in `<time dateTime>`; row/links keyboard-reachable
  with `:focus-visible` → `var(--shadow-focus)`; op type conveyed by text (not color alone);
  ink-on-cream meets AA; interactive targets ≥44px; external legs are text, not empty links.

### Anti-slop guardrails
Left-aligned (no centered hero), no icon-in-colored-circle feed, no colored left-border
cards, no decorative blobs/emoji; the rail + restrained type carries it. Volumes tabular.

## Implementation Units

### Unit 1: Pure timeline derivation helpers (test-first)
**Goal:** Turn raw ledger rows into display-ready events + a current-state summary, as pure
functions.
**Files:** `src/lib/lot/timeline.ts` (new); `test/lot-timeline.test.ts` (new).
**Approach:** `describeOperation(op, lines)` → `{ id, type, observedAt, enteredBy,
captureMethod, summary, legs, isCorrection, correctsId }` where `summary` is derived from
the lines (e.g. SEED "Seeded 225 L into Barrel 14"; RACK "Racked 40 L from Barrel 14 to
Tank 1 (2 L lost)"; BOTTLE "Bottled 0.75 L"; CORRECTION "Reverted operation #N"). Source =
negative in-vessel leg, destination = positive in-vessel leg, loss/external = `vesselId
null` legs; use `vesselCode` snapshots and a `vesselLabel(type?, code)` helper. `currentState(
vesselLots)` → `{ totalL, locations: [{vesselCode, volumeL}], }`. All numbers via `round2`.
Pure — no prisma.
**Tests:** SEED/RACK/RACK-with-loss/BOTTLE/CORRECTION each produce the right summary + legs;
external (null-vessel) leg labeled "outside the cellar"; multi-vessel current state sums;
empty current state → 0 L / no locations.
**Depends on:** none
**Execution note:** test-first.
**Patterns to follow:** `src/lib/bottling/draw.ts` (pure + round2), `test/draw.test.ts`.
**Verification:** `test/lot-timeline.test.ts` passes.

### Unit 2: Lot data loaders
**Goal:** Server-side functions that assemble the list + detail view models from the ledger.
**Files:** `src/lib/lot/data.ts` (new).
**Approach:** `listLots({ status })` → filter by `status` (default `"ACTIVE"`; accept
`"DEPLETED"`/`"ARCHIVED"`/`"ALL"`); for each `Lot`, current total + locations from
`vesselLots`, origin variety/vineyard names (batch `findMany` by collected ids; fall back to
`legacySnapshot`), `form`, `vintageYear`, `status`, `isLegacy`. `getLotDetail(id)` → the lot,
its `vesselLots`(+vessel), its `operationLines` grouped into operations ordered by
`operation.id` desc (or load `lotOperation` where lines reference the lot), origin names,
and lineage (`parentEdges`/`childEdges` with the other lot's code). Returns plain typed
objects (Decimals → numbers) ready for the client. No `vessel_component`.
**Tests:** covered via Unit 7 (build + manual); pure shaping logic lives in Unit 1.
**Depends on:** Unit 1
**Patterns to follow:** `src/lib/vineyard/data.ts`, `src/lib/harvest/dashboard.ts` (server
data assembly), `src/lib/prisma.ts`.
**Verification:** a scratch call returns a populated list + one detail object for a legacy lot.

### Unit 3: Lot list route + client
**Goal:** `/lots` — a scannable list of every lot linking to its detail.
**Files:** `src/app/(app)/lots/page.tsx` (new); `src/app/(app)/lots/LotsClient.tsx` (new).
**Approach:** server page `requireReadyUser()`, reads `?status=` (await searchParams) →
`listLots({status})` → `LotsClient`. Render per the **Design Specification**: table on
desktop / stacked cards ≤768px; columns code · form Badge · origin · volume (tabular-nums) ·
location chips · status; whole row links to `/lots/[id]`; a **status segmented control**
(Active default · Depleted · Archived · All) via `?status=`. Warm empty state with context +
link to Vessels. Optional `?vessel=` filter (NICE).
**Tests:** Unit 7 (build + render).
**Depends on:** Unit 2
**Patterns to follow:** `src/app/(app)/audit/page.tsx` (server+table), `vessels/VesselsClient.tsx`.
**Verification:** `/lots` lists the 6 legacy lots with correct volumes/origins.

### Unit 4: Lot detail route + timeline client
**Goal:** `/lots/[id]` — the current-state header + reverse-chron operation feed.
**Files:** `src/app/(app)/lots/[id]/page.tsx` (new); `src/app/(app)/lots/[id]/LotDetailClient.tsx` (new).
**Approach:** server page awaits `params`, `requireReadyUser()`, `getLotDetail(id)` (or
`notFound()`). Build per the **Design Specification**: header in the resolved read order
(what it is → where it is now → provenance/lineage), then the **editorial vertical timeline
rail** — a semantic `<ol>`, newest first, one `<li>` per operation with a type Badge, the
`describeOperation` summary, a muted meta line (`<time dateTime>` + `enteredBy` +
`captureMethod`), small tabular volume legs, external legs as plain "→ outside the cellar"
text, and visible corrections (CORRECTION = "Reverted operation #N"; corrected op gets a
quiet "corrected" pill, dimmed not hidden). Legacy first event reads "Seeded at cutover".
Responsive + a11y per the spec (`<ol>`/`<time>`, `:focus-visible`, ≥44px, AA, no color-only).
**Tests:** Unit 7.
**Depends on:** Units 1, 2
**Patterns to follow:** `bottling/BottlingClient.tsx` (detail rendering), `Metric`/`Badge`/
`Card` from `src/components/ui`.
**Verification:** open a legacy lot → header shows current vessel + volume; feed shows the
SEED op; on a test rack (from the vessel UI) the RACK + any CORRECTION appear in order.

### Unit 5: Vessel ↔ lot linkage
**Goal:** Satisfy "click a vessel → its lot(s)" and lot → vessel.
**Files:** `src/app/(app)/vessels/page.tsx`, `src/app/(app)/vessels/VesselsClient.tsx`
(read-only additions); possibly `src/app/(app)/lots/page.tsx` (accept `?vessel=`).
**Approach:** on the vessels view, for each vessel list its current lots (from `vessel_lot`,
already loadable) with links to `/lots/[id]`; add a "View lots" affordance. Lot detail
header's location chips link back to the vessel. Keep it read-only; reuse existing vessel
load + add a `vesselLots`(+lot) include.
**Tests:** Unit 7.
**Depends on:** Units 3, 4
**Patterns to follow:** existing `vessels/page.tsx` data include + `VesselsClient` rendering.
**Verification:** from `/vessels`, clicking a vessel's lot opens that lot's timeline.

### Unit 6: Navigation + polish
**Goal:** Make the feature reachable and consistent.
**Files:** `src/components/AppShell.tsx`.
**Approach:** add `{ href: "/lots", label: "Lot timeline" }` to the `WINERY` group. Verify
active-state highlighting works. Sentence-case label per DESIGN.md.
**Tests:** Unit 7.
**Depends on:** Unit 3
**Patterns to follow:** `AppShell.tsx:10-36`.
**Verification:** "Lot timeline" appears under Winery and routes to `/lots`.

### Unit 7: Verification
**Goal:** Prove it renders correctly against real data with no regressions.
**Files:** none (verification).
**Approach:** `npm run build` clean (all routes compile, Next 16 `params` handling correct);
full vitest green (incl. Unit 1); on the dev server, walk `/lots` → a lot → back, and a
vessel → its lot. Spot-check a lot that has had a rack + revert so the feed shows SEED →
RACK → CORRECTION in order with the corrected marker.
**Tests:** the suite + manual walkthrough.
**Depends on:** Units 1-6
**Patterns to follow:** the Phase 1 verification approach.
**Verification:** build clean; suite green; the exit criteria below all demonstrably true.

## Test Strategy

**Unit tests:** `test/lot-timeline.test.ts` for the pure derivation (operation summaries,
legs, external-leg labeling, current-state aggregation, edge cases). Existing suite stays
green (the feature is additive + read-only).
**Build:** `npm run build` compiles the new routes (the real type/RSC gate).
**Manual verification (dev server, logged in):** `/lots` lists lots with correct volumes/
origins; a lot detail shows the right current state + a correctly ordered, human-readable
feed; a corrected op is marked; vessel → lot and lot → vessel links work; empty/depleted
states render cleanly.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Feed sorted by `observedAt` instead of `id` → wrong order on same-timestamp ops | MED | MED | Order strictly by `LotOperation.id`; `observedAt` is display-only (Key Decisions). |
| Origin names wrong/missing (no FK; legacy lots) | MED | MED | Batch-lookup by id + fall back to `legacySnapshot`; show "—" when truly absent. |
| Operation summary misreads legs (source vs dest vs loss) | MED | MED | Pure helper with exhaustive unit tests per op type incl. loss + external legs. |
| Next 16 `params`/server-component drift | LOW | MED | Read `node_modules/next/dist/docs/` before route code; mirror existing pages. |
| Building review affordances that imply writes (scope creep) | LOW | MED | Hard read-only boundary; capture stays on the vessel surface (D12). |
| Large lots/long histories render slowly | LOW | LOW | Phase 1 data is tiny (6 lots); paginate later if needed. |

## Success Criteria

- [x] `/lots` lists every lot (code, form, origin, current volume, location, legacy flag),
      each linking to its detail.
- [x] `/lots/[id]` shows a current-state header from `vessel_lot`→`lot` and a reverse-chron
      operation feed from the ledger, ordered by `LotOperation.id`.
- [x] Operation rows read correctly: SEED/RACK/RACK-with-loss/BOTTLE/CORRECTION summaries,
      external legs labeled "outside the cellar", durable code snapshots used. (unit-tested)
- [x] Corrected operations are visibly marked; corrections appear as their own events.
      (logic unit-tested; live spot-check pending — no CORRECTION ops exist in the DB yet)
- [x] Vessel → its lot(s) and lot → its vessel(s) links both work.
- [x] "Lot timeline" is in the Winery nav; no write affordances anywhere on these screens.
- [x] No `vessel_component` reads in the new code; reads come from the ledger/projection.
- [x] List has a status filter (Active default · Depleted · Archived · All); table on
      desktop, cards ≤768px.
- [x] Detail header follows the resolved hierarchy (what → where now → provenance); the
      timeline is an editorial vertical rail as a semantic `<ol>`.
- [x] Responsive + a11y per the Design Specification (`:focus-visible`, `<time>`, op type
      not color-only, ≥44px targets); none of the AI-slop blacklist patterns present.
- [x] `npm run build` clean; full vitest green (incl. new timeline unit tests, 358 total).

**Verification status (Unit 7):** `npx tsc --noEmit` clean · `npm run build` clean (both
`/lots` and `/lots/[id]` compile) · full `npx vitest run` green (358 tests, +18 new) ·
`npm run lint` 0 errors (2 pre-existing warnings, none in new code) · loader verified
against real data (6 legacy lots, current-state + legacy-cutover SEED) · dev-server routes
respond without 500 (auth-gated 307). **Pending user action:** in-browser visual walkthrough
(auth-gated) and a real rack→revert spot-check (would append RACK + CORRECTION ops to the
real append-only winery ledger — not done unprompted; SEED→RACK→CORRECTION ordering +
corrected marker is proven by the `buildTimeline` unit test instead).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clean | score 6/10 → 9/10, 3 decisions |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**DESIGN REVIEW (7 passes):** Info Arch 5→9 · States 6→9 · Journey 6→8 · AI-Slop 7→9 ·
Design-Sys 7→9 · Responsive/A11y 3→9 · Decisions: 3 resolved (timeline = editorial vertical
rail; list = table-desktop/cards-mobile; list scope = all lots, filter defaults to Active).
A full **Design Specification** section was added to the plan; Units 2/3/4 updated.
**UNRESOLVED:** 0.
**VERDICT:** DESIGN CLEARED (9/10). Eng review optional — this phase is read-only UI with no
schema/write changes (the ledger architecture was already council-reviewed in Phase 1).
