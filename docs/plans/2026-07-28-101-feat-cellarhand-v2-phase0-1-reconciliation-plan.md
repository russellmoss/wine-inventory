---
title: Cellarhand UI/UX v2 — Master Reconciliation Plan + Phase 0/1 Execution Plan
type: feat
status: draft
date: 2026-07-28
branch: claude/ui-ux-v2-foundations
depth: deep
units: 9 (Phase 0/1 only — later phases sequenced but not unit-broken here)
---

## Overview

This plan reconciles the approved Cellarhand v2 UI/UX design handoff
(`docs/design/cellarhand-v2-handoff/`) against the actual state of this production
Next.js 16 winery ERP. It produces two artifacts in one file: **Part A**, a
phase-by-phase master plan covering the handoff's full implementation sequence
(Phases 0–12), and **Part B**, a build-ready file-by-file plan for Phase 0
(Foundations) + Phase 1 (Re-baseline) — the first PR. The handoff's own framing
holds up under verification: the shell, queue, brief, tank board and tank detail
are almost entirely presentational/read-path work; only the topping runner,
barrel-group settings and scan require schema changes, and those are correctly
gated behind four RFCs that are all still `status: proposed`, not approved.

## Source commit record

- This worktree/branch (`claude/ui-ux-v2-foundations`) branched from `main` at
  **`cb0c815c`** (`feat(kb): SKB knowledge-base expansion — Penn State Extension +
  Virginia Tech grape IPM (#554)`), 2026-07-28.
- The handoff was extracted and committed at **`a970ddaf`**
  (`docs(design): add Cellarhand UI/UX v2 handoff specification`) on top of that.
- The prior working tree (`main` checkout, branch `docs/s2b-runbook-merged-live-2026-07-27`
  at `2a638054`) had unrelated uncommitted knowledge-boundary/spray-assistant changes
  (`NOW.md`, `scripts/verify-kb-boundary.ts`, `src/lib/knowledge/boundary/audit-core.ts`,
  `test/knowledge-boundary-gate.test.ts`, plus untracked `docs/audits/product-design-audit-2026-07-28.md`,
  `docs/spray_assistant/phases/SKB-*.md`). None of those files overlap anything this
  plan touches (`src/components/ui/*`, `src/styles/tokens/*`, `src/components/AppShell.tsx`,
  `DESIGN.md`) — verified by direct file-list comparison, not left implicit.
- Other active worktrees at plan time (`distracted-edison`, `grape-guide-pdf-kb`,
  `magical-elgamal`, `skb-knowledge-base-expansion`, `spray-assistant-runbook-next`) are
  all backend/spray/KB work, disjoint from the UI layer this plan touches. Re-check with
  `git fetch && git log --all --oneline -- src/components/ui src/styles/tokens src/components/AppShell.tsx DESIGN.md`
  immediately before starting Unit 1, since these branches move daily.

## Problem Frame

The app's UI layer accumulated ad-hoc patterns over ~16 build phases: six independent
status→color mappings, a `Badge tone="gold"` that has rendered wine-burgundy (not gold)
since it shipped, Button heights that put 78% of controls under the 44px touch-target
floor, zero `aria-current`/skip-link/global-focus-ring-radius-correctness across the
app, and ~69 hand-rolled success-confirmation patterns. A design team independently
audited this, produced a 49-file handoff with prototypes, RFCs and acceptance criteria,
and got it approved. The work now is disciplined reconciliation — verify every claim
against the real repo, don't trust the handoff's assumptions blindly, and don't let
"redesign" become "rewrite." Doing nothing leaves real accessibility failures in
production (documented baseline: 293/376 controls under 44px, zero `aria-current`
anywhere, no `.sr-only` utility, execute-screen errors in a plain unannounced `<div>`).

## Requirements

- MUST preserve every existing URL, business rule, and ledger/RLS/tenancy behavior.
- MUST NOT copy prototype markup (`docs/design/cellarhand-v2-handoff/prototype/*.dc.html`)
  into production — it is inline-styled reference material only.
- MUST NOT authorize any Phase 7–10 schema/domain work until its RFC is reconciled
  against the real Prisma schema, RLS checklist, invariants register and ledger
  architecture, and approved by the owner.
- MUST ship Phase 0 + Phase 1 as one PR, two commits, with full before/after visual
  regression and a zero-violation axe-core pass at 390px and 1440px as the merge gate.
- SHOULD flag every place this plan found the handoff's stated assumption to be wrong
  against the real repo, rather than silently reconciling it (see "Reconciliation
  Conflicts" below) — this was an explicit instruction.
- SHOULD NOT block Phase 0/1 on any of OD-1 through OD-7 — none of those decisions are
  load-bearing for foundations/re-baseline work.

## Scope Boundaries

**In scope (this plan file):** the full Phase 0–12 master reconciliation (Part A) at
plan-level detail, and a build-ready file-by-file plan for Phase 0 + Phase 1 (Part B).

**Out of scope (deferred to later `/plan` passes, one per PR boundary in Part A):**
Phase 2 shared-component library, Phase 3 IA/shell rewrite, Phase 4 search, Phase
5/6 screen work, and everything behind the domain gate (Phases 7–10). This plan does
not write implementation-unit detail for those — Part A gives enough to scope each as
its own future plan when its turn comes.

## Research Summary

Five parallel research agents read: (1) `CLAUDE-CODE-START-HERE.md`,
`README-HANDOFF.md`, `11-implementation-sequence.md`, `08-data-dependency-matrix.md`,
`05-design-system-v2.md`, `06-component-migration-map.md`, `12-acceptance-criteria.md`;
(2) the IA/screen/interaction/responsive/a11y/content/lineage specs and all four RFCs;
(3) the current design-token, DESIGN.md, styleguide, shared-component, call-site,
a11y-infrastructure, AppShell, font-loading and status-enum state of the real repo;
(4) the current Prisma schema/RLS/invariants/ledger state relevant to the four RFCs;
(5) Next.js 16's actual font-loading and root-layout documentation in
`node_modules/next/dist/docs/`. Full agent outputs are preserved in this session's
transcript; the load-bearing findings are folded into Parts A/B below and the
Reconciliation Conflicts section.

### Codebase patterns worth reusing (not reinventing)

- `LotOperation.commandId` / `WorkOrderTaskAttempt.commandId` — idempotency already
  solved; RFC-002's keg close-out and RFC-004's scan actions should reuse this, not
  rebuild it.
- `LotOperation.batchId` — the existing group-fan-out mechanism (one op, N vessel
  lines) is exactly what RFC-002's keg close-out needs (1 measured + N estimated
  lines sharing a `batchId`).
- `src/components/cellar/forms/DoseForm` and friends — the live
  `rate × volume = total` `aria-live` readout is explicitly named by the handoff as
  the model for the new `NumericUnitInput` (Phase 2).
- `src/components/ui/Collapsible.tsx` and 13 other files already implement
  `aria-expanded` correctly (`CostPanel.tsx:119`, `VesselComposition.tsx:41`,
  `LineageTree.tsx:50`, `GroupActions.tsx:241`, `BulkClient.tsx:199`,
  `AssistantChat.tsx:991`, `WeatherCard.tsx:377,407`, `VineyardSetup.tsx:395`,
  `VineyardModal.tsx:301`, `ReferenceClient.tsx:265,419`) — `AppShell.tsx`'s own nav-group
  toggle (`AppShell.tsx:102-112`) is the one holdout that needs to copy this pattern,
  not invent a new one.
- `verify:barrel-groups`, `verify:group-maintenance`, `verify:group-rack-progressive`
  npm scripts already exist and prove today's `VesselGroup`/batch-fan-out mechanics —
  Phase 7/8 should extend these, not write parallel verify scripts from scratch.
- `MaterialFilterPicker` already implements the combobox-with-type-ahead pattern
  Phase 2's `Select`/`Combobox` needs.

### External research: Next.js 16 constraints

- `next/font/local` is unchanged from older Next.js and OTF is explicitly supported
  (`localFont({ src: '...' })`) — moving Big Caslon there in Phase 0 is safe.
- The canonical v16 pattern for a pre-hydration `<html>` attribute (relevant if a
  future phase adds theming) is an inline `<script dangerouslySetInnerHTML>` in a
  Server Component root layout with `suppressHydrationWarning` — not required for
  Phase 0/1, noted for later.
- No breaking change affects adding CSS custom properties at root or moving the
  Google Fonts `@import` to `next/font/google`/`next/font/local`.

## Reconciliation Conflicts (handoff assumption vs. verified repo state)

Per the instruction to identify conflicts rather than silently resolve them:

1. **A global `:focus-visible` rule already exists.** The handoff states, in three
   separate places (`CLAUDE-CODE-START-HERE.md`, `11-implementation-sequence.md`
   Phase 0/1, `10-accessibility-spec.md`'s audit baseline), that "no global
   `:focus-visible` rule exists" and that this is Phase 1's job to add. In fact
   `src/styles/tokens/base.css:52` already has:
   `:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-sm); }`.
   The handoff's proposed spec (doc 05 §A11) is nearly identical —
   `outline: none; box-shadow: var(--shadow-focus); border-radius: inherit;` — the
   **only** difference is `border-radius: var(--radius-sm)` (hardcoded 6px) vs.
   `inherit`. **Resolution for this plan:** Phase 1 Unit 3 (below) is scoped as a
   *refinement* (swap the radius to `inherit` so the ring matches non-6px-radius
   controls like pills and rows) plus verification that the rule actually renders on
   `Button`, not a from-scratch addition. This changes Phase 1's real risk profile —
   AC-F5/AC-V3 become regression tests on an existing rule, not new-feature tests.
   The handoff's *separate* claim that "`Button` has no focus styling" is still true
   (`Button.tsx` has no local `:focus-visible` override and doesn't defeat the global
   rule) and needs its own verification pass — the global rule existing doesn't
   guarantee it's actually reaching every custom interactive element the handoff
   cares about (ribbon tiles, chips — those don't exist yet, out of scope here).

2. **`prefers-reduced-motion` is honored in 4 places, matching the handoff's own
   count exactly** (`FermentChart.tsx:58`, `Collapsible.tsx:29,33`,
   `developer.module.css:471`, `AudioVisualizer.tsx:54`) — no conflict, confirms the
   handoff's Phase 0 claim that only a *global* rule is missing.

3. **`.sr-only` genuinely does not exist anywhere in `src/`** — no conflict, confirmed.

4. **`Badge tone="gold"` really does render wine-burgundy, not gold** — no conflict;
   this is already logged as known drift in `DESIGN.md`'s own cleanup backlog
   (`DESIGN.md:132-146`), independently of the handoff. The handoff and the existing
   repo documentation agree on both the problem and the fix (`tone="gold"` →
   `tone="wine"`).

5. **Button heights really are hardcoded 34/42/50px** (`Button.tsx:38-40`), matching
   the handoff exactly — no conflict.

No other researched claim in the handoff's Phase 0/1 scope was found to conflict with
the real repo. This section should be re-run (spot-check a handful of claims against
`grep`) at the start of each later phase's own planning pass, since the handoff was
authored against a snapshot that may drift further as Phases 2–6 land.

## Decision Log (OD-1 through OD-7)

Per the requirement: each decision blocks only the phase it actually gates. **None of
these block Phase 0 or Phase 1.**

| ID | Decision | Recommended default | Blocks |
|---|---|---|---|
| OD-1 | Is `Setup`/`Audit log` visibility for role `user` intentional? | Confirm with owner before Phase 3 ships the new nav's role-visibility matrix | Phase 3 |
| OD-2 | Disposition of 11 orphaned routes | Rehome per doc 01 §4, no URL change, before Phase 3 | Phase 3 |
| OD-3 | Can a vessel belong to >1 operational barrel group? | One operational group per vessel (report violations, enforce after) | Phase 7 |
| OD-4 | Is keg volume nominal or measured-per-fill? | Nominal, overridable per fill | Phase 8 |
| OD-5 | Does a corrected topping estimate re-fan across the whole keg fill, or just the corrected barrel? | Re-fan the whole fill | Phase 8 |
| OD-6 | Scan hardware assumption (camera-only vs. + NFC)? | QR everywhere as baseline, NFC where Android supports it | Phase 10 |
| OD-7 | Does an AI-drafted work order need a second human approver before Issue? | No — same approval path as a human-drafted WO, confirm with owner | Phase 9 |

---

# PART A — MASTER RECONCILIATION PLAN

Dependency graph (verbatim from the handoff, verified against the data-dependency
matrix — the shell/queue/brief/tanks branch and the domain-gated branch are genuinely
independent, confirmed by cross-referencing DM-01 through DM-66):

```
0 Foundations
└─ 1 Re-baseline ── 2 Shared components ── 3 Shell/IA ── 4 Search
                                              │             │
                                              │             └─ 5 Queue & brief ── 9 Assistant
                                              └─ 6 Tanks ─────────────────────── 11 Lineage
   ⛔ DOMAIN GATE (RFC-001/002/003/004 approved + migrated + OD-3/4/5/6 answered)
   └─ 7 Barrel groups ── 8 Topping runner ── 10 Scan ── 12 Spillover
```

### Phase 0 — Foundations

- **User outcome:** none visible — establishes safe primitives with zero behavior
  change.
- **Affected routes/components:** `src/styles/tokens/{colors,typography,spacing,fonts,base}.css`, `src/app/globals.css`, `src/app/layout.tsx`, `DESIGN.md`, `src/app/styleguide/page.tsx`.
- **Existing behavior preserved:** every current render is pixel-identical except the
  focus-ring radius (see Conflict #1), the font-loading network path, and one
  deliberate behavior change: the new *global* `prefers-reduced-motion` rule means
  every transition/animation in the app now honors that OS preference, not just the
  4 components that individually check it today. This is a real (accessibility-
  positive) behavior change for that user subset — noted explicitly per council
  review, rather than folded into "pixel-identical."
- **Design-only changes:** new token additions only (see Part B).
- **New queries/APIs:** none. **Schema/domain changes:** none.
- **Dependencies:** none (root). **Owner decisions:** none block this phase.
- **Tenant/RLS implications:** none. **Ledger/audit implications:** none.
- **Tests/verification:** build passes; `/styleguide` renders; Lighthouse font-block
  check (AC-F10); token contrast lint (AC-F8/F9 partial).
- **Rollback/stopping point:** fully additive; safe to ship standalone if needed.
- **Recommended PR boundary:** commit 1 of PR #1.

### Phase 1 — The re-baseline

- **User outcome:** every existing screen becomes touch/keyboard/screen-reader usable
  at floor level with zero workflow change.
- **Affected routes/components:** `Button.tsx`, `Badge.tsx`, `ConfirmButton.tsx`,
  new `StatusChip`/`Skeleton`/`EmptyState`/`Alert`/`ActionReceipt`, `AppShell.tsx`,
  `src/lib/work-orders/status-badge.ts` (+4 other status-tone maps),
  `ExecuteClient.tsx`, `DESIGN.md`, `/styleguide`.
- **Existing behavior preserved:** all data flows, business logic, and routes;
  only visual size/color/ARIA attributes change.
- **Design-only changes:** see Part B — this entire phase is design-only by
  construction (the handoff's own framing: "closes six audit findings... no DB work").
- **New queries/APIs:** none. **Schema/domain changes:** none.
- **Dependencies:** Phase 0. **Owner decisions:** none block this phase.
- **Tenant/RLS implications:** none. **Ledger/audit implications:** none — zero
  ledger-write paths touched; purely presentational/ARIA.
- **Tests/verification:** AC-F1–F10, AC-C1–C8 (full mapping in Part B).
- **Rollback/stopping point:** single atomic commit; app fully functional before and
  after.
- **Recommended PR boundary:** commit 2 of PR #1 — ships with Phase 0 as PR #1.

### Phase 2 — Shared components

- **User outcome:** capture forms and tables become consistent and accessible; no
  screen redesign yet.
- **Affected routes/components:** `Input.tsx`, new `NumericUnitInput`, `Select`/
  `Combobox` (extends `MaterialFilterPicker`), `Checkbox.tsx`, new `DateTimeControl`,
  new `PageHeader`/`Breadcrumbs`, new `DataRow`/`ResponsiveTable`, chart consolidation
  (`BrixChart`+`AnalyteTrendChart` → `TimeSeriesChart`), `loading.tsx` per heavy route,
  `not-found.tsx` per route family.
- **Existing behavior preserved:** capture-form validation/submit logic untouched —
  markup/component swap only.
- **Design-only changes:** all of the above, **except** removing the global mobile
  `table { display:block; white-space:nowrap }` CSS rule, which is a genuine
  behavioral risk (it currently drives every table's mobile rendering) — must migrate
  table-by-table behind `ResponsiveTable`, scoping the old rule to unmigrated tables
  only until every table has moved.
- **New queries/APIs:** none required. **Schema/domain changes:** none.
- **Dependencies:** Phase 1. **Owner decisions:** none block.
- **Tenant/RLS implications:** none. **Ledger/audit implications:** none.
- **Tests/verification:** AC-C11, AC-C13, AC-C14.
- **Rollback/stopping point:** table-by-table migration is independently revertable;
  component additions are additive.
- **Recommended PR boundary:** PR #2, separate from PR #1.

### Phase 3 — Application shell and IA

- **User outcome:** nav restructured to 3 groups / 13 destinations by frequency;
  mobile drawer replaced by a 4-tab bar; scan control appears as a disabled
  placeholder ahead of Phase 10.
- **Affected routes/components:** `AppShell.tsx` (nav model, top bar, new
  `MobileTabBar`), new `SectionNav`, route rehoming for 11 orphaned routes (**no URL
  changes** — hard constraint, repeated three times in the handoff), removal of the
  `"Offline — will retry"` string.
- **Existing behavior preserved:** every URL; role-gating logic (relocated, not
  changed in substance).
- **Design-only changes:** nav position, 4 label renames, connectivity copy.
- **New queries/APIs:** none (connection indicator is client-only `navigator.onLine`).
- **Schema/domain changes:** none.
- **Dependencies:** Phase 2.
- **Owner decisions:** OD-1, OD-2 should be resolved before this phase finalizes the
  nav/role-visibility model (does not block Phase 0/1).
- **Tenant/RLS implications:** none — visibility stays driven by existing role checks.
- **Ledger/audit implications:** none.
- **Tests/verification:** AC-S1–S5; a route-URL-stability regression test asserting
  every pre-existing path still resolves.
- **Rollback/stopping point:** the handoff itself recommends shipping behind a flag —
  "the most opinionated change."
- **Recommended PR boundary:** PR #3.

### Phase 4 — Global search and command palette

- **User outcome:** ⌘K opens a Do → Go to → Ask palette across barrels, tanks,
  lots, work orders, blocks, materials, destinations, and the **existing**
  `VesselGroup` records that already exist today. **Council-review correction:**
  the handoff's own scope list includes "kegs" and configured barrel-group
  settings, but per Phase 7/8 below, neither exists yet — `Keg` is net-new schema
  gated behind RFC-002, and `VesselGroup`'s *settings* (location, topping interval,
  crew) are net-new fields gated behind RFC-001. Phase 4's index is scoped to what
  actually exists at its own PR boundary; kegs and configured group settings join
  the index automatically once Phase 7/8 ship (no Phase-4 rework needed — the
  index just gains rows/fields), not silently assumed present now.
- **Affected routes/components:** new `CommandPalette`, new server-side search
  endpoint/action.
- **Existing behavior preserved:** per-page filters untouched; palette is additive.
- **New queries/APIs:** yes — a new indexed, tenant-scoped search query spanning
  multiple models.
- **Schema/domain changes:** none for domain data; a search index (e.g. trigram/GIN)
  may itself be an additive migration and should get a lightweight DBA-style review
  even though it changes no domain semantics.
- **Dependencies:** Phase 3. **Owner decisions:** none new.
- **Tenant/RLS implications:** real — the query spans many tenant-scoped tables and
  must go through the tenant-extended Prisma client (never raw `$queryRaw` without
  `runInTenantRawTx`, per this repo's raw-SQL tenant-scoping rule). This is the
  concrete RLS risk in this phase.
- **Ledger/audit implications:** none (read-only).
- **Tests/verification:** AC-P4 (cross-tenant leak test — a vessel/group from another
  tenant must never appear in results); load test at 8,142-barrel scale (explicit
  entry in the handoff's own risk register).
- **Rollback/stopping point:** additive, feature-flaggable.
- **Recommended PR boundary:** PR #4.

### Phase 5 — Work-order queue and brief

- **User outcome:** `SavedViews` + `Narrow` replaces the 7-field filter bar; queue
  rows show group-level progress; brief gets a **Take care** row.
- **Affected routes/components:** `WorkOrdersClient.tsx`, `WorkOrderDetailClient.tsx`,
  new `SavedViews`/`Narrow`, new `StageIndicator` (derived, no stored column), new
  "Where it came from" panel.
- **Existing behavior preserved:** all WO business rules (issue/approve/cancel)
  untouched — filtering/presentation UX only.
- **New queries/APIs:** new read aggregates (day headline, stage derivation,
  provenance union, next-WO lookup) — all class B; group-level counts (DM-08) fall
  back to a vessel count until RFC-001 lands (class D deferred gracefully, not
  blocking).
- **Schema/domain changes:** none required as scoped.
- **Dependencies:** Phase 4 (narrowing's entity resolution).
- **Owner decisions:** none block.
- **Tenant/RLS implications:** new aggregate queries stay tenant-scoped via the
  standard extended-Prisma path; no new tables.
- **Ledger/audit implications:** none — read-side only.
- **Tests/verification:** AC-S6–S11.
- **Rollback/stopping point:** the handoff calls this phase "complete on its own."
- **Recommended PR boundary:** PR #5.

### Phase 6 — Tanks

- **User outcome:** `/bulk` gets a real tank board (replacing collapsed accordions
  that show no wine); tank detail keeps its existing `Tabs`.
- **Affected routes/components:** `/bulk` board view; tank detail tabs (`Tabs` reused,
  not modified — explicitly must-not-break).
- **Existing behavior preserved:** all tab content and actions unchanged; export
  functionality unchanged, only relocated to an overflow menu.
- **New queries/APIs:** tile-state derivation, Brix+temperature time-series read —
  class B.
- **Schema/domain changes:** none.
- **Dependencies:** Phase 2 (`TimeSeriesChart`, `ResponsiveTable`).
- **Owner decisions:** none. **Tenant/RLS implications:** none new. **Ledger/audit
  implications:** none.
- **Tests/verification:** AC-S22–S27.
- **Rollback/stopping point:** safe; can ship in parallel with PR #5 per the
  dependency graph (both depend only on Phase 2/4, not on each other).
- **Recommended PR boundary:** PR #6.

### ⛔ DOMAIN GATE

Nothing below is authorized until, **for each RFC individually**: (1) it is
reconciled against the actual `prisma/schema.prisma`, the RLS/tenant checklist in
`AGENTS.md`, the invariant register in `docs/architecture/invariants/`, and the
ledger architecture in `src/lib/ledger/`; (2) it is approved by the owner; (3) its
migration is written and reviewed under this repo's "backfill-then-enforce" rule for
any FK/RLS/uniqueness/event-write change; and (4) its blocking OD- items are answered.
**RFC-003's `CaptureMethod.DERIVED` enum addition must land in its own migration
before any code that writes it — Postgres requires enum values to exist ahead of
any INSERT using them, and RFC-002's close-out code depends on this value existing.**
This is a hard ordering constraint even among the gated RFCs.

### Phase 7 — Barrel groups (gated on RFC-001 + OD-3)

- **User outcome:** cellar hands configure operational barrel groups (location,
  topping interval, source vessel, crew) and get accurate historical membership reads.
- **Affected routes/components:** new `/cellar/groups`, `/cellar/groups/[id]`,
  `/vessels/[id]`; `VesselGroup`/`VesselGroupMember` extensions.
- **Existing behavior preserved:** the existing `LotOperation.batchId` fan-out
  mechanism is reused unchanged; existing groups migrate to `type=OPERATIONAL`.
- **Design-only changes:** none — this phase is schema-first.
- **New queries/APIs:** group rollups (member count, volume, next-due) — computed,
  never stored.
- **Schema/domain changes:** `VesselGroup` gains `type`/`location`/`status`/settings
  columns; `VesselGroupMember` gains `position` (walk order) and `addedAt`/`removedAt`
  (effective-dated membership — the RFC itself calls this "the single most important
  addition," since a historical work order must read membership as of its own date).
  Full 9-step Phase-12 tenant-table checklist applies to the new composite FK
  `(tenantId, vesselId) → vessel(tenantId, id)` the RFC specifies in raw SQL —
  **council-review addition:** this FK requires `Vessel` to already carry
  `@@unique([tenantId, id])`; verify this exists (very likely true given the
  established pattern on other cross-tenant-risk-referenced tables) as an explicit
  pre-migration check rather than an assumption. The "one operational group per
  vessel" (OD-3) constraint must be **reported, not enforced**, in the initial
  migration — enforce only after an admin resolves real-data violations, per this
  repo's backfill-then-enforce rule and the RFC's own explicit caution.
  **Council-review addition — interim read during the report-then-enforce window:**
  any UI needing a single "current group" answer for a vessel with more than one
  open membership should resolve to the most-recently-`addedAt` group, and surface
  a data-quality flag for admin resolution — this is an interim technical default
  for the migration window, not a lasting product decision, so it doesn't block on
  OD-3. **Council-review addition — effective-dated membership needs explicit
  constraints, not just two nullable timestamps:** add indexes
  `(tenantId, groupId, removedAt, position)` and `(tenantId, vesselId, removedAt)`,
  and state the invariant "at most one open (`removedAt IS NULL`) membership row per
  vessel per group" explicitly in the migration/invariant note.
- **Dependencies:** domain gate.
- **Owner decisions:** OD-3 must be answered before the migration is written.
- **Tenant/RLS implications:** direct — new composite FK, new uniqueness-adjacent
  constraint, full RLS policy work per the Phase-12 checklist.
- **Ledger/audit implications:** membership changes write **no** ledger entry (not a
  wine operation) but **must** write an `AuditLog` entry (actor + before/after) — new
  audit surface, needs its own invariant note in `docs/architecture/invariants/`.
- **Tests/verification:** AC-S28–S30, AC-D1, AC-D9, AC-D10; extend the *existing*
  `verify:barrel-groups` script rather than writing a new one; add a case to
  `verify-tenant-isolation.ts`.
- **Rollback/stopping point:** safe — "groups are useful before the runner exists"
  (the RFC's own words); can ship and sit unused if Phase 8 stalls.
- **Recommended PR boundary:** PR #7, own migration, RLS/invariants review before the
  PR is opened, not just before merge.

### Phase 8 — Topping runner and keg model (gated on RFC-002 + RFC-003 + OD-4 + OD-5, depends on Phase 7)

- **User outcome:** a cellar hand completes a 60-barrel topping round with zero
  numeric keystrokes until keg close-out; close-out writes atomically.
- **Affected routes/components:** keg panel, tick grid, `GroupRibbon`,
  `KegCloseOutDialog`, `CorrectionDialog`, `ProvenanceBadge` on every derived figure,
  phone runner (68px tick target).
- **Existing behavior preserved:** today's single-vessel-volume topping path
  (`src/lib/cellar/topping.ts`) stays for any non-keg topping — the keg path is
  additive, not a replacement.
- **Schema/domain changes:** (1) `CaptureMethod.DERIVED` — its own migration, first,
  ahead of any code that writes it; (2) new `Keg`/`KegFill`/`ToppingTick` entities
  **or** a `VesselType.KEG` extension — the RFC itself leaves this open and flags the
  real risk: a KEG vessel type enters every existing vessel picker and capacity-check
  code path app-wide. This choice needs its own ADR before Phase 8 starts, not a
  decision made mid-implementation. (3) barrel capacity validation downgraded from a
  hard block to a soft warning at >15% of nominal, overridable with a reason — a
  domain-rule change that must be reviewed against `LEDGER-4`. **Council-review
  addition:** the `CaptureMethod.DERIVED` migration (PR #8a) must ship alongside an
  explicit app-side audit of every exhaustive TypeScript switch, serializer, or
  reporting map keyed on `CaptureMethod` — the enum gaining a value can silently
  fall through a `default` case or break an exhaustiveness check.
- **Dependencies:** Phase 7 (member order), domain gate.
- **Owner decisions:** OD-4, OD-5 must be answered before the migration is written.
- **Tenant/RLS implications:** full Phase-12 checklist if `Keg` is its own table;
  inherited-for-free if built as `VesselType.KEG` — but the latter has app-wide
  blast radius on vessel pickers/capacity logic, as noted above.
- **Ledger/audit implications:** the highest-risk phase in this entire plan. A new
  atomic multi-row `LotOperation` write pattern (1 measured withdrawal + N estimated
  additions sharing one `batchId`), plus a `CORRECTION`-based re-fan, must satisfy
  `LEDGER-6` (balanced operations), `LEDGER-10` (immutability), `LEDGER-11`
  (conservative correction guard — explicitly invoked by RFC-002 §3.6), and
  `LEDGER-12` (one-lot-per-vessel, governs how a keg-as-source-vessel's residual
  combines). This PR needs a dedicated ledger-correctness review, not just a
  component review, and will trip the repo's `src/lib/ledger` PreToolUse governance
  hook by design.
- **Tests/verification:** AC-S16–S21, AC-D2–D8, AC-N4 (idempotent `commandId`); a new
  `verify:keg-close-out`-style script following the precedent already set by
  `verify:barrel-groups`/`verify:group-maintenance`/`verify:group-rack-progressive`.
- **Rollback/stopping point:** "do not ship a partial close-out under any
  circumstances" (verbatim from the RFC) — the transaction is all-or-nothing by
  construction; do not ship to production until the atomicity suite is green,
  independent of UI polish.
- **Recommended PR boundary:** split into three — **PR #8a** (the `CaptureMethod.DERIVED`
  enum migration alone, reviewed and merged first, on its own), **PR #8b** (`Keg`/
  `KegFill`/`ToppingTick` schema + close-out core, ledger-reviewed), **PR #8c** (UI:
  tick grid, ribbon, dialogs).

### Phase 9 — Assistant behavior (depends on Phase 5, OD-7)

- **User outcome:** "Review & create" navigates to the created draft; the dock
  continues the conversation on the same object.
- **Affected routes/components:** new `AIProposalCard`, `ProvenancePanel`, the
  assistant tool-result handler. **`AssistantDock` itself is explicitly untouched** —
  geometry, drag/resize, expand, `Esc` precedence, voice orb, FAB all stay exactly as
  they are; only the *outcome* of one tool call changes.
- **Existing behavior preserved:** voice-never-writes rule; all dock mechanics.
- **New queries/APIs:** page → dock object-context passing (client-side); tool-call
  provenance surfaced as links — class C.
- **Schema/domain changes:** none.
- **Dependencies:** Phase 5.
- **Owner decisions:** OD-7 should be resolved before this phase, since it decides
  whether "Review & create" can land on a directly-issuable draft or must land in a
  review-only state.
- **Tenant/RLS implications:** none new.
- **Ledger/audit implications:** no ledger writes originate here (still
  human-press-gated); provenance links must resolve to real, tenant-scoped records.
- **Tests/verification:** manual QA plus the existing assistant golden-eval CI gate
  (any assistant-tool-shape change re-triggers it, per this repo's established
  practice).
- **Rollback/stopping point:** low risk, additive.
- **Recommended PR boundary:** PR #9.

### Phase 10 — Scan (gated on RFC-004 + OD-6, depends on Phase 7/8)

- **User outcome:** scanning a QR/NFC tag on a barrel/tank/keg/group navigates to it,
  or sets the current runner position without navigating away.
- **Affected routes/components:** new `/t/[token]` resolver route, `ScanButton`/
  `ScanSheet`.
- **Schema/domain changes:** new `tagToken`/`tagIssuedAt`/`tagRevokedAt` fields (or a
  table) on `Vessel` (and possibly `VesselGroup`/`Keg`) — full Phase-12 checklist if a
  separate table, a column-level subset if inline fields.
- **Dependencies:** domain gate, Phase 7/8 (for objects worth scanning).
- **Owner decisions:** OD-6 must be answered before UI commitment — it decides the
  read-path component set (QR-only vs. QR+NFC).
- **Tenant/RLS implications:** explicit hard requirement in RFC-004 — a tag from
  another tenant must resolve to the **same** "unknown tag" refusal as a genuinely
  nonexistent tag, never revealing cross-tenant existence. This is a textbook
  RLS-adjacent information-leakage requirement; it needs its own test analogous to
  AC-P4, plus rate-limiting on token resolution to prevent enumeration.
- **Ledger/audit implications:** none — pure identity/lookup layer, no
  `LotOperation` involvement.
- **Tests/verification:** the 4 documented failure states; cross-tenant refusal test;
  rate-limit test.
- **Recommended PR boundary:** PR #10.

### Phase 11 — Lineage

Explicitly "approved as a direction, not scheduled" (screen inventory SC-13). No
schema change required — a UI/derivation treatment over the existing `LotLineage`/
`LotOperation` data. No PR boundary assigned; revisit after Phase 6 if prioritized.

### Phase 12 — Spillover

Patterns from Phases 5–8 propagate to `/bulk` capture, field notes, weigh-tags,
samples, spray form; unify the two work-order-creation clients
(`WorkOrderBuilderClient` + `NewWorkOrderClient`); `/settings` decomposition;
dashboard rebuild. Explicitly deferred — "belongs after the floor loop defines
'needs me today'" (handoff's words). Not planned in detail here; scope as its own
`/plan` pass once Phases 3–6 are live.

---

# PART B — DETAILED EXECUTION PLAN: PHASE 0 + PHASE 1

Two commits, one PR (`PR #1 — Foundations + Re-baseline`).

## Pre-flight checks (run once, before Unit 1)

1. **Confirm no overlapping in-flight work:**
   `git fetch --all && git log --all --since="3 days ago" --oneline -- src/components/ui src/styles/tokens src/components/AppShell.tsx DESIGN.md`
   — expect no results outside this branch (verified clear at plan time; re-verify
   at execution time since other worktrees move daily).
2. **Full audit of Button/Badge/ConfirmButton call sites** (baseline counts already
   gathered by research; re-run for freshness immediately before editing):
   `grep -rn '\bButton\b' src | wc -l` (baseline: 798/122 files),
   `grep -rn '\bBadge\b' src | wc -l` (baseline: 360/89 files),
   `grep -rln 'tone="gold"' src` (the actual breaking-rename list — expected ~12
   files per DESIGN.md's own drift note; this is the list that needs literal edits,
   not the full 89-file Badge-import list, since most `Badge` call sites use other
   tones and are unaffected by the rename),
   `grep -rn '\bConfirmButton\b' src | wc -l` (baseline: 64/13 files).
   **Council-review broadening:** the `gold` audit must also cover non-literal uses —
   run `grep -rn 'gold' src test` to catch `: "gold"` as a typed value, any
   `BadgeTone`/`Tone`-typed helper map entries, test fixtures, and the styleguide
   page, not just JSX `tone="gold"` literals. Similarly the `ConfirmButton`
   `confirmLabel` audit (Unit 7) must cover test files and the styleguide, not only
   the 13 production call sites, since removing the `"Delete"` default breaks any of
   those too. **Council-review addition:** also run
   `grep -rn 'statusTone(\|blendTrialStatusTone(' src` and record every result now —
   this is the exact consumer list Unit 5/6 must re-verify (see Unit 6).
3. **Enumerate the "24 audited routes"** referenced throughout the handoff's
   acceptance criteria — the handoff docs read so far don't give this list verbatim.
   Generate it from the route tree: `find src/app -name "page.tsx" -path "*/\(app\)/*"`
   (or equivalent), cross-check against `02-screen-inventory.md`'s SC-01–SC-14 route
   list when that doc is read for Phase 3. Use this list as the fixture set for visual
   regression and axe-core in this phase.
4. **Install missing test infra:** `@axe-core/playwright` is not currently a
   dependency (confirmed — only `@playwright/test` exists). Add it as a devDependency.
   No visual-regression baseline exists yet (only `test/e2e/accounting.spec.ts`,
   screenshots on-failure-only) — this phase's "before" snapshots **are** the first
   baseline, not a diff against a prior one.

## Unit 1: Foundations — token additions

**Goal:** add every additive Phase-0 token without changing any current rendering
(except the focus-ring radius refinement, tracked separately in Unit 3).

**Files:**
- `src/styles/tokens/colors.css` — append: darkened text-safe variants (`--golden-ink:
  #8A6414`, `--red-ink: #A5342D`, `--blue-ink: #095972`, `--ink-500: #8A8272`,
  `--warning-deep-text: #5C440E`); semantic additions (`--text-meta: var(--ink-500)`,
  `--surface-tint-warning/danger/info/success/accent`); the six-value status ramp
  (`--status-{neutral,active,held,done,attention,review}-{fg,bg}`, exact hex/rgba
  values in Part A's status table above); provenance tokens
  (`--provenance-{measured,estimated}-{fg,bg}`); data-viz series tokens (`--viz-1`
  through `--viz-6`, `--viz-threshold`, `--viz-grid`, `--viz-axis`) — these are
  Phase-2-consumed but Part A specifies them as Phase-0 token additions, so add now,
  consume later; `--focus-ring-on-dark: rgba(255, 248, 241, 0.65)`.
  **Also:** per DESIGN.md's own backlog and doc 05's prune instruction, confirm
  `--lavender`/`--orange`/`--bright-mauve` are genuinely unclaimed
  (`grep -rn 'lavender\|--orange\b\|bright-mauve' src`) before deleting — if any
  live call site uses them, leave them and flag it as a Unit-1 finding rather than
  breaking that call site silently.
- `src/styles/tokens/spacing.css` — append: density tokens (`--row-h-comfortable: 56px`,
  `--row-h-default: 46px`, `--row-h-dense: 38px`, `--row-h-active: 56px`,
  `--cell-pad-x: 8px`, `--cell-pad-x-first: 12px`, `--section-gap: 24px`,
  `--page-pad-x: 32px`, `--page-pad-x-sm: 16px`, `--page-pad-y: 24px`); touch-target
  tokens (`--touch-min: 44px`, `--touch-floor: 56px`, `--touch-floor-lg: 68px`,
  `--touch-nudge: 46px`); `--border-accent-width: 3px`; responsive breakpoint tokens
  (`--bp-phone-lg: 430px`, `--bp-tablet: 768px`, `--bp-desktop: 1024px`,
  `--bp-wide: 1440px` — these are Phase-3/4-consumed but token-defined now per doc 05).
- New file `src/styles/tokens/icons.css` (keeps the existing one-category-per-file
  convention rather than overloading `spacing.css`) — `--icon-nav: 20px`,
  `--icon-tab: 24px`, `--icon-inline: 17px`, `--icon-feature: 40px`,
  `--icon-stroke: 1.6`. Import it in `src/app/globals.css` alongside the other token
  files (after `spacing.css`, before `base.css`).
- `src/app/globals.css` — add the new `@import "../styles/tokens/icons.css";` line;
  add the global `.sr-only` utility (standard visually-hidden-but-focusable clip-rect
  pattern — the handoff doesn't hand over literal CSS for this, so use the
  established WCAG pattern: `position:absolute; width:1px; height:1px; padding:0;
  margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0;`);
  add the global `prefers-reduced-motion` block (exact rule given in Part A's
  handoff-digest research, `@media (prefers-reduced-motion: reduce) { *, *::before,
  *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1
  !important; transition-duration: 0.01ms !important; scroll-behavior: auto
  !important; } }`).

**Approach:** every addition is a new CSS custom property or new rule; nothing
existing is edited except the additive `@import` line and the new `.sr-only`/
reduced-motion blocks, which touch zero existing selectors. Follow the existing
file's category/comment-header convention (see `base.css`'s header comment style).

**Tests:** `npm run build` succeeds; `/styleguide` still renders identically (visual
spot-check, not yet the formal snapshot — that's Unit 8); a quick unit test asserting
the new status-ramp and provenance token values match the spec table (guards against
transcription error in the hex/rgba values, which are easy to typo).

**Depends on:** none.

**Verification:** `npm run build && npm run lint`.

## Unit 2: Foundations — font loading

**Goal:** move Inter/Inter Tight off the render-blocking Google Fonts `@import` onto
self-hosted `next/font/google`, per AC-F10 and doc 05's explicit "CHANGED — font
loading" requirement. Confirmed safe under Next.js 16 (Part A research).

**Files:**
- `src/app/layout.tsx` — add `import { Inter, Inter_Tight } from "next/font/google"`,
  configure both with `subsets: ["latin"]`, `display: "swap"`, `variable:
  "--font-body"`/`"--font-heading"` respectively (matching the existing CSS var
  names so `globals.css`'s `@theme inline` mapping needs no change), apply
  `${inter.variable} ${interTight.variable}` to the `<html>` `className`.
- `src/app/globals.css` — delete line 1 (`@import url("https://fonts.googleapis.com/css2?...")`).
  Leave `src/styles/tokens/fonts.css` (Big Caslon `@font-face`) untouched — the
  handoff explicitly says "keep Big Caslon local as it already is"; migrating it to
  `next/font/local` is optional polish, not required by any acceptance criterion, and
  should be skipped in this PR to keep the diff minimal (flag as a Unit-2 "considered,
  deferred" note, not silently dropped).

**Approach:** `next/font/google`'s generated CSS variable output slots directly into
the existing `@theme inline` bridge in `globals.css` (confirmed by Part A research)
— no changes needed to the Tailwind bridge itself, only the token *source*.

**Tests:** AC-F10 (Lighthouse/network assert — no Google Fonts request blocks first
paint); visual spot-check that both typefaces still render identically (self-hosted
Inter should be pixel-identical to the CDN version, same font files).

**Depends on:** none (independent of Unit 1, can run in parallel).

**Verification:** `npm run build`, then a manual network-tab check in the browser
preview confirming no `fonts.googleapis.com` request fires, plus a visual diff of the
homepage/login page.

## Unit 3: Foundations — focus-visible refinement + DESIGN.md/styleguide updates

**Goal:** close Reconciliation Conflict #1 correctly (refine, don't re-add) and bring
DESIGN.md/`/styleguide` current with the new token additions, per the handoff's
explicit Phase-0 requirement that every component get a styleguide entry.

**Files:**
- `src/styles/tokens/base.css:52` — change
  `:focus-visible { outline: none; box-shadow: var(--shadow-focus); border-radius: var(--radius-sm); }`
  to `border-radius: inherit;`, matching doc 05 §A11 exactly. This is a one-token-value
  edit, not a new rule.
- `DESIGN.md` — update the "Known drift / cleanup backlog" section (`:132-146`) to
  strike the `Badge tone="gold"` item once Unit 6 lands (Unit 3 itself: add the new
  token categories — status ramp, provenance, data-viz, density, touch-target, icon —
  to the documented token inventory, and correct the "Component library" list
  (`:123-131`) once new Phase-1 components exist).
- `src/app/styleguide/page.tsx` — this is a Unit-4/5/6/7 concern for the specific new
  components (see those units); Unit 3 only adds a new section documenting the raw
  token values (status ramp swatches, provenance badges preview) so the token work is
  visually verifiable before the component work lands.

**Approach:** minimal, surgical edits — one CSS value, doc updates matching what's
literally in the codebase after this PR (not aspirational).

**Tests:** visual regression baseline snapshot of the focus-ring on a `Button` (before
this edit, the 6px radius on a pill-shaped chip's ring looked slightly off — this
should visibly improve, not regress, anything).

**Depends on:** Unit 1 (token additions must exist before styleguide references them).

**Verification:** manual focus-walk in the browser preview (Tab through `/styleguide`,
confirm a visible ring on every control) — this becomes the AC-F5/AC-V3 fixture.

## Unit 4: Button re-baseline

**Goal:** heights 34/42/50 → 44/48/56, add `xl` 68px, fix disabled state, fix `link`
baseline, consume tokens instead of hardcoded values, add `pending` state.

**Files:** `src/components/ui/Button.tsx` (currently 120 lines).

**Approach:** the current `sizes` map (`Button.tsx:37-41`) is:
```
sm: { fontSize: 13, padding: "8px 14px", gap: 6, height: 34 }
md: { fontSize: 14.5, padding: "11px 20px", gap: 8, height: 42 }
lg: { fontSize: 16, padding: "14px 26px", gap: 10, height: 50 }
```
Per doc 05 §B6, replace with the spec table (sm 44px/10px 16px/14px, md 48px/12px
20px/15px, lg 56px/16px 26px/16.5px, new xl 68px/18px 24px/19px), and prefer
`var(--text-*)`/`var(--space-*)` token references over the raw numbers wherever the
existing token scale has a matching step — Part A's token audit found the scale
already has the right granularity, this was purely a bypass, not a gap. Replace the
`opacity: 0.45` disabled style with `background: var(--paper-200); color:
var(--ink-600); border-color: var(--paper-300); cursor: not-allowed;`. Fix the `link`
variant (`Button.tsx:94-95`, currently `padding: 0; height: "auto"`) to share sibling
height + a persistent underline instead of floating off the baseline — treat this as
its own mini-audit of `variant="link"` call sites (a subset of the 798), since it's
an API/behavior change to that variant specifically, not just a size bump. Add
`pending?: boolean` and `pendingLabel?: string` props — `aria-busy` when `pending`,
accessible name stays stable, width doesn't shift; **`pending` must also imply a
click-guard** (disable pointer/keyboard activation while pending), not just the
`aria-busy` attribute — `aria-busy` alone doesn't stop a double-submit.
**Council-review addition:** explicitly verify the global `:focus-visible` rule
(refined in Unit 3) actually renders on every `Button` variant/state — default,
`link`, `disabled`, and `pending` — since the handoff separately (and correctly, per
Reconciliation Conflict #1) flagged that `Button` has no *local* focus override, but
that doesn't guarantee the global rule isn't being defeated by something else in the
component (e.g. a `style` prop overriding `box-shadow`). If it is, add a local
`:focus-visible` override to `Button.tsx` itself.

**Tests:** AC-C1 (unit + visual: renders 44/48/56/68px for sm/md/lg/xl), AC-C2
(disabled is not opacity-based, has `cursor: not-allowed`), AC-C3 (a disabled primary
always has visible explanatory text somewhere on the same screen — this is a
screen-level test, not a `Button` unit test, defer the assertion to Unit 8's
per-screen pass, but confirm `Button` itself never silently swallows a `title`-only
explanation), AC-C4 (`pending` sets `aria-busy`, is not activatable, stable
width/name), a focus-walk visual regression confirming a visible ring on every
variant/state (the new council-review check above).

**Depends on:** Unit 1 (density/touch tokens must exist).

**Verification:** `npm test -- Button` (new unit test file if one doesn't exist yet —
check `test/` for an existing `Button.test.tsx` first); visual regression.

**Blast-radius note (pre-finalization check #2):** ~798 occurrences / 122 files import
or reference `Button`. This is a **layout-risk, not a logic-risk** change — every
button-adjacent row grows 2–24px taller depending on size. Layouts most likely to
break, based on the call-site survey: dense toolbars with multiple side-by-side
buttons (`WorkOrdersClient.tsx` filter/action row, `GroupActions.tsx`, inbox action
rows), the mobile hamburger/drawer-close buttons in `AppShell.tsx` (`:367`, `:380` —
currently 38×32px, will need to hit 44×44 regardless of Phase-3's later drawer
removal), and any table row with an inline `Button` in the last cell (compliance,
samples, vendor rows) where row height was implicitly set by the old 34px button.
**Mitigation, per the handoff's own Phase-1 acceptance gate:** full-page visual
regression snapshots of all 24 routes, before and after, in the same commit — any
layout break shows up as a diff and gets fixed in this same commit, not discovered
later.

## Unit 5: StatusChip + status-ramp remap

**Goal:** new `StatusChip` component rendering the six-value ramp; remap all six
existing status→tone maps onto it.

**Files:**
- New `src/components/ui/StatusChip.tsx` — anatomy: glyph (`aria-hidden="true"`) +
  mandatory text, per doc 05 §B17. Sizes `sm` 24px (tables) / `md` 30px (headers).
  Six variants exactly matching the ramp in Part A above (`neutral ○`, `active ◐`,
  `held ◔`, `done ●`, `attention ▲`, `review ◇`), each consuming the
  `--status-*-fg`/`--status-*-bg` tokens from Unit 1. `held` renders but nothing in
  the current codebase produces it yet (it's Phase-28-gated) — build the variant,
  don't wire it to any live status yet.
This unit remaps **five** status-tone maps total (council-review: enumerated
explicitly to remove ambiguity — work-order/task, blend-trial, feedback, samples,
compliance-as-a-code-comment; inbox is a sixth surface but is a *component
replacement*, not a remap, since today's `StatusPill` has no tone variance to remap
from):

1. `src/lib/work-orders/status-badge.ts` — `STATUS_TONE` map (currently
   `DRAFT→neutral, ISSUED→blue, IN_PROGRESS→gold, PENDING_APPROVAL→maroon,
   APPROVED→green, CANCELLED→neutral, PENDING→neutral, REJECTED→red, DONE→green,
   SKIPPED→neutral`) remaps to the six-value system with `statusTone()`'s signature
   unchanged: `DRAFT/PENDING/CANCELLED/SKIPPED → neutral`, `ISSUED/IN_PROGRESS →
   active`, `APPROVED/DONE → done`, `REJECTED → attention`, `PENDING_APPROVAL →
   review`. **Council-review note:** `statusTone()`'s *return type* changes shape
   (old `Badge` tones → new `StatusChip` variants) even though its signature
   doesn't — every consumer found by the pre-flight
   `grep -rn 'statusTone(' src` (Unit-0 check) must be confirmed to render through
   `StatusChip`, not `<Badge tone={statusTone(x)}>`, before this unit is considered
   done; a lingering `Badge` consumer will fail to type-check (good — TypeScript
   catches it), but the plan now requires checking this explicitly rather than
   assuming it.
2. Also **fix** the existing blend-trial mis-tone bug found in research:
   `TrialsClient.tsx:164` currently reuses this WO-shaped `statusTone()` for
   `BlendTrialStatus`, and none of `CHOSEN/PROMOTED/DISCARDED` match a key, silently
   falling back to `neutral`. Add a **separate** mapping function
   (`blendTrialStatusTone()`, not a shared key-overload of `statusTone()`) since it's
   a different enum: `DRAFT → neutral`, `CHOSEN → active`, `PROMOTED → done`,
   **`DISCARDED → neutral`** (council-review correction — the plan originally
   proposed `attention`, which is domain-wrong: discarding a losing blend trial is a
   normal, intentional, successful terminal state in winemaking, not a warning;
   `attention` would make routine blend-trial history read as a wall of errors).
3. `src/lib/feedback/reporter-status.ts` — remap: `NEW → neutral` ("Open"),
   `IN_PROGRESS → active` ("In progress"), `RESOLVED → done` ("Resolved"),
   **`DISMISSED → neutral`** ("Reviewed, no change" — council-review correction, was
   `review`; `review` (◇) signals "awaiting a decision," but a dismissed ticket is a
   *closed* state needing no further action — mapping it to `review` would make
   users think they still have a pending task). `TRIAGED → neutral` (owner-decided
   2026-07-28: triaged means "assessed and queued to be worked," not "awaiting a
   further decision" — same visual weight as a fresh, unstarted ticket).
4. `src/app/(app)/samples/SamplesClient.tsx` — local `STATUS_TONE` (`:17-24`) remaps:
   `PULLED/SENT/PENDING/CANCELLED → neutral`, `RESULT_RETURNED → review`,
   `ATTACHED → done`. **Council-review resolution (was flagged as a judgment call,
   now resolved with evidence):** the schema already models `RESULT_RETURNED` and
   `ATTACHED` as two *distinct* terminal-adjacent states — if results attached
   automatically with no human step, there would be no reason for the schema to
   separate them. That existing modeling choice is itself the evidence that a manual
   attach step exists, so `review` (◇, "needs a decision/action") is the correct
   mapping, not a guess.
5. `src/app/(app)/compliance/ComplianceClient.tsx` — not currently badge-driven
   (renders derived booleans, `:172-243`); no code change required in Phase 1, but
   document the future direct mapping in a comment for whoever wires
   `ComplianceReportStatus` to a badge later: `DRAFT → neutral`, `FILED → done`,
   `NEEDS_AMENDMENT → attention` (owner-decided 2026-07-28: the same `attention`
   tier as any other actionable item is fine — the compliance screen's own
   surrounding context, deadlines, and filing language already signal the higher
   stakes without a new visual tier; not expanding the six-value system for this).
- `src/app/(app)/inbox/InboxClient.tsx:223-225` — the bespoke `StatusPill` (no tone
  variance today) gets replaced with `StatusChip`, using the same status-value
  source the inbox already reads; this is the one call site where "replace a
  duplicate local component with the shared one" applies, not just a remap.

**Tests:** AC-C6 (StatusChip renders glyph+text for all six, remains distinguishable
greyscaled — `filter: grayscale(1)` visual regression); a static grep test (part of
AC-C5, see Unit 6) confirming no remaining `tone="gold"` status usage anywhere; the
new `statusTone()`-consumer check above (council-review addition).

**Depends on:** Unit 1 (status-ramp tokens).

**Verification:** `npm test -- status-badge reporter-status` (extend/add unit tests
for each remap function); visual regression on `/work-orders`, `/help/feedback`,
`/samples`, `/blend/trials`, `/inbox`.

## Unit 6: Badge gold-to-wine migration

**Goal:** `tone="gold"` → `tone="wine"`, removed from status use entirely (superseded
by `StatusChip` per Unit 5).

**Files:**
- `src/components/ui/Badge.tsx` — `Tone` type (`:3`) `"gold"` → `"wine"`; the tone
  map entry (`:27`, currently `gold: { fg: "var(--wine-primary)", soft:
  "var(--accent-soft)", solid: "var(--accent)" }`) renames its key to `wine` with the
  same values (the *rendering* is already correct wine-burgundy — this is a naming
  fix, not a color fix, matching DESIGN.md's own diagnosis exactly).
- Every literal `tone="gold"` call site found by the pre-flight grep (Unit-0 check
  #2, expected ~12 files) — mechanical rename to `tone="wine"`. **Exception:** any
  call site using `tone="gold"` to render a *status* value (as opposed to a category
  label) should instead be converted to `StatusChip` per Unit 5, not merely renamed —
  cross-check each of the ~12 against Unit 5's remap list before doing a blind
  find-replace.
- `src/app/styleguide/page.tsx:56-73` — update the Badge tone examples
  (`tone="gold"` → `tone="wine"`) and add a `StatusChip` section showing all six
  statuses.
- `DESIGN.md:132-146` — strike the resolved drift item.

**Tests:** AC-C5 (static grep test: zero occurrences of `tone="gold"` in `src/`,
added as a permanent CI-style check, e.g. a small vitest that greps or a
lint rule — match this repo's existing pattern of `verify:naming`-style static
guards).

**Depends on:** Unit 5 (need the status-vs-category disambiguation done first, so the
Badge rename doesn't blindly rename a call site that should have become a
`StatusChip` instead).

**Verification:** `grep -rn 'tone="gold"' src` returns nothing; `npm test`.

## Unit 7: ConfirmButton fix + new Skeleton/EmptyState/Alert/ActionReceipt

**Goal:** fix `ConfirmButton`'s two defects; build four net-new components with no
prior implementation.

**Files:**
- `src/components/ui/ConfirmButton.tsx` (currently 53 lines, full source already
  read) — **remove the 4-second *time*-based auto-disarm** (delete the
  `React.useEffect` timeout block, `:19-24` — this is the genuine WCAG 2.2.1 defect:
  an arbitrary short duration disarming while the user may still be actively
  engaged). **Council-review addition, replacing a bare removal:** a purely
  time-based disarm and *no* disarm at all are not the only two options. On a shared
  cellar device, an indefinitely-armed destructive control is a real hazard if a
  different person picks up the device mid-arm (flagged in council review). Add an
  **event-based** disarm instead: disarm on `document.visibilitychange` (tab
  backgrounded/app switched/screen locked) or on the component unmounting
  (navigation away) — both already listed as disarm triggers in the original plan,
  now made the *primary* safety mechanism rather than a courtesy. This is WCAG
  2.2.1-compliant because it isn't a time limit on completing the action while the
  user is engaged — it only fires when the user has demonstrably stopped looking at
  the screen, which is exactly the moment a handoff-to-another-person risk exists.
  The existing inline "Cancel" ghost button (`:47-49`) already gives an explicit,
  always-visible escape hatch while armed — keep it, and don't rely on it alone.
  **Change the default label:** `confirmLabel = "Delete"` (`:10`) is a prop default
  with no object context — per doc 05 §B27, the component should require callers to
  pass an object-naming label (`confirmLabel: string`, no default). **Canonical
  format (council-review resolution, citing the handoff's own established content
  rule in doc 09 — "buttons that write must name the value/object, never a bare
  verb"):** verb + specific object identity, e.g. `"Archive CH-NEUTRAL-14"`, not a
  bare object name or a bare verb. Audit all 13 production call sites (from the
  pre-flight grep) plus any test/styleguide fixtures (council-review broadening, see
  Unit-0 check 2) for ones still relying on the bare `"Delete"` default and update
  each to the verb+object format. The hardcoded danger color override (`:44`,
  `style={{ background: "var(--danger)" }}`) can stay as-is for this PR — doc 05
  doesn't require a `Button variant="danger"` yet, that's Phase-2 scope; note it as
  deferred, not silently dropped.
- New `src/components/ui/Skeleton.tsx` — per doc 05 §B29: matches the resolved
  element's box exactly (props for width/height or a `variant` shorthand), `--paper-200`
  background, `--radius-xs`, 1.6s pulse animation, disabled under
  `prefers-reduced-motion` (consumes Unit 1's global rule automatically if built with
  a CSS animation, not inline JS). Pairs with an `aria-live="polite"` text line via a
  `label` prop (default something generic, caller overrides per context, e.g.
  "Loading your work orders…"). Two existing local skeletons
  (`VesselTimeline.tsx:187`'s `SkeletonRow`, `VineyardModal.tsx:402`'s
  `SummarySkeleton`) are **not** required to migrate in this PR (out of scope — Phase
  1 is additive, not a forced migration of every call site) but should be noted as
  future consolidation candidates in the component's own doc comment.
- New `src/components/ui/EmptyState.tsx` — per doc 05 §B30: anatomy is what's true /
  why / 1–2 next actions, never a dead end. The `/work-orders` empty state is
  explicitly named as the model to match — read its current copy/structure before
  building the component's default slot behavior. Do not force-migrate the ~108
  ad-hoc empty-state call sites found in research; ship the component and its
  `/styleguide` entry, migrate call-sites screen-by-screen as those screens are
  touched in later phases (Phase 3+).
- New `src/components/ui/Alert.tsx` — per doc 05 §B25: variants `info`/`warning`/
  `danger`/`success`; anatomy glyph + title (object + what happened) + body (ledger
  consequence, if any) + actions; `role="alert"` for errors, `role="status"` for
  success; never color-only (glyph + text always present).
- New `src/components/ui/ActionReceipt.tsx` — per doc 05 §B26: this component **does
  not exist anywhere in the current codebase** (confirmed by direct search — zero
  hits outside the handoff docs themselves). Anatomy: glyph, a sentence naming what
  was recorded and where, a "Written to the lot ledger at [time] by [actor]" line,
  a **Correct this entry** action, a **See the ledger line** action. Persistent
  until dismissed or superseded — explicitly not a timed toast (`role="status"`,
  focusable, actions ≥48px). **Scope note:** building this component in Phase 1 is
  correct per the handoff's explicit Phase-1 component list, but wiring it into any
  real recording flow (replacing one of the ~69 ad-hoc success sites) is **out of
  scope for this PR** — that's Phase 5+ screen work, once the actual recording flows
  are being touched. Phase 1 ships the component + its `/styleguide` preview only.
  **Council-review addition:** to avoid an open-ended "some screens use the new
  pattern, most don't" in-between state, the PR description for this phase must
  explicitly list which later phase retires each of the ~69 ad-hoc
  success-confirmation sites and ~108 ad-hoc empty-state sites (Phase 5 for
  work-order screens, Phase 12/"Spillover" for the rest per Part A) — a documented
  end date, not an open-ended primitive with zero adoption plan. A full reference
  migration inside this PR was considered and declined: it would pull business-logic
  files outside Part B's stated file list and contradict this plan's own "Phase 0/1
  must not change work-order domain logic" requirement.
- `src/components/ui/index.ts` — export the four new components.
- `src/app/styleguide/page.tsx` — add sections for all four, plus `ConfirmButton`
  (currently missing from `/styleguide` entirely per research) and `Tabs`/`Textarea`/
  `InfoHint` while touching this file, closing the "12 of 21 components have no
  preview" gap the handoff calls out (doc 06 §3), at least for everything this PR
  touches or that already exists and was simply never added.

**Tests:** AC-C7 (unit: arm `ConfirmButton`, wait 6s, assert still armed — direct
regression test against the exact bug being fixed), AC-C8 (`ConfirmButton`'s label
names its object — a lint-style check that no call site still passes no
`confirmLabel` or a generic one), AC-C11 (`Skeleton` CLS assert = 0 via Playwright),
AC-C12 (`ActionReceipt` persists until dismissed — unit test), AC-C17 (every
component in the migration map has a `/styleguide` entry — static test against the
export barrel, scoped to what Phase 1 actually ships).

**Depends on:** Unit 4 (Button, since `ConfirmButton` wraps it), Unit 1 (tokens).

**Verification:** `npm test -- ConfirmButton Skeleton ActionReceipt`; manual
`/styleguide` walkthrough.

## Unit 8: AppShell — skip link, aria-current, aria-expanded

**Goal:** close the three zero-across-the-app accessibility gaps in the shell,
reusing the codebase's own already-correct `aria-expanded` pattern rather than
inventing a new one (per Reconciliation research: 14 other files already do this
right).

**Files:** `src/components/AppShell.tsx` (439 lines, full relevant sections already
read).

**Approach:**
- **Skip link:** add `<a href="#main" className="skip-link">Skip to main content</a>`
  as the very first element inside the shell's root return, styled visually-hidden-
  until-focused (reuse Unit 1's `.sr-only` pattern plus a `:focus` override that
  makes it visible — the standard skip-link CSS idiom, not a new pattern to invent).
  Add `id="main" tabIndex={-1}` to the `<main>`-equivalent content wrapper the shell
  renders (locate it precisely when editing — the shell wraps `children`, find the
  exact wrapping element).
- **`aria-current`:** the nav `<Link>` elements (`AppShell.tsx:205`, `:208`, `:116`)
  currently style active state visually via `linkStyle(active)` (`:73-82`) but never
  set the attribute. Add `aria-current={active ? "page" : undefined}` alongside the
  existing `style={linkStyle(active)}` on every nav `<Link>` in the file — this is a
  prop addition next to existing logic already computing `active`/`isActive(href)`,
  not new logic.
- **`aria-expanded`:** the `CollapsibleNavGroup`-equivalent toggle button
  (`AppShell.tsx:102-112`) currently has no `aria-expanded`, only a rotating `›`
  glyph (`:111`) as a visual-only cue. Add `aria-expanded={open}` and
  `aria-controls={<generated id for the items div>}` to the `<button>`
  (`:103`), and the matching `id` on the `items.map(...)` wrapper div (`:117`,
  currently unconditionally rendered `{open ? (<div>...`). This is the exact pattern
  already used correctly in `Collapsible.tsx:73` — copy its `aria-expanded`/
  `aria-controls`/id-generation approach rather than reinventing it.
- **Mobile hamburger/drawer:** `AppShell.tsx:367`/`:380` already have `aria-label`s
  ("Open menu"/"Close menu") — add `aria-expanded` to the hamburger button reflecting
  drawer open state, since the drawer itself is a collapsible region conceptually
  identical to the nav-group toggles above. (Full drawer `aria-modal`/focus-trap
  wiring is explicitly Phase 3 scope per the handoff's phase table — the drawer is
  being *deleted* in Phase 3 in favor of the mobile tab bar, so don't over-invest in
  drawer a11y polish here; `aria-expanded` alone closes the Phase-1-relevant gap.)

**Tests:** AC-S1 (skip link is first focusable, moves focus to `#main`), AC-F2
(≤1 tab stop before main content — direct consequence of the skip link), AC-F3
(exactly one nav item with `aria-current="page"` per route), AC-F4 (every disclosure
button's `aria-expanded` reflects state).

**Depends on:** Unit 1 (`.sr-only` for the skip-link's hidden-until-focused styling).

**Verification:** Playwright DOM assertions (new spec, e.g.
`test/e2e/appshell-a11y.spec.ts`) checking tab-stop count, `aria-current` presence,
`aria-expanded` correctness across a sample of routes from the Unit-0 route
enumeration.

## Unit 9: Execute-screen errors → role="alert"

**Goal:** the execute screen's plain, unannounced error `<div>` becomes a
screen-reader-announced alert.

**Files:** `src/app/(app)/work-orders/[id]/execute/ExecuteClient.tsx` — two exact
locations found:
- `:211` — `{error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}`
  → add `role="alert"` to this div (keep the existing inline style for this PR;
  migrating it to the new `Alert` component from Unit 7 is optional polish — do it if
  trivial, but don't let it block the PR if the `Alert` component's props don't
  cleanly fit this exact single-line-error shape yet).
- The second `error`/`failures` state block starting around `:233-252` (the
  multi-task batch-completion path) — same treatment: wherever this component
  currently renders `error` as plain text, add `role="alert"`; check whether
  `failures` (the per-task failure list, `:234`) also renders as plain text and needs
  the same fix — read the surrounding render code at edit time to confirm the exact
  JSX, since research located the state declarations but not every render branch.

**Approach:** minimal — add `role="alert"` to the existing error-rendering elements;
do not restructure the component's state management or validation flow (explicitly
out of scope — Phase 1 is presentational/ARIA only).

**Tests:** part of AC-F7 (axe-core zero-violations pass will catch an unlabeled error
region) and directly exercised by AC-N3-style workflow tests in later phases; for
Phase 1 itself, a focused Playwright test triggering a validation error on this
screen and asserting the error is exposed via the accessibility tree with
`role="alert"`.

**Depends on:** none (independent file, can run in parallel with Units 4-8).

**Verification:** manual test — trigger a task-completion error in the browser
preview, confirm via `read_page`/axe that the error region has `role="alert"`.

## Test Strategy

**Unit tests (vitest):** new/extended tests for `Button`, `StatusChip`,
`ConfirmButton`, `Skeleton`, `ActionReceipt`, `status-badge.ts`,
`reporter-status.ts`, `SamplesClient`'s status map — colocate under `test/` matching
this repo's existing convention (check `test/` for a `components/` or `ui/`
subfolder pattern before creating new files).

**Static/lint-style guards:** a grep-based or vitest-based check that `tone="gold"`
never reappears in `src/` (AC-C5) — model this on the repo's existing
`verify:naming`-style static guard scripts.

**Playwright (`npm run qa:e2e`):**
- New `test/e2e/phase1-a11y.spec.ts` (or split per concern) covering: tab-stop count
  per route (AC-F2), `aria-current` presence (AC-F3), `aria-expanded` correctness
  (AC-F4), touch-target measurement ≥44×44px at 390px (AC-F1), zero axe-core
  violations at 390px and 1440px (AC-F7) — requires adding `@axe-core/playwright` as
  a new devDependency (confirmed not currently installed).
- Reduced-motion emulation test (AC-F6) using Playwright's
  `page.emulateMedia({ reducedMotion: 'reduce' })`.
- Visual regression: `toHaveScreenshot()` baselines for all routes from the Unit-0
  enumeration, at 390px and 1440px, both before this PR's changes (the "before"
  commit-point snapshot) and after (Phase 1's commit) — since no visual-regression
  baseline exists yet in this repo, these ARE the first baseline; store them under
  `test/e2e/__screenshots__/` or wherever Playwright's config resolves by default
  (check `playwright.config.ts` for a `snapshotDir` override — none currently set,
  so it uses Playwright's default alongside the spec file).

**Manual verification:** full keyboard-only walkthrough of `/styleguide` and 3-4 real
routes (confirm every control reachable, visible focus ring throughout); VoiceOver or
NVDA spot check on the execute screen's new `role="alert"` error.

**Commands to run before editing (per the user's explicit ask):**
```bash
git status
git fetch --all
npm run lint
npm test
npm run build
```
(Confirms a clean starting tree, no silent conflicts with other branches, and a
green baseline before any edit — standard practice, but worth stating explicitly
since this is the first PR on a fresh branch.)

**Commands to run before declaring the PR ready:**
```bash
npm run lint
npm test
npm run build
npm run qa:e2e
grep -rn 'tone="gold"' src   # expect zero
grep -rn '"Offline — will retry"' src   # expect zero (Phase 3 removes this string;
                                          # confirm Phase 1 didn't accidentally touch it either way)
```
Plus the manual visual-regression review (compare the before/after snapshot set) and
a manual keyboard/screen-reader spot check, since axe-core catches programmatic
violations but not every UX-level regression (e.g. a focus ring that's technically
present but visually wrong on a specific dark surface).

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Button height change breaks a dense layout not caught by spot-checking | MED | MED | Full-page visual regression across all 24 routes in the same commit (Unit 4's approach); fix in the same commit, not a follow-up |
| Status remap judgment calls (TRIAGED, DISMISSED, RESULT_RETURNED, CHOSEN/DISCARDED) read wrong to the design owner | LOW | LOW | Flagged explicitly in Unit 5 as recommended-but-unconfirmed; cheap to adjust post-hoc since it's a single map entry per value |
| `next/font/google` self-hosting introduces a subtle FOUT/layout-shift regression | LOW | LOW | `display: "swap"` matches current behavior; visual regression on typography-heavy pages (login, lot detail) catches any shift |
| ConfirmButton auto-disarm removal changes behavior some user has quietly depended on (e.g. expecting it to "reset" on its own) | LOW | LOW | This is an explicit, named WCAG 2.2.1 defect fix per the approved handoff — behavior change is intentional and documented in the PR description |
| Axe-core/Playwright visual-regression infra is net-new to this repo, first run may surface a large number of pre-existing violations beyond Phase 1's own scope | MED | MED | Scope the Phase-1 gate to the AC-F/AC-C criteria this PR actually targets; log (don't silently fix) any out-of-scope violation axe surfaces, route it to `TODOS.md` or a future phase rather than scope-creeping this PR |
| Automated visual-regression snapshots prove a layout didn't *break* but not that a dense screen (63-row queue, 40-tank board) is still comfortable to scan at the new button heights (council review, Gemini) | MED | LOW | Add a manual product/design sign-off pass on the highest-density screens with realistic production-scale data as an explicit step before merge, in addition to the automated snapshot diff |

## Success Criteria

- [ ] All AC-F1–AC-F10 pass (Phase-1 gate, per the handoff's own framing).
- [ ] All AC-C1–AC-C8, AC-C11, AC-C12, AC-C17 pass for the components this PR ships.
- [ ] Zero `tone="gold"` occurrences remain in `src/`.
- [ ] Zero Prisma schema, migration, ledger, work-order-domain, or assistant-behavior
      changes in this PR (verified by `git diff --stat` scoped review before merge).
- [ ] `npm run lint && npm test && npm run build && npm run qa:e2e` all green.
- [ ] Full before/after visual-regression snapshot set attached to the PR.
- [ ] No regressions in any existing passing test.

## Confidence Check

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Directly verified against the repo, not assumed from the handoff |
| Reconciliation Conflicts | HIGH | Verified with exact file:line reads, not just agent summary |
| Master Reconciliation Plan (Part A) | MEDIUM-HIGH | Phases 0-6 are well-grounded in direct schema/code checks; Phases 7-10's schema verdicts are solid, but exact migration shapes are intentionally left open pending RFC approval + OD decisions, as required |
| Phase 0/1 Execution Plan (Part B) | HIGH | Every file/line reference was read directly from source, not inferred; the one open item (execute screen's second error-render branch, Unit 9) is flagged as needing a look at edit time rather than guessed |
| Test Strategy | MEDIUM | Commands are correct and verified against `package.json`/`playwright.config.ts`; the exact shape of new Playwright spec files is left to implementation since no axe-core precedent exists yet in this repo to pattern-match against |
| Status-value remap (Unit 5) | MEDIUM | The WO/task mapping is directly specified by the handoff; the other 4 enums' mappings are this plan's own reasoned extension, flagged as judgment calls where genuinely ambiguous |

## Unresolved conflicts

See "Reconciliation Conflicts" above — the only material one is the pre-existing
global `:focus-visible` rule, resolved as a refinement rather than a new addition.

## Council review (2026-07-28)

This plan was sent to Codex and Gemini for adversarial review after initial approval.
Full findings: [council-feedback.md](../../council-feedback.md). All convergent/
objective findings (4 of 4 critical, 8 of 10 should-fix) were resolved directly in
this revision — see the inline "council-review" notes throughout Parts A and B.
Two findings remain genuine product/domain judgment calls and are carried below as
the only items blocking implementation.

## Owner decisions required before implementation

**Both council-review status-mapping questions are now resolved (owner-decided
2026-07-28):** `TRIAGED → neutral`; `NEEDS_AMENDMENT` stays in the shared `attention`
tier, no new escalation tier added. Both are reflected inline in Unit 5 above. Phase
0/1 has **zero remaining blocking owner decisions.**

None of the original OD-1 through OD-7 decisions block Phase 0/1 either (see Decision
Log — all gate later phases, unchanged by this review).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | -- | -- |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** NO REVIEWS YET — run `/council` for cross-LLM adversarial review, or the individual reviews above.
