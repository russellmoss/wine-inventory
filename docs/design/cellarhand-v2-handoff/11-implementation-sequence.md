# 11 · Implementation Sequence

The goal is a sequence of independently shippable increments, none of which requires a full-application rewrite, and a clear line between what needs a migration and what does not.

**Key fact from `08-data-dependency-matrix.md`:** the shell, the queue, the brief, the tank board and the tank detail are entirely class A/B/C. **They ship without a single database change.** Only the topping runner, barrel-group settings and scan need class-D work.

---

## Phase 0 · Foundations (no DB, no visible change)

| Work | Notes |
|---|---|
| Add the NEW tokens from `05-design-system-v2.md` Part A | Additive only; nothing consumes them yet |
| Global `:focus-visible` rule | Currently missing entirely |
| Global `prefers-reduced-motion` rule | Currently honoured in 4 components individually |
| `.sr-only` utility | Does not exist |
| Move Google Fonts from CSS `@import` to `next/font`, self-hosted | Removes a render-blocking third-party request |
| Prune `--lavender`, `--orange`, `--bright-mauve` if unclaimed | DESIGN.md's own backlog |
| Update DESIGN.md and add every component to `/styleguide` | 12 of 21 components have no preview today; make the styleguide the visual-regression surface |

**Stopping point:** safe. Nothing changes for users.
**Risk:** low. **Depends on:** nothing.

---

## Phase 1 · The re-baseline (no DB, visible everywhere)

This is the one unavoidably wide change. Do it in a single commit with full-page visual-regression snapshots before and after.

| Work | Why it must be here |
|---|---|
| `Button` — 44/48/56 + `xl` 68, focus, real disabled state, `link` baseline, token consumption, `pending` | Every screen's vertical rhythm shifts; doing it later means re-baselining twice |
| `StatusChip` + the six-value status ramp; `statusTone()` remapped | `Badge tone="gold"` renders wine, so status is undifferentiated on the busiest screen |
| `Badge tone="gold"` → `tone="wine"`, removed from status use | Breaking prop change, ~12 call sites |
| `ConfirmButton` — remove the 4s auto-disarm, name the object | WCAG 2.2.1 and a real mis-click trap |
| `Skeleton`, `EmptyState`, `Alert`, `ActionReceipt` | Needed by everything after |
| Skip link + `aria-current` + `aria-expanded` in `AppShell` | 13–21 tab stops → 1; the cheapest accessibility win in the product |
| Errors on the execute screen → `role="alert"` | One-line fix on a real defect |

**Acceptance gate:** an axe pass at 390 and 1440 on all 24 audited routes with zero violations, and a touch-target pass showing zero controls under 44px.
**Stopping point:** safe and highly valuable on its own — every existing screen improves.
**Risk:** medium (visual churn). **Depends on:** Phase 0.

---

## Phase 2 · Shared components (no DB)

| Work |
|---|
| `Input` sizes and slots; `NumericUnitInput` with the live derived readout; `Select`/`Combobox`; `Checkbox`; `DateTimeControl` |
| `PageHeader` + `Breadcrumbs` — retires the 40/36/32/22px h1 inconsistency |
| `DataRow`, `ResponsiveTable` (transformations A/B/C) |
| Remove the global `table { display:block; white-space:nowrap }` mobile rule |
| `TimeSeriesChart` consolidating `BrixChart` + `AnalyteTrendChart`, with the mandatory data-table alternative |
| `loading.tsx` for every heavy route; `not-found.tsx` at each route-family root |

**Stopping point:** safe. **Risk:** medium — the table rule change touches every table; migrate table by table behind the new component.
**Depends on:** Phase 1.

---

## Phase 3 · Application shell and IA (no DB)

| Work |
|---|
| New nav model: 3 groups, 13 destinations, frequency order |
| Top bar: search field, scan control (disabled placeholder until Phase 7), connection indicator |
| `MobileTabBar`; delete the drawer |
| `SectionNav` for Work orders, Lots, Inventory, Bottling, Setup |
| Rehome the orphaned routes per `01-information-architecture.md` §4 — **no URL changes** |
| Honest connectivity messaging (`03-interaction-spec.md` §11 "today" table); **delete "Offline — will retry"** |

**Ship behind a flag** if a rollback path is wanted; the nav is the most opinionated change and the one most likely to prompt feedback.
**Stopping point:** safe. **Risk:** medium. **Depends on:** Phase 2.

---

## Phase 4 · Global search and command palette (class C — new API, no DB)

| Work |
|---|
| Server-side search endpoint across barrels, groups, tanks, kegs, lots, WOs, blocks, materials, destinations |
| `CommandPalette` with **Do → Go to → Ask** ordering |
| Recent objects in `localStorage` |
| Wire ⌘K, `/`, the top-bar field and the mobile Find tab |

This closes audit finding S5 and takes the assistant off the critical path for findability. It is deliberately early because everything after it benefits.
**Stopping point:** safe. **Risk:** medium (query performance at 8,000 barrels — index before shipping).
**Depends on:** Phase 3.

---

## Phase 5 · Work-order queue and brief (class A/B)

| Work |
|---|
| `SavedViews` + `Narrow` replacing `WorkOrderFilterBar`; live application, URL-synced, no Apply; mobile sheet |
| Queue table with group-level rows, progress, expansion — falls back to vessel counts until RFC-001 lands |
| Card list at ≤767px; the title row stacks |
| Brief: `PageHeader`, definition list, **Take care** row, blocker text out of `title` tooltips |
| `StageIndicator` (derived, no stored column) |
| "Where it came from" panel — 3 entries + link |

**Stopping point:** safe and complete on its own — this is the audit's recommended vertical slice, minus capture.
**Risk:** low-medium. **Depends on:** Phase 4 (for narrowing's entity resolution).

---

## Phase 6 · Tanks (class A/B)

| Work |
|---|
| Tank board replacing the collapsed accordions on `/bulk`; **lot code on every tile**; fill height; state glyph; filters |
| Tank detail with `Tabs`: Fermentation (chart) · Analyses · Tasting notes · History · Additions |
| Vessel-scoped history union |
| Export moves out of the page's most prominent position |

**Stopping point:** safe. This also fixes audit S15 (the cellar's primary screen showing no wine).
**Risk:** low. **Depends on:** Phase 2 (`TimeSeriesChart`, `ResponsiveTable`).

---

## ⛔ Domain gate — approval and migration required before Phase 7

Everything above ships with **no schema change**. Everything below is blocked on:

1. RFC-001 approved and migrated (barrel-group type, position, effective-dated membership, settings, location, status)
2. RFC-002 approved and migrated (keg, keg fill, topping tick)
3. RFC-003 approved and migrated (`CaptureMethod.DERIVED` — its own enum-only migration, committed before any code writes it)
4. RFC-004 approved and migrated (tag tokens)
5. OD-3, OD-4, OD-5, OD-6 answered

Postgres requires enum additions in a dedicated migration ahead of the code that writes them — the schema comments document this repeatedly. Sequence RFC-003's migration **first**.

---

## Phase 7 · Barrel groups (class D — RFC-001)

| Work |
|---|
| Migration: type, position, effective-dated membership, location, status, settings |
| Backfill: existing groups → `OPERATIONAL`; positions by natural sort; `addedAt = createdAt` |
| Report (do not enforce) OD-3 violations |
| `/cellar/groups` index and `/cellar/groups/[id]` settings |
| `/vessels/[id]` individual barrel detail |
| Group-scoped work orders; rollups computed and labelled as derived |

**Stopping point:** safe. Groups are useful before the runner exists.
**Risk:** medium-high — effective-dated membership is the subtle part; test the "historical round reads historical membership" case first.

---

## Phase 8 · Topping runner and keg model (class D — RFC-002/003)

| Work |
|---|
| Migrations: `CaptureMethod.DERIVED` (enum-only, first), then keg, keg fill, topping tick |
| Keg panel, tick grid, `GroupRibbon`, bulk tick |
| Keg close-out: atomic, one `batchId`, one measured withdrawal + N estimated additions with divisors |
| `ProvenanceBadge` everywhere derived figures appear |
| Barrel capacity → soft warning at >15% of nominal, overridable |
| Phone runner: 68px tick, note, scan re-anchor (scan stubbed until Phase 10) |
| `CorrectionDialog` with re-fan and its stated downstream effect |
| Blocked-correction prose naming the later operation |

**Risk:** high — this is the new domain behaviour. Test atomicity, idempotency and re-fan arithmetic before any UI polish.
**Stopping point:** safe once close-out is atomic; do not ship a partial close-out under any circumstances.

---

## Phase 9 · Assistant behaviour (class C)

| Work |
|---|
| "Review & create" creates the draft **and navigates to it** |
| Page passes object context to the dock so the conversation continues on the same object |
| `AIProposalCard` and `ProvenancePanel` as real components |
| Degraded-AI states |

The dock itself is untouched. **Risk:** low. **Depends on:** Phase 5.

---

## Phase 10 · Scan (class D — RFC-004)

Tag tokens, `/t/<token>` resolver, `BarcodeDetector` + Web NFC + manual fallback, runner re-anchoring, the four failure states.
**Risk:** medium (device variance). **Depends on:** Phase 7/8 for the objects worth scanning.

---

## Phase 11 · Lineage (class B, conceptual)

Lineage DAG read, `LineageNode`/`LineageEdge`, the phone event stream, and the accessible lineage table. Approved as a direction, not scheduled. **Depends on:** Phase 6.

---

## Phase 12 · Spillover

The patterns from Phases 5–8 transfer directly to `/bulk` capture, field notes, weigh-tags, samples and the spray form. Unify the two work-order creation clients here. `/settings` decomposition and the dashboard rebuild belong after the floor loop has defined what "needs me today" means — that ordering is the audit's own §8 argument.

---

## Dependency summary

```
0 Foundations
└─ 1 Re-baseline ── 2 Shared components ── 3 Shell/IA ── 4 Search
                                              │             │
                                              │             └─ 5 Queue & brief ── 9 Assistant
                                              └─ 6 Tanks ─────────────────────── 11 Lineage
   ⛔ DOMAIN GATE (RFC-001/002/003/004 + OD-3/4/5/6)
   └─ 7 Barrel groups ── 8 Topping runner ── 10 Scan ── 12 Spillover
```

## Risk register

| Risk | Phase | Mitigation |
|---|---|---|
| Button height change breaks dense layouts | 1 | Full-page visual regression before/after; fix in the same commit |
| Table rule removal breaks a table nobody tested | 2 | Migrate table by table behind `ResponsiveTable`; keep the old rule scoped to unmigrated tables |
| Nav change disorients existing users | 3 | Flag; keep old labels as search aliases for one release |
| Search performance at 8,000 barrels | 4 | Index and load-test before shipping; server-side only |
| Effective-dated membership misreports history | 7 | Test the historical-read case before building UI |
| Close-out writes partially | 8 | One transaction; test the failure path first |
| Estimated figures reach a TTB report unflagged | 8 | RFC-003's queryable classification; tell compliance before the first affected period |
| Scan device variance | 10 | Manual entry always available; feature-detect, never advertise |
