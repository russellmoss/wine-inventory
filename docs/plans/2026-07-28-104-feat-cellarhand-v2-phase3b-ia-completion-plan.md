# Plan 104 · Cellarhand UI/UX v2 — Phase 3b: finish the IA

**Type:** feat · **Depth:** Deep · **Date:** 2026-07-28 · **Status:** BUILT (see Execution Record)
**Base:** current `main` (`2613a828`) · **Branch:** `claude/cellarhand-v2-phase3b-ia`
**Predecessor:** plan 103 (Phase 6 tanks, merged as [#562](https://github.com/russellmoss/wine-inventory/pull/562)).
**Handoff sources:** `01-information-architecture.md` §2/§3/§4/§5/§9, `02-screen-inventory.md`,
`04-responsive-spec.md`, `05-design-system-v2.md` §B2.

---

## Overview

Phase 3 replaced a 31-entry sidebar with 13 destinations and planned for the other ~22 surfaces
to be reached from sub-navigation. **That sub-navigation was never built.** `SectionNav` shipped
in Phase 2 with zero consumers and has sat unused ever since.

Measured against the running app with `NEXT_PUBLIC_NAV_V2=1`, on the live Demo Winery tenant:
**17 of 56 static routes are reachable.** Not deleted — every route is in `test/fixtures/routes.json`
and `route-stability` fails on removal — just unreachable. The URLs are fine; there is no way in.

Production is safe today because `NEXT_PUBLIC_NAV_V2` is unset, so the legacy sidebar is live.
**This phase is the precondition for ever turning the flag on.** Phases 7, 9 and any map work are
all building on a nav that currently cannot ship.

---

## Problem Frame

**Job to be done:** a winemaker opens the app and reaches Vessels, Users, Vendors, the Map
Explorer or Spray records without knowing a URL.

**What happens if we do nothing:** the v2 nav stays permanently un-shippable. Every subsequent
phase adds surface area behind a flag nobody can turn on, and the two navs drift further apart.

**The honest count.** An earlier pass in this session said 39 routes were unreachable. That was
too pessimistic and the plan should not inherit it. Of those 39: **5** are auth pages
(`/login`, `/forgot-password`, `/reset-password`, `/change-password`, `/no-winery`) which
correctly have no nav; **3** are role-gated dev tools (`/developer`, `/migration`, `/styleguide`);
**3** are permanent redirect stubs (`/setup/equipment` and `/setup/expendables` both
`permanentRedirect` into `/inventory?section=…`, plan 080 U6). The real number is **~28 genuinely
orphaned operator surfaces**.

**Is there a simpler framing?** Considered and rejected: "just put everything back in the
sidebar". That undoes Phase 3 and re-creates the 31-entry list the audit called un-navigable.
The IA is right; the second level of it is missing.

---

## Reconciliation Conflicts (verified against source, not assumed)

The Phase 0/1 pass found 8 wrong handoff claims, Phase 2/3 found 8 more, Phase 6's pre-landing
review found 23 criticals behind 5,450 green tests. Same discipline here. **Eleven.**

**1. `SectionNav` has zero production consumers.** Built in Phase 2, exported from the UI barrel,
referenced only by `test/shell-nav.test.ts` (which reads it as *text*) and by docs. No `.tsx`
under `src/app/` imports it. The component this phase is "adopting" has never rendered.

**2. The two sub-navs that DO exist use the exact anti-pattern `SectionNav` forbids.**
`work-orders/WorkOrdersTabs.tsx:24-35` and `inventory/InventoryTabs.tsx:32-55` both put
`role="tablist"` / `role="tab"` on real `<Link>`s, at `minHeight: 36` (below the 44px floor).
`test/shell-nav.test.ts:22-24` prohibits precisely this *in SectionNav* while both shipped
components do it. They are also **query-param switchers on one route**, not sibling-route nav —
so they are not the sub-navigation the IA is missing, and they should not be mistaken for it.

**3. `NavDestination` has no field for sub-tabs.** Neither does `AppShell`'s local `NavItem`
(`AppShell.tsx:19`). There is nowhere in the model to hang a second level.

**4. `CONTEXTUAL_DESTINATIONS` cannot feed anything.** Its 22 entries carry `{ href, reachedFrom }`
and nothing else — **no label, no role flags**. `query.ts:18-20` states role filtering is
load-bearing ("search cannot become a side channel that reveals an admin-only destination"), so
piping these into the palette as-is would be a disclosure leak, and there is no label to match on.

**5. Thirteen of the 22 `reachedFrom` claims are false today.** Verified by grep. Actually true:
`/ferment/process`, `/blend/trials`, `/inbox`, `/assistant`, `/vineyards/sprays/products`,
`/work-orders/review`, `/work-orders/templates`. False: `/reports`, `/samples`,
`/cellar/en-tirage`, `/vessels`, `/finished-goods`, `/bottled`, `/work-orders/task-types`,
`/setup/equipment`, `/vineyards/planting-setup`, `/vineyards/maps`, `/vineyards/weather`,
`/vineyards/sprays`, `/vineyards/harvest/weigh-tags`, `/help/feedback`. The model documents an
intention, not a state.

**6. Seven routes are in NEITHER list.** `/` (the dashboard), `/locations`, `/users`,
`/reference`, `/setup/vendors`, `/setup/growers`, `/setup/clients`. The premise that
`CONTEXTUAL_DESTINATIONS` accounts for the non-global routes is wrong — it does not mention the
Setup family at all, which is exactly the family the owner asked about.

**7. `hasVineyard` is fake, and it is a live bug behind the flag.**
`AppShell.tsx:220` hard-codes `hasVineyard: isAdmin`; `search/actions.ts:32` does the same.
`AppUser.vineyardIds` exists (`access.ts:3-19`) and `requireReadyUser()` already computes it
(`dal.ts:113`), but `AppShell`'s prop type (`AppShell.tsx:330`) does not include it. **Consequence:
with the flag on, a non-admin vineyard manager with real memberships loses "Vineyard rounds"
from the sidebar entirely** — while `MobileTabBar` shows it to everyone, unfiltered. The desktop
hides it from the person who needs it and mobile shows it to people who do not.

**8. `test/appshell-a11y.test.ts:46-52` asserts EXACTLY 3 `aria-current={` in `AppShell.tsx`.**
Any shell-level sub-tab layer fails on the fourth. This single assertion rules out the most
obvious architecture and is the reason for Decision D1.

**9. `test/nav-model.test.ts:22-25` asserts exactly 13 destinations** and `:109-111` asserts
exactly 4 aliases. Growing `NAV_MODEL` is a hard fail. Sub-navigation must therefore live
*beside* the model, not inside it.

**10. `route-stability.test.ts`'s lists are hard-coded and have already drifted.** Its
`CONTEXTUAL` has 17 entries against `model.ts`'s 22, includes `/work-orders/new` which the model
does not, and omits six the model does. Neither list is derived from the other and nothing
reconciles them. Both are also *presence* checks — they assert a page exists, never that anything
links to it, which is why this entire gap went undetected.

**11. `/setup/equipment` is a redirect stub, but the model lists it as a Setup destination.**
Building the Setup link doc 01 §4 asks for would send a user to `/inventory?section=equipment`.
Plan 080 U6 retired it deliberately. Doc 01 §4 is stale.

**Claims that verified TRUE** (recorded so nobody re-checks): every one of the 56 routes exists;
`route-stability` fails on removal but not on addition (`:62-69` only logs additions);
`SectionNav`'s `aria-current` and 44px height are correct as written; `/settings` really is a flat
capabilities page whose only `href` is an `.ics` download; `isTenantAdminLike` really does treat
developer as admin.

---

## Decision Log

**D1 — sub-navigation renders per-hub, NOT in the shell and NOT in a `layout.tsx`.**

Three candidate seams. The shell is ruled out by Conflict #8 (the `aria-current` count of 3) and
because `AppShell` is a client component that would need a pathname→sections lookup.

A per-hub `layout.tsx` is the idiomatic Next answer and it is tempting — but a layout wraps
**every nested route**, so `/work-orders/[id]/execute` would inherit the Work-orders sub-nav.
That screen is a focused capture surface a cellar hand uses with wet hands; doc 04 §130 gives it
a sticky action bar and single-column fields. Putting section tabs on it is wrong, and there are
no hub layouts today to inherit the problem from.

So: each hub renders `<SectionNav>` at the top of its own page, following the placement precedent
`WorkOrdersTabs`/`InventoryTabs` already set — but using the correct component. More call sites,
each one line, each explicitly scoped to the hub index rather than its children.

**D2 — one data module feeds BOTH the sub-navs and Ctrl-K.**

New `src/lib/nav/sections.ts`: `SECTIONS: Record<string, SectionDef>` keyed by hub href, each
item carrying `{ href, label, admin?, vineyard?, requires? }`. Pure, no React, no prisma.

This is the load-bearing choice. The failure this phase exists to fix is *a surface being
unreachable*, and there are two ways to be unreachable: no nav link, and no search hit. Feeding
one module into both means a surface cannot be reachable in one and invisible in the other. It
also gives `CONTEXTUAL_DESTINATIONS` the labels and role flags it lacks (Conflict #4) without
touching `NAV_MODEL`'s 13 (Conflict #9).

**D3 — the guard is an ORPHAN CHECK, not another presence check.**

Conflict #10 is the real lesson: two hard-coded lists both asserted "this page exists" and neither
noticed that nothing linked to it. The new test walks `test/fixtures/routes.json` and requires
every static route to be accounted for by exactly one of: a `NAV_MODEL` destination, a `SECTIONS`
item, a documented contextual entry point, an auth/system route, a redirect stub, or an explicit
`INTENTIONALLY_UNNAVIGABLE` list with a stated reason. A new page with no way in fails CI.

That test is the deliverable. The sub-navs are how we make it pass.

**D4 — Setup becomes a real hub page at `/setup`, and the 8 items are grouped.**

The legacy `SETUP` group has 8 entries (Vessels · Locations · Varieties & vineyards · Vendors ·
Growers · Clients · Settings · Users). `SectionNav`'s own docstring says more than 5 is a sign the
destination should split, so a flat tab strip is the wrong shape. `/setup` is a new index route
with grouped cards; additive, so `route-stability` allows it (`:62-69`). `NAV_MODEL`'s Setup entry
repoints from `/settings` to `/setup`; `/settings` stays exactly where it is as one of the
children. **OD-3b-1** confirms.

**D5 — fix `hasVineyard` in this phase, not later.**

Conflict #7 is a live bug the flag is currently hiding: the person the destination exists for is
the one who cannot see it. It is two lines of plumbing (`vineyardIds` onto the `AppShell` prop
type, `hasVineyard: vineyardIds.length > 0 || isAdmin`) and it belongs with the IA work rather
than in a separate pass.

**D6 — leave `WorkOrdersTabs` and `InventoryTabs` alone.**

They are query-param view switchers, not route navigation, and they work. Migrating them to
`SectionNav` would mean changing what they do, not just what they render. Their `role="tablist"`
violation is real and is logged to `TODOS.md`; it is not this phase's job.

---

## Scope Boundaries

**In scope:** `src/lib/nav/sections.ts`; the orphan guard; `SectionNav` adoption on seven hubs;
a `/setup` index; the `hasVineyard` fix; palette coverage of section routes; `MobileTabBar`
role-filtering; reconciling `route-stability`'s drifted lists.

**Out of scope:**
- **Any schema change.** This is nav data and rendering.
- **Migrating `WorkOrdersTabs`/`InventoryTabs`.** See D6.
- **The collapsible rail** (still deferred from Phase 3 Unit 17).
- **The 61-heading `PageHeader` migration.**
- **Turning the flag on.** This phase makes that *possible*; flipping it is a separate decision
  with its own QA pass.
- **New surfaces.** Every route here already exists.

---

## Implementation Units

### Unit 1: `sections.ts` — the sub-navigation model
**Goal:** one pure module describing every hub's sub-navigation.
**Files:** `src/lib/nav/sections.ts`, `test/nav-sections.test.ts`
**Approach:** `SectionItem = { href; label; admin?; vineyard?; requires?: "sparkling" | "customCrush" }`
and `SECTIONS: Record<string, { label: string; items: SectionItem[] }>` keyed by hub href. Populate
from doc 01 §4/§5 **as corrected by the conflicts above** — notably no `/setup/equipment` entry.
Export `sectionsFor(href, ctx)` applying the same visibility rules as `isVisible`.
**Tests:** every item href starts with `/`; no duplicate href across all sections; no href also in
`NAV_MODEL` (the model's own both-lists rule, extended); role filtering hides admin items from a
plain user; `requires` gating; ≤5 items per section except the ones D4 exempts.
**Depends on:** none.
**Patterns:** `src/lib/nav/model.ts` for shape and `isVisible` for the ctx contract.

### Unit 2: the orphan guard
**Goal:** make an unreachable route a CI failure.
**Files:** `test/route-reachability.test.ts`, `src/lib/nav/unnavigable.ts`
**Approach:** D3. Read `test/fixtures/routes.json`, drop `[id]` routes, and require each remaining
route to be classified. `INTENTIONALLY_UNNAVIGABLE` carries a reason string per entry (auth pages,
dev tools, redirect stubs) so the exemption list is self-documenting. Failure message must name
the route and say "nothing links to it".
**Tests:** the guard itself — it fails when given a fixture route absent from every source, and
passes on the real tree once Units 3-10 land.
**Depends on:** Unit 1.
**Execution note:** test-first. Write it, watch it fail with the real orphan list, then make it pass.

### Unit 3: thread `vineyardIds`, fix `hasVineyard`
**Goal:** stop hiding Vineyard rounds from vineyard managers.
**Files:** `src/components/AppShell.tsx`, `src/app/(app)/layout.tsx`, `src/lib/search/actions.ts`
**Approach:** D5. Add `vineyardIds: string[]` to `AppShell`'s user prop, pass it from the layout
(already computed), derive `hasVineyard`. Same in the search ctx, and align its `isAdmin` with
`isTenantAdminLike` (Conflict: `actions.ts` currently misses `developer`).
**Tests:** pure-function coverage of the ctx derivation; a source guard that `AppShell` no longer
contains `hasVineyard: isAdmin`.
**Depends on:** none.

### Unit 4: `/setup` hub
**Goal:** the eight admin surfaces get a home.
**Files:** `src/app/(app)/setup/page.tsx`, `src/app/(app)/setup/SetupHub.tsx`, `src/lib/nav/model.ts`
**Approach:** D4. Grouped cards — Cellar (Vessels, Locations) · Reference data (Varieties &
vineyards, Vendors, Growers, Clients) · People (Users) · System (Settings, Work-order task types).
Server component, admin-gated with `requireAdmin()`. Repoint `NAV_MODEL`'s Setup href.
**Tests:** every legacy `SETUP` item appears (that list is the authority on what must survive);
`requires: "customCrush"` hides Clients when the program is off; admin gate.
**Depends on:** Unit 1.

### Units 5-10: adopt `SectionNav` per hub
One unit each, same shape, `**Depends on:** Units 1, 3`:

| Unit | Hub | Sections |
|---|---|---|
| 5 | `/work-orders` | Review · Templates · Task types |
| 6 | `/lots` | Samples |
| 7 | `/inventory` | Bottled · Finished goods |
| 8 | `/accounting` | Reports |
| 9 | `/bottling` | En Tirage *(when sparkling is on)* |
| 10 | `/vineyards/field-notes` + `/vineyards/harvest` | Map Explorer · Weather · Spray records; Weigh-tags |

**Approach:** render `<SectionNav items={sectionsFor(hub, ctx)} current={pathname} label="…" />`
at the top of each hub's page, above existing content, below `PageHeader`. Hub index only, never
its `[id]` children (D1).
**Tests:** per-hub source guard that `SectionNav` is rendered and that the hub's own page (not a
child route) carries it. The orphan guard from Unit 2 is what actually proves coverage.

### Unit 11: palette coverage
**Goal:** Ctrl-K finds every section route, role-filtered.
**Files:** `src/lib/search/query.ts`, `test/search-palette.test.ts`
**Approach:** D2 — iterate `SECTIONS` alongside `NAV_MODEL`, same `isVisible` contract, subtitle
naming the parent hub ("under Inventory"). Keep `PER_GROUP_CAP` and the existing ranking.
**Tests:** an admin-only section route never appears for a plain user (the leak `query.ts:18-20`
warns about); a section route is findable by label; existing palette assertions still pass.
**Depends on:** Units 1, 3.

### Unit 12: MobileTabBar and the reconciled fixtures
**Goal:** close the last two known gaps.
**Files:** `src/components/AppShell.tsx`, `test/route-stability.test.ts`
**Approach:** role-filter the four mobile tabs through the same ctx (Conflict #7's mobile half).
Derive `route-stability`'s `DESTINATIONS`/`CONTEXTUAL` from `model.ts` + `sections.ts` instead of
hard-coding them, so Conflict #10's drift cannot recur.
**Tests:** the derived lists match the model; a plain user's tab bar omits Vineyard rounds.
**Depends on:** Units 1, 3.

### Unit 13: gates
**Goal:** prove it, in a browser, on both flag paths.
**Approach:** full suite · `tsc` · lint · `npm run qa:a11y` on both flag paths · **re-run the
reachability crawl that produced this plan's numbers** and require ≥ the expected route count.
Confirm `AssistantDock` diff empty and `prisma/` untouched.
**Depends on:** all.

---

## Adversarial review, budgeted IN

Phase 6's review found 23 criticals behind 5,450 green tests, so this plan schedules the review
rather than discovering the need for it. **After Unit 12 and BEFORE the PR**, dispatch four
independent reviewers with fresh context: **security** (does the palette or a sub-nav reveal an
admin destination to a plain user — the `query.ts:18-20` leak), **adversarial** (what is still
unreachable, what is now reachable that should not be, what breaks at 390px), **maintainability**
(are the new guards vacuous — Phase 6 shipped one whose assertions matched both arms), and
**design** (44px targets, doc 09 copy, SectionNav overflow on a phone).

Two specific things to point them at, because they are this plan's most likely failure modes:
1. **A guard that passes for the wrong reason.** The orphan check is the whole deliverable; if its
   classification is too permissive it will go green while surfaces stay lost.
2. **Role filtering applied in the nav but not the palette, or vice versa.** D2 exists to prevent
   this; verify it actually does.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The orphan guard is too permissive and passes vacuously | MED | **HIGH** | Unit 2 is test-first: it must be seen failing on the real orphan list before anything makes it pass |
| A section route leaks to an unauthorised role via the palette | MED | **HIGH** | One ctx, one `isVisible`, asserted on both surfaces (D2) |
| `appshell-a11y`'s `aria-current` count of 3 breaks | LOW | MED | D1 keeps sub-navs out of the shell entirely |
| `nav-model`'s 13-destination assertion breaks | LOW | MED | Sections live beside the model, not in it (D2) |
| Sub-nav leaks onto `[id]` capture screens | MED | MED | D1 renders per-page, not per-layout; asserted per hub |
| `/setup` duplicates `/settings` confusingly | MED | MED | OD-3b-1; `/settings` becomes a child, not a sibling |
| Scope creeps into migrating the two legacy tablists | MED | MED | D6, logged to TODOS |

## Success Criteria

- [ ] Every static route is nav-reachable, palette-findable, or explicitly exempt with a reason.
- [ ] The crawl that produced this plan reports the expected reachable count, not 17.
- [ ] A vineyard manager with real memberships sees Vineyard rounds; a plain user does not see admin sections in nav **or** palette.
- [ ] `SectionNav` has real consumers.
- [ ] Zero schema changes · `AssistantDock` diff empty · no route removed or renamed.
- [ ] `qa:a11y` green on both flag paths.
- [ ] Four-reviewer pass completed before the PR, findings fixed or recorded.

## Confidence Check

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Measured by crawling the running app, then corrected down from 39 to ~28 |
| Reconciliation Conflicts | HIGH | Eleven, each verified against source with file:line |
| D1 (per-hub placement) | HIGH | Forced by a real test assertion and a real UX consequence |
| D2 (one module, two consumers) | HIGH | Directly addresses the two ways a surface goes missing |
| D3 (orphan guard) | MEDIUM-HIGH | The right mechanism; its classification rules need care, hence test-first |
| Unit 4 (`/setup` shape) | MEDIUM | Grouping is a judgment call — OD-3b-1 |
| Risk Assessment | HIGH | The two highest risks both have mechanical mitigations |

## Owner decisions — BOTH RATIFIED 2026-07-28

✅ Owner took both recommendations, and confirmed the four-reviewer pass runs BEFORE the PR.

**OD-3b-1 → RATIFIED.** — does Setup get its own page?** Recommendation: **yes**, a new `/setup` index with
grouped cards, `/settings` demoted to a child. Eight items is too many for a tab strip, and
"Setup" currently opens a page about sparkling toggles and base currency, which is not what the
label promises. *Blocks Unit 4.*

**OD-3b-2 → RATIFIED: wire the brand mark.** It is in neither list. Doc 01 §5 says
the brand mark links to it; that link does not exist. Recommendation: **wire the brand mark**
rather than spend a sidebar slot. *Blocks Unit 2's classification of `/`.*

**Nothing else blocks.** Units 1, 2 and 3 can start immediately.

## EXECUTION RECORD — BUILT 2026-07-28

**Branch:** `claude/cellarhand-v2-phase3b-ia-41e485`, 9 commits. tsc clean · lint 0 errors ·
5,537 tests passing · `AssistantDock` diff empty · `prisma/` untouched · no route removed.

**Crawled, not asserted:** live BFS from `/` with the flag on against the Demo tenant, following
only links that render — **35 of 58 static routes reachable, up from 17**, and the crawl hit its
own cap mid-queue so that is a floor. The 23 unreached: 5 auth · 3 dev tools · 6 redirect stubs ·
1 palette-only · 3 correctly hidden by capability flags the Demo tenant has off · 5 contextual
links on pages not yet dequeued.

### Where execution DEPARTED from the plan, and why

**Unit 7 does not exist.** `/bottled` and `/finished-goods` are `redirect()` stubs into
`/inventory` (plan 080 U6), not Inventory sub-tabs. A tab pointing at either would send the user
somewhere other than the label said. Both are classified as redirect stubs; `/inventory` instead
carries `/reports` (below).

**`/reports` moved to `/inventory`, not `/accounting`.** Doc 01 §4 files it under Accounting, but
`/accounting` is `admin: true` and `/reports` is `requireActiveTenant()` only — and its own `h1`
reads "Inventory reports". Parking an ungated page under an admin hub makes it unreachable for
everyone else, which is the bug this phase exists to fix, one level down.

**`/setup` is NOT admin-gated** (D4 assumed it would be). Four of its eight children — Vessels,
Locations, Varieties & vineyards, Vendors — are ungated and were ungated in the legacy sidebar.
Gating the hub would have taken all four from every non-admin.

**`/winemaking-calculator` is a `/bulk` section, not palette-only.** Its doc-01 entry point ("any
addition form") does not exist in source, and Ctrl-K needs a keyboard a cellar hand on a phone
does not have.

**The strip renders on section pages too, not just hubs** (D1 said hub-only). Hub-only is a
one-way door: click "Samples" and the strip you just used disappears. Still never on `[id]`
capture screens, and still per-page rather than per-`layout.tsx` — asserted.

**`CONTEXTUAL_DESTINATIONS` was deleted**, not just documented as stale. Zero runtime consumers,
and it contradicted `unnavigable.ts` about four routes.

### Adversarial review — RAN, before the PR

Four independent reviewers with fresh context. Five findings, all green on 5,513 tests at the
time, all fixed: the ungated-page-under-admin-hub trap (5 surfaces); no phone entry point for the
calculator; the one-way-door strip; a D2 palette guard that was six `expect(SOURCE).toContain(...)`
over code nothing in the repo executed; and `hubLabel` resurrecting "Field notes"/"Harvest", the
two labels doc 01 §5 retired. Two new guards were added as a result —
`test/search-sections.test.ts` (executes `searchEverything`) and `test/nav-section-guards.test.ts`
(reads each target `page.tsx`; fails if a section flag is looser than the page's own guard).

**Process lesson:** the maintainability reviewer ran its mutation sweep against this same worktree
and `git checkout`ed a file mid-review. Nothing was lost, but the tree briefly read as sabotaged.
Give a mutation-sweep reviewer its own worktree.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET. The adversarial pass is scheduled INTO the work (see above) rather
than run against the plan.
