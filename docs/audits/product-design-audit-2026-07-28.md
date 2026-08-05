---
title: Product design audit — Cellarhand
date: 2026-07-28
auditor: Senior product designer (data-dense operational software)
scope: DESIGN.md, /styleguide, navigation, shared UI components, representative screens
tenant: Demo Winery (org_demo_winery)
status: findings only — no implementation recommended yet
---

# Product design audit — Cellarhand

> **Read this first.** This is a *diagnosis*, not a plan. It separates **structural UX
> problems** (information architecture, task flow, state, error handling) from **visual
> design problems** (type, colour, spacing, component fidelity), ranks them by user impact
> × implementation leverage, and closes with **one recommended vertical slice** for redesign.
> No implementation is proposed. See [[ux-principles]] and [[DESIGN]] for the standards
> this audit grades against.

---

## 0. Method, and what I did and did not verify

**Verified by reading source:** `DESIGN.md`, `docs/architecture/ux-principles.md`,
`src/styles/tokens/*.css`, `src/app/globals.css`, `src/components/AppShell.tsx`, the full
`src/components/ui/` barrel (21 components), `src/app/styleguide/page.tsx`, and the
screen/client code for the dashboard, work orders (list, builder, execute), `/bulk`,
inventory, samples, field notes, harvest weigh-tags, sprays, compliance, accounting,
reports, settings, and users. Route inventory taken from `src/app/(app)/**/page.tsx`.

**Verified by running the app:** a headless pass over 24 representative routes at desktop
(1440×900) and phone (390×844) widths, signed in as the Demo Winery owner, with an in-page
accessibility probe (labelling, accessible names, touch-target size, heading order, table
headers, live regions, focus order). Results in §7.

**Two environment notes worth fixing regardless of this audit** (both cost real time):
- `localhost:3000` on this machine is served by a **different project** ("Savvy Labs").
  The Cellarhand dev server has to run on another port, and `BETTER_AUTH_URL` in `.env` is
  pinned to `http://localhost:3000`, so a login on any other port fails with *"Invalid
  origin"* until the variable is overridden.
- `CLAUDE.md` documents the Demo Winery QA login as `demo@demo.com / demo1234`. That is
  correct, but the seed script's default (`owner@demowinery.test / DemoWinery!2026`) is a
  *second* valid owner. Both work; the docs name only one.

**Not verified:** real-device touch behaviour, actual network conditions in a cellar,
screen-reader output (probes measure markup, not the AT experience), print/label output,
and any workflow requiring a second human (approval hand-offs). Role-specific views were
read in code but exercised only as an owner/admin session, so gated views for `user`-role
cellar and vineyard staff are code-derived, not observed.

---

## 1. Executive summary

Cellarhand is **substantially better designed than most winery software**, and the quality
is unusually uneven — not randomly, but *by age*. The newest surfaces (cellar action forms,
weigh-tag intake, compliance worksheets, `InfoHint`, `Tabs`) are genuinely excellent:
44 px targets, `inputMode="decimal"`, live computed-math readouts, `aria-pressed`,
`scope="col"/"row"`, sticky first columns, idempotency keys, undo. The oldest surfaces
(global navigation, `/bulk`'s add-row, the dashboard) are markedly weaker.

The five findings that matter most:

1. **The work-order execution screen — the single highest-frequency screen in the
   product — hides the actuals form behind an "Edit" button, and promises offline
   resilience it does not have.** A cellar hand recording what actually happened must
   click "Edit" to reach the fields, and the header says *"Offline — will retry"* when
   nothing queues or retries. (§3.1)
2. **Undo is inconsistent across identical physical acts.** The same addition recorded on
   `/bulk` gets a persistent "Logged · Undo" affordance; recorded through a work order it
   gets nothing. Users learn "this system lets me undo," then meet a screen where it
   doesn't. (§5.2)
3. **Filing a TTB report — legally irreversible, self-described as "Filed (immutable)" —
   has no confirmation step.** The product's own rule 6 requires one. (§3.5, §5.1)
4. **There is no global search, no command palette, and no breadcrumbs** across ~31 nav
   entries and 57 routes. The Assistant is currently doing the job navigation should do.
   (§5.3)
5. **78 % of interactive controls are under the 44 px touch minimum** (measured: 293 of 376
   at phone width), including the mobile menu button at 38 × 32 px. The cause is one
   component: `Button` hardcodes 34/42/50 px, so **the default size cannot pass**. (§7.2)
6. **Keyboard and screen-reader users have no way past the navigation.** No skip link and
   no `sr-only` utility exist anywhere in the codebase — a keyboard user pays **13–21 tab
   stops before page content on every navigation**; the sidebar's collapsible groups lack
   `aria-expanded`; and **0 of every route's nav links carry `aria-current`**. (§6, §7.3–7.4)

Two more that surfaced in the live pass: the cellar's primary screen (`/bulk`) **renders
entirely collapsed — no wine visible at all**, and the navigation hierarchy is **inverted
relative to usage frequency**, so every daily workflow is two clicks from the landing page
while `Help / feedback` sits third in the sidebar.

Underneath all of it: **only 1 `loading.tsx` and 0 `not-found.tsx` across 57 routes**, so
heavy screens navigate with no skeleton and a missing record dumps the user outside the app
shell with no way back.

---

## 2. Foundations assessment

### 2.1 What is genuinely strong

- **The token system is coherent and honestly warm.** `--space-*` on an 8 px base, a warm
  neutral ramp, shadows that really are `rgba(43,42,38,*)`, one accent used sparingly.
  DESIGN.md's anti-slop rules are followed in the code, not just asserted.
- **`ux-principles.md` is a real standard**, phrased as checkable rules. Most of this
  audit's structural findings are the product failing *its own* rules, which is the most
  actionable kind of finding.
- **`Tabs`** is a properly built widget: `role="tablist"`, roving tabindex,
  Arrow/Home/End, panels kept mounted so charts retain state.
- **The cellar action forms** (`src/components/cellar/forms/`) are the design high-water
  mark. `DoseForm` in particular pairs every control with an `aria-label`, keeps a live
  `aria-live` readout of `rate × volume = total`, disables submit until valid, and labels
  the button with its target (*"Add to T-12"*). That live math is the best error-prevention
  device in the product.
- **Compliance worksheets** use `scope="col"`/`scope="row"` and a sticky first column, and
  render finding severity as *text* (`Blocker:`) with the coloured glyph `aria-hidden` —
  exactly right.
- **`/compliance` is the best-designed screen in the product.** Observed: a deadline banner
  with the real due date, a form-type switch that names both the form and its unit
  (*"Operations · Form 5120.17 · gallons"* / *"Excise tax · Form 5000.24 · dollars"*), a
  status row that shows the balance identity it checked (`§A13 = §B2 ✓`), the revision state
  (`ORIGINAL`, `DRAFT`), and the blocker count in danger colour — plus the single best line
  of copy in the application: **"Nothing is ever auto-submitted."** That sentence does more
  for user trust than any control on the page. The blocker text is also *actionable*
  ("2 lot(s) need an ABV before filing … Add a reading or a tax-ABV override, then
  regenerate") rather than diagnostic.

### 2.2 Design-system governance drift (measured)

| Surface | Count |
|---|---|
| Components exported from `src/components/ui/index.ts` | **21** |
| Components named in DESIGN.md's component library | **12** |
| Components with a live preview at `/styleguide` | **9** |

DESIGN.md says "Preview them live at `/styleguide`" — but **12 of 21 components have no
preview**: `Modal`, `Tabs`, `Textarea`, `Collapsible`, `InfoHint`, `ConfirmButton`,
`LocalTime`, `ExportCsvButton`, `MapLegend`, `MapLayerControl`, `BrixChart`,
`AnalyteTrendChart`. Nine of those are also absent from DESIGN.md entirely. The practical
cost: **over half the library has no canonical reference and no visual-regression surface**,
which is how the inconsistencies in §6 got in.

### 2.3 Known drift, still open

DESIGN.md's own backlog (dated 2026-06-24) is unresolved and now has consequences:

- **`Badge tone="gold"` renders wine burgundy.** This is not cosmetic. The work-order
  execute screen renders *every* task status as `<Badge tone="gold">`, so `PENDING`,
  `IN_PROGRESS` and `REJECTED` all read as the brand accent — **status is not
  differentiated at a glance on the busiest screen in the product**. `/styleguide` labels
  the swatch "Wine" while the API says `gold`, so the reference disagrees with itself.
- **Component sizing bypasses the scale tokens.** `Button` hardcodes `fontSize: 14.5`,
  heights `34/42/50`, padding `"11px 20px"`, `letterSpacing: 0.005em`. This is the direct
  cause of the touch-target problem in §6.1: **no Button size except `lg` reaches 44 px**.

---

## 3. Workflows

Personas map to real roles: cellar/vineyard staff are role `user` (with `vineyardIds`
membership for vineyard scope); production managers and admins are `admin`/`owner`;
accounting works admin-gated surfaces (`/accounting`, `/compliance`). Below are the
workflows with the highest daily frequency or highest consequence per persona.

### 3.1 Cellar staff — execute a work order  ⚠️ **highest-impact workflow in the product**

**Goal.** "Tell me what to do on the floor today, let me record what I actually did, and
don't make me fight the phone."

**Current steps.** Sidebar → Winery → Work orders → pick a WO from the
overdue/today/upcoming/unscheduled buckets → open it → *Execute* → per task: read the
planned summary → **click "Edit"** → fill actuals → optionally note → *Complete — record
it* → repeat. Cap-management tasks get a batch shortcut when ≥2 are open.

**What is right.** A 620 px single column, `size="lg" fullWidth` primary action, `big`
field styling, `inputMode="decimal"`, per-attempt `commandId` idempotency (a double-tap is
a server no-op), purpose-built sub-forms for crush/press/bottling/weigh-in/group-rack, and
a genuine batch path for "punch down 3, 4, 5."

**Friction and ambiguity.**
- **The "Edit" mode gate.** The default state is a read-only plan summary; actuals live
  behind "Edit", exited via "Done editing". Recording actuals *is the job* — this puts the
  80 % path one click deep and names it after an edge case. When a task has no planned
  inputs the screen literally says *"No planned inputs — click Edit to record actuals."*
  Violates rule 3 (*the common path is the short path*).
- **"Complete — record it" vs "Start".** Both are `size="lg"`; `Start` is `secondary` and
  only appears while `PENDING`. It is unclear whether `Start` is required before completing
  (it is not), so it reads as a mandatory first step it isn't.
- **Status is not legible.** Per §2.3, every status badge is the same wine colour.

**Unnecessary clicks / decisions.** The Edit → fields → Done-editing round trip (2 extra
clicks per task, on every task). For a 12-task morning that is ~24 avoidable interactions.

**Error risks.**
- **The offline indicator promises something the code does not do.** The header renders
  *"Offline — will retry"*, and the file's own comment concedes it is *"not harvest-grade
  offline yet (Phase 28)"*. There is no outbox. A cellar hand who loses signal mid-task,
  trusts that label, and taps *Complete* loses the entry. This is the most damaging trust
  defect in the product: it is worse than no offline support, because it invites the
  behaviour it cannot support.
- **No undo on this screen.** `GroupMaintenanceUndo` exists for one task type. Everything
  else — including additions, the most consequential cellar write — completes with no undo
  affordance, while the *same act* on `/bulk` offers one (§5.2).
- **Errors are inert.** Failures render as a plain `<div style={{color: danger}}>`, not
  `role="alert"`, so they are not announced and are easy to miss below the fold on a phone.

**Mobile / field problems.**
- Actuals render in a hard `gridTemplateColumns: "1fr 1fr"` with no responsive collapse —
  at 390 px that is roughly 180 px per column for numeric entry with gloved or wet hands.
- No barcode/QR scanning anywhere in the product (confirmed: no `BarcodeDetector`), so a
  vessel or material is chosen from a picker rather than scanned off the tank.
- No `navigator.geolocation` anywhere, so nothing auto-scopes to where the user is standing.

**Accessibility problems.** Fields use wrapping `<label>` (correct), but the screen bypasses
the DS `Input` in favour of raw `<input style={big}>`, so it inherits none of `Input`'s
affordances; errors are not `role="alert"`; the online/offline `aria-live` region is the only
announced state.

**Recommended workflow changes** (direction, not implementation):
1. Delete the Edit gate — show actuals **pre-filled from the plan**, always editable. The
   plan becomes the default value, not a separate read-only mode.
2. Either make offline real or **tell the truth** — an honest *"No connection — don't
   record yet"* with the button disabled is strictly better than a false promise.
3. Bring the `/bulk` "Logged · Undo" affordance to this screen, so undo is a property of
   the *act*, not of the screen it was performed on.
4. Give status its own colour ramp (resolve the `gold` drift).
5. Collapse actuals to one column under ~600 px.

### 3.2 Cellar staff — record an action on a vessel (`/bulk`)

**Goal.** "Dose, rack, top, dump, or take a reading on this tank, right now."

**Current steps.** Winery → Wine in-progress → find the vessel among barrels/tanks → open
its actions → choose the action → fill → submit → "Logged · Undo".

**What is right.** This is the best-executed capture flow in the product: 44 px fields,
live math, idempotency, and a **persistent undo toast** (`role="status"`) wired to the real
correction/void path (`correctOperationAction`, `revertRackAction`, `correctBlendAction`).
`LotField` is a good piece of design judgement — it replaced a pointless "pick one of N
lots" select with a readout, because a vessel holds one cohesive liquid.

**Friction and ambiguity.**
- **The screen renders essentially empty.** Observed at 1440×900: the whole page is three
  *collapsed* accordions — `Group actions`, `Barrels (6)`, `Tanks (17)` — occupying the top
  ~25 % of the viewport with the rest blank. **The cellar's primary screen shows no wine.**
  To dose tank 12 the user must expand *Tanks* → scan 17 rows → click the vessel → open its
  actions → pick the action: four interactions before any work begins, on the screen whose
  entire purpose is acting on a vessel. Vessel counts are the only information offered.
- **Priority inversion in the header.** `Export CSV` is the most prominent control on the
  page — a button rendered *above* the wine itself. Exporting is a rare task; acting on a
  vessel is the constant one.
- **The "add wine to vessel" row is a line of unlabelled controls.** Four `<select>`s and
  three `<input>`s carry only `placeholder` and `title` — "Vintage", "Tag (opt.)", the
  volume unit. Placeholders vanish on first keystroke, so mid-entry the user cannot see
  what a field is; `title` is unavailable on touch. `required` is set with no visible
  required marker, so the first feedback is a native browser bubble.
- **No pagination or virtualisation.** The page loads *every* active vessel with all
  components and resident lots. Fine for the demo tenant; for a winery with several hundred
  barrels it is one enormous page and an unscannable list.
- **One-click destructive `remove`** on a wine component, with no confirmation, next to a
  two-step `ConfirmButton` pattern used elsewhere (§5.1).

**Mobile / field problems.** The add-row is a `flex-wrap` of fixed-width controls (88–96 px)
— it reflows into a ragged stack on a phone. Wide tables inherit the global mobile
treatment critiqued in §5.4.

**Accessibility problems.** The unlabelled add-row is the clearest violation in the app.
Positively, the vessel disclosure uses `aria-expanded` — the same attribute the *sidebar*
omits.

**Recommended changes.** Give every add-row control a visible label (the DS `Input` already
does this); mark required fields; make `remove` two-step or undoable; paginate/virtualise
and add a filter-first posture for large vessel counts.

### 3.3 Vineyard staff — file a field note

**Goal.** "Record what I saw in each block today, from the field, on my phone."

**Current steps.** Vineyards → Field notes → (multi-vineyard managers pick a vineyard) →
per-block entry → submit.

**What is right.** Blocks are the unit of entry; `BlockCard` supports **photo capture with
`capture="environment"`**, which is exactly right for field work; the form has a
`position: sticky; bottom: 0` submit bar so the primary action stays reachable while
scrolling a long block list.

**Friction, ambiguity, and a dead-end.**
- **Unassigned users hit a hard stop.** With no vineyard membership the screen says *"You
  haven't been assigned a vineyard yet. Ask an admin to assign your vineyard."* — no link,
  no request action, no path forward. This breaks rule 2 (*no dead-ends*) and sits awkwardly
  against rule 9 (*no support ticket to configure anything*). The same dead-end repeats if
  the assigned vineyard cannot be found.
- The vineyard switcher only renders for multi-vineyard managers, so the surface silently
  changes shape by role — reasonable, but it means the two variants need separate QA.

**Error risks.** Field notes are the most likely capture to happen with no signal, and — as
in §3.1 — there is no offline queue anywhere in the product.

**Recommended changes.** Convert both dead-ends into actionable states (name the admin,
offer "request access", or let an admin self-assign from the same screen). Treat this screen
as a primary Phase-28 offline candidate.

### 3.4 Vineyard / cellar — harvest weigh-tags

**Goal.** "Weigh incoming fruit at the pad and get it into a lot without a clipboard."

**What is right.** Genuinely well built: labelled DS `Input`s, `inputMode="decimal"`,
`tabular-nums`, **net auto-derived from gross − tare with an "auto (gross − tare)" hint**,
multi-bin entry, 44 px controls, `aria-label` on per-bin remove. This is the pattern the
rest of the product should copy.

**Friction.** Nav-gated behind the custom-crush program flag, so estate-fruit wineries may
not find it. No scanning (no barcode) for bin or tag IDs — the highest-value place in the
product for a scanner.

### 3.5 Accounting / admin — file a TTB report  ⚠️ **highest-consequence workflow**

**Goal.** "Generate the period's return from the ledger, satisfy the checks, file it, keep
an auditable trail."

**Current steps.** TTB compliance → pick period/cadence → *Generate report* → review the
balance banner and the *Checks* panel → fix or *Save & regenerate* → **File** → optionally
*Amend (new version)*.

**What is right.** Blockers are computed and gate the action (`canFile` requires
`status === "DRAFT" && balanced && no blockers`); findings carry a text severity prefix and
a `§section line` jump reference; sticky-first-column worksheets; amendment is modelled as a
new version rather than a mutation.

**Friction and ambiguity.**
- **No confirmation on an irreversible, legally-significant action.** *File* is a plain
  primary `Button` that immediately calls `fileComplianceReport`, after which the UI reads
  *"Filed (immutable)"*. `ux-principles.md` rule 6 explicitly requires a confirm for
  "destructive/irreversible **or compliance-filing** actions." This is the product breaking
  its own most safety-critical rule.
- **The reason *File* is disabled hides in a `title` tooltip** (`"Resolve blockers first"`).
  Disabled-button-plus-tooltip is unreachable on touch and unreliable for AT — the user sees
  a dead button with no stated reason.
- Success is a small inline *"Report filed."* string — very quiet for a legal filing.
- **The blocker names a count, not the records.** Observed: *"2 lot(s) need an ABV before
  filing"* — with no link to those two lots. The findings model supports a
  `§section line` jump reference, but this blocker carries none, so the accountant has to go
  hunting for the very records that are blocking the filing.
- **The period is entered as two loose fields** (`Year` = 2026, `Month` = 7) rather than a
  period picker. A bare "7" is easy to mistype and easy to misread, on an artefact whose
  period is legally load-bearing. The `Month` label also sits off the baseline shared by
  `Year` and `Cadence`.
- Three of this screen's controls have no programmatic label (two tax-class selects and the
  Part X remarks textarea) — see §7.5.

**Error risks.** The gap between "irreversible" and "one click, no confirm" is the single
largest consequence-weighted risk in the audit, even though its frequency is low.

**Recommended changes.** A real confirmation that restates period, form type and totals;
move the blocker reason out of `title` into visible text next to the button; make the filed
state a prominent, dated receipt with a link to the filed artefact.

### 3.6 Production manager — plan and approve work

**Goal.** "Turn this week's intentions into assigned, sequenced work, then check what came
back."

**Current steps.** Work orders (buckets: overdue / today / upcoming / unscheduled, plus
pending approval) → New (or from a template) → builder → assign lead/assignee → due → save
→ later: `/work-orders/review` to approve or reject.

**What is right.** The bucket model matches how a manager actually triages; archive is the
same route (`?view=archive`) rather than a second nav item — a good IA decision; templates
and task-types are first-class; `WorkOrderReadinessPanel` surfaces blockers pre-release.

**Friction and ambiguity.**
- **Filter chrome outweighs the work.** Observed at 1440×900: seven filter controls
  (status, from, to, template, location, assignee, search) *plus* an inline scrolling vessel
  multi-select occupy roughly 450 px — more than half the viewport — **above** the list, and
  they render in full even when there are zero open work orders. Filters also require a
  manual `Apply filters`, so a user who changes one and looks at the list sees stale results;
  the `0 results` counter sits beside the button in muted grey.
- **Credit where due: the empty state is excellent.** *"No open work orders — everything here
  is caught up. Finalized orders move to the Archive — start a new one when there's work to
  assign,"* with `New work order` and `View archive` as the two next steps. This is exactly
  rule 2 (*no dead-ends*) done right, and it is the model the field-notes dead-end (§3.3)
  should follow.
- **The builder is the product's heaviest screen** (`WorkOrderBuilderClient` 755 lines +
  `NewWorkOrderClient` 472). Two separate creation clients is itself an ambiguity — which
  one a manager lands in depends on the entry point.
- **Several manager-critical routes are not in navigation at all:**
  `/work-orders/review`, `/work-orders/templates`, `/work-orders/task-types`,
  `/blend/trials`, `/finished-goods`, `/bottled`, `/setup/equipment`,
  `/vineyards/planting-setup`, `/vineyards/sprays/products`,
  `/vineyards/sprays/planned-harvest`, `/inbox` (reachable only via the avatar). Pending
  approvals are visible as a count on the work-orders page, but the review queue has no
  nav entry — a manager has to know it exists.

**Mobile / field problems** (observed at 390 × 844 — materially worse than desktop):
- **The filter panel fills the entire phone viewport.** Brand bar → title row → Open/Archive
  → filters, with `Apply filters` and `0 results` at the very bottom edge. **A manager cannot
  see a single work order without scrolling past roughly 600 px of filter controls** — on the
  screen whose purpose is triage.
- **The page title collides with its actions.** The header is a flex row that does not stack,
  so `Work orders` wraps to two lines and is squeezed to ~90 px beside `Templates` and
  `New work order`.
- **The vessel scope chips overflow and clip** — `Barrels` renders as "Barr" at the right edge.
- **The assistant `Ask` FAB overlaps the panel's own footer**, partially covering the
  `0 results` counter, despite `AppShell` reserving bottom padding for it.

**Recommended changes.** Decide which of those 11 orphaned routes are real destinations and
give them a home (sub-navigation within their section, not 11 more sidebar rows); unify the
two creation clients; surface the approval queue as a first-class destination; collapse
filters behind a control on mobile and let them apply live; stack the title row.

### 3.7 Administrator — configure the winery

**Goal.** "Set the winery up and keep reference data correct."

**Current steps.** Setup → Vessels / Locations / Varieties & vineyards / Vendors / Growers /
Clients / Settings / Users.

**Friction and ambiguity.**
- **`/settings` is a single 506-line client covering ~16 unrelated concerns** — sparkling
  program, custom crush, QBO connection and mappings, A/P, A/P payment, Commerce7, voice,
  knowledge sources, cost model, time zone, unit preferences, and the full TTB compliance
  profile (EIN, registry number, operating address, cadences, EFT) — under 6 headings.
  The TTB identity block in particular is a *compliance* concern living in a general
  settings page.
- **Setup is not admin-gated.** `Vessels`, `Locations`, `Varieties & vineyards` and
  `Vendors` carry no `admin: true`, so every cellar and vineyard user sees a "Setup"
  section with four configuration surfaces. `Audit log` is likewise ungated. That may be
  deliberate transparency, but as presented it reads as "everyone is an administrator."

**Recommended changes.** Split settings by domain and move the compliance profile next to
compliance; decide deliberately which reference data is floor-editable and gate the rest.

### 3.8 Accounting — reconcile and export

**Goal.** "Tie DTC and production into the books, and get numbers out."

**What is right.** `/accounting` is well organised — Connection, Sync queue, *Needs a look*,
then Commerce7 DTC with a real margin table. `/reports` puts an `ExportCsvButton` beside
every table, satisfying rule 10 (*exports never fail silently*) by construction.

**Friction.** `/reports` is three fixed tables with no date range, no filtering and no
grouping controls — an accountant's question ("this month, this SKU, this channel") cannot be
asked in the UI, only in the exported CSV. Volume unit labels come from tenant preferences,
but CSV column headers are hardcoded `(L)` — a unit mismatch between screen and export.

---

## 4. Structural UX problems, ranked

| # | Problem | Impact | Leverage | Evidence |
|---|---|---|---|---|
| S1 | **False offline promise** on the execute screen invites data loss | Critical | High — a label change buys honesty immediately | `ExecuteClient.tsx:326` vs comment at `:30` |
| S2 | **Irreversible TTB filing with no confirmation** | Critical (low frequency) | High — one dialog | `ComplianceClient.tsx:284` |
| S3 | **Undo exists per-screen, not per-act** — same action, different safety | High | High — the mechanism already exists in `/bulk` | `CellarActions.tsx:135–194` vs `ExecuteClient` |
| S4 | **"Edit" mode gate** puts the 80 % path one click deep, on every task | High | High — remove a mode | `ExecuteClient.tsx:176–208` |
| S5 | **No global search / command palette / breadcrumbs** across 57 routes | High | Medium | no `cmdk`/`CommandPalette`/`Breadcrumb` in `src/` |
| S6 | **11 routes orphaned from navigation**, incl. the approval queue | High | High — IA decision, little code | route inventory vs `AppShell` `MAIN/WINERY/VINEYARDS/SETUP` |
| S7 | **1 `loading.tsx`, 2 `Suspense`, 0 `not-found.tsx` across 57 routes** — heavy screens navigate blank; a missing record lands outside the shell | High | Medium | `find src/app` |
| S8 | **Destructive-action pattern is not systematic** — `ConfirmButton` in 12 files, one-click destructive verbs in ~11 others | Medium-High | Medium | grep |
| S9 | **`/bulk` unbounded** — every vessel, component and lot, unpaginated | Medium (grows with tenant size) | Medium | `bulk/page.tsx` |
| S10 | **`/settings` monolith**, incl. compliance identity in general settings | Medium | Medium | `SettingsClient.tsx` (506 lines) |
| S11 | **Dead-end empty states** ("ask an admin") with no action | Medium | High — copy + one link | `field-notes/page.tsx:145–190` |
| S12 | **Setup and Audit log ungated** — config surfaces exposed to all users | Medium | High — nav flags | `AppShell.tsx:49–61` |
| S13 | **`/reports` has no filters or date range**; CSV headers hardcode `(L)` while the UI honours unit prefs | Medium | Medium | `reports/page.tsx` |
| S14 | **Two work-order creation clients**; entry point decides which | Low-Medium | Medium | `work-orders/new/` |
| S15 | **`/bulk` renders collapsed** — the cellar's primary screen shows no wine, and `Export CSV` is its most prominent control | High | High — a default-state decision | observed, §3.2 |
| S16 | **Nav hierarchy is inverted relative to frequency** — `Help / feedback`, `Audit log`, `Accounting` sit top-level while `WINERY` and `VINEYARDS` are collapsed, so *every* daily workflow is 2 clicks from the landing page | High | High — reordering + default-open | `AppShell.tsx:17–47`, observed |
| S17 | **Dashboard leaks internal vocabulary** (slug block ids, `(v3, was …)` version notation, raw actor emails) and **its only table has no headers** — on the screen every user lands on | Medium-High | High | §7.6, §7.9 |
| S18 | **Filter chrome outweighs content on `/work-orders`** — 7 filters + an inline scrolling vessel picker (~450 px) above the list, rendered in full even at 0 results; filters need a manual `Apply` | Medium-High | Medium | observed, §3.6 |
| S19 | **Dashboard omits the operational counts it already computes.** `pendingWorkOrders`, `pendingSamples` and `complianceDeadlines` are fetched for the sidebar badges but the dashboard shows only stock aggregates — it answers "how much wine exists", not "what needs me today" | Medium-High | High — the data is already in hand | `AppShell` props vs `(app)/page.tsx` |

---

## 5. Cross-cutting structural themes

### 5.1 Confirmation is inconsistent with reversibility
The product has a good two-step `ConfirmButton`, but it is applied by habit rather than by
risk. A *reversible* component removal on `/bulk` is one click; an *irreversible* TTB filing
is one click; a draft-row removal is two. The pattern should key off reversibility, not
authorship. `ConfirmButton` itself has two design problems: it **auto-disarms after 4 s**
(a WCAG 2.2.1 timing concern, and a real trap — the layout shifts when armed and shifts back
on disarm, so a delayed click can land on whatever moved into that space), and it never
names its object (default label is a bare "Delete").

### 5.2 Undo is a property of screens, not of actions
`/bulk` wires every operation to a real reversal path and shows a persistent
`role="status"` "Logged · Undo". The execute screen — same additions, same rackings, same
ledger — offers undo for exactly one task type. Rule 4 says the UI should *make "you can
undo this" obvious*; today it makes it obvious in one place and absent in another, which is
worse than uniformly absent because it teaches a false expectation. (The Undo button is also
`minHeight: 36`, under the touch minimum.)

### 5.3 The Assistant is compensating for missing navigation
With ~31 sidebar entries, no search, no breadcrumbs, and 11 orphaned routes, the natural way
to reach a specific lot or vessel is to ask the Assistant. That is a legitimate strength, but
it means **the assistant is load-bearing for basic findability** — a keyboard user, a
screen-reader user, or anyone whose question is "where is X" has no deterministic path.

### 5.4 The mobile table strategy defeats data-dense tables
`globals.css` applies to every table under `.app-main` on ≤767 px:
`display: block; overflow-x: auto; white-space: nowrap`. Three consequences:
`display: block` on a `<table>` **drops its row/column semantics for assistive tech**;
`white-space: nowrap` forces every cell to one line, maximising horizontal scroll; and with
**no sticky first column** (the compliance worksheets add their own, no other table does),
scrolling right loses the row's identity — you can no longer see *which* vessel or lot the
figures belong to. For an operational tool used on phones this is the highest-leverage
mobile fix in the product.

### 5.5 Feedback after action is ad-hoc
There is **no app-wide toast or notification system** (every "toast" match in the codebase
is barrel *toast level*). Success and error reporting is re-implemented per screen across
~69 sites, with live-region coverage of 29 `aria-live` / 12 `role="alert"` / 12
`role="status"` — real but partial. Identical outcomes are announced differently, or not at
all, depending on where they happen.

---

## 6. Visual design problems, ranked

| # | Problem | Impact | Leverage |
|---|---|---|---|
| V1 | **Touch targets below 44 px — measured at 78 % of all in-page controls** (293/376 at 390 px). `Button` sm/md are 34/42 px, so the default size cannot pass; the `☰` mobile menu is 38×32; scope chips are 24 px. Cellar forms comply only by hand-setting `minHeight: 44` *because the component does not* | High (field use) | High — fix the component, not the call sites |
| V2 | **`Badge tone="gold"` renders wine**, collapsing task-status differentiation on the busiest screen; `/styleguide` calls the same swatch "Wine" | High | High — rename + a status ramp |
| V3 | **12 of 21 components have no `/styleguide` preview; 9 undocumented in DESIGN.md** — no reference, no visual-regression surface | High (compounding) | High |
| V4 | **`Button` has no focus-visible styling**, and there is **no global `:focus-visible` rule** — the only focus rings in `globals.css` are for Leaflet controls. Focus falls back to the UA default, which is a blue ring in a warm-paper system | Medium-High | High — one global rule |
| V5 | **Component sizing bypasses the scale tokens** (`fontSize: 14.5`, `"11px 20px"`, `0.005em`), so the type/space scale is not single-source | Medium | Medium |
| V6 | **Screens bypass the DS.** The execute screen and `/bulk`'s add-row use raw `<input style={big}>` / `selectStyle` instead of `Input`, so labelling, hint/error slots and sizing diverge from the system | Medium | Medium |
| V7 | **Google Fonts loaded by CSS `@import`** at the top of `globals.css` — a blocking, render-delaying third-party request; on poor cellar wifi the whole type system falls back | Medium | Medium |
| V8 | **No global `prefers-reduced-motion`** rule; honoured in 4 components individually | Low-Medium | High |
| V9 | **Dashboard is decorative rather than operational** — four aggregate metrics and an audit feed. It answers "how much wine exists", not "what needs me today", and it is the app's landing page for every role | Medium | Medium |
| V10 | **Unused palette tokens** (`--lavender`, `--orange`, `--bright-mauve`) still defined; DESIGN.md flags them and they remain | Low | High |
| V11 | **`h1` size is hand-set per page and inconsistent** — 40 px (dashboard), 36 px (`/bulk`, `/compliance`, `/accounting`), 32 px (`/vineyards/field-notes`), 22 px (execute). DESIGN.md specifies h1 = 40 | Medium | High — one page-header component |
| V12 | **The page-header pattern is not consistent** — dashboard and `/bulk` use eyebrow + h1 + description; `/work-orders` has a bare h1 with no eyebrow. Same product, two templates | Medium | High |
| V13 | **`Button variant="link"` misaligns in a flex row.** It sets `height: "auto"` and `padding: 0`, so beside 42 px siblings it floats off the shared baseline — visible in `/styleguide`'s own button row. It is also near-indistinguishable from `ghost` (both wine text, no border) until hover | Medium | Medium |
| V14 | **Disabled primary reads as a variant, not a state.** `opacity: 0.45` over cream renders as a muted mauve button that looks deliberate rather than unavailable; contrast of the white label drops well below comfortable | Medium | Medium |
| V15 | **Native date inputs sit beside DS fields** (`/work-orders` From/To) with different height, internal metrics and a UA calendar glyph — a visible seam in every filter row | Low-Medium | Medium |
| V16 | **Sidebar cramps when a group is expanded.** At ~900 px viewport height with `WINERY` open, the last item (`Calculator`) is clipped and the user footer/"Sign out" crowds it | Low-Medium | Medium |
| V17 | **Unresolved pluralisation in user-facing copy** — `"1 blocker(s) before filing"` on the compliance screen | Low | High |
| V18 | **Page-title rows do not stack on mobile.** `/work-orders` wraps its h1 to two lines and squeezes it to ~90 px beside its two action buttons | Medium | High |
| V19 | **Horizontal clipping in chip rows** — the `Barrels` scope chip renders as "Barr" at 390 px | Low-Medium | High |
| V20 | **The assistant `Ask` FAB overlaps page content** (the `0 results` counter on `/work-orders`) despite `AppShell` reserving bottom padding for it | Low-Medium | Medium |

**Note on V1/V4/V6:** these are visual-*system* problems with structural consequences. They
are listed here because the fix is in the component layer, but their cost is felt as usability
on the floor.

---

## 7. Instrumented findings (running app, Demo Winery)

24 routes, two viewports, signed in as the Demo Winery owner.

### 7.1 Health — good news first
- **24/24 routes returned HTTP 200. No redirects. Zero JavaScript page errors anywhere.**
  The application is stable; nothing in this audit is about brokenness.
- **Exactly one `<h1>` per route** — heading structure starts correctly everywhere.
- **No control anywhere lacks an accessible name** (0 nameless buttons/links across all 48
  page loads). Whatever else is wrong, nothing is an unlabelled icon button.

### 7.2 Touch targets — the headline measurement

At 390 × 844, counting only in-page controls (the sidebar is behind the drawer):

> **293 of 376 interactive controls — 78 % — measure under 44 px tall.**

Worst offenders by proportion: field notes 41/42 (98 %), inventory 32/33 (97 %), new work
order 31/32 (97 %), bottling 21/22 (95 %), settings 21/22 (95 %), work orders 15/16 (94 %),
users 12/13 (92 %).

Concrete measurements, all from `/work-orders` at phone width:

| Control | Measured | Note |
|---|---|---|
| `☰` mobile menu button | **38 × 32 px** | the single most important control on mobile |
| Vessel-scope chips `All` / `Tanks` / `Barrels` | **24 px tall** | roughly half the minimum |
| `Open` / `Archive` view toggle | **36 px** | |
| `Apply filters` (Button `sm`) | **34 px** | |
| `New work order`, `Templates` (Button `md`) | **42 px** | 2 px short — the default size cannot pass |

This is the measured consequence of V1/V5: because `Button` hardcodes 34/42/50 px, **no
default-size button in the product reaches 44 px**, and the newer cellar forms only comply
because they hand-set `minHeight: 44` themselves.

### 7.3 Keyboard cost of the missing skip link

Desktop tab stops before reaching page content, per route: **13–21**. (`/work-orders`,
`/bulk`, `/lots`, `/bottling`, `/blend`, `/samples` and others all sit at 21.) A keyboard or
screen-reader user pays that on **every navigation**, and there is no skip link on any of the
24 routes to avoid it. At phone width the cost drops to 1 stop, so this is specifically a
desktop-keyboard problem.

### 7.4 Active navigation state is never programmatic

Across all 24 routes: **0 of 8–16 navigation links carry `aria-current`.** The active item is
a solid wine pill — visually unambiguous, programmatically invisible. The sidebar's
`WINERY` / `VINEYARDS` / `SETUP` disclosure buttons also carry no `aria-expanded`, while
`/bulk`'s own vessel disclosures do — the same attribute, applied in the newer surface and
omitted in the older one.

### 7.5 Visual labels that are not programmatically associated

Not missing labels — *unassociated* ones. Text sits next to the control but there is no
`<label for>`, `aria-label` or `aria-labelledby`, so the accessible name is whatever the
option list happens to say:

| Route | Controls affected |
|---|---|
| `/ferment/process` (De-stem & press) | 3 selects — vineyard/block, barrel, destination must lot — plus 4 placeholder-only text inputs |
| `/compliance` | 2 tax-class selects + the Part X remarks `<textarea>` |
| `/inventory` | "Choose item" and "Location" selects; `qty` and `reason` inputs placeholder-only |
| `/audit` | entity-type select; actor input placeholder-only |

`/ferment/process` is the concerning one: **De-stem & press is a core harvest-season cellar
workflow, and its three principal selects have no programmatic label.**

Note on `/bulk`: its unlabelled add-row (§3.2) reported 0 fields here because the accordions
are collapsed by default, so the row never rendered. The finding stands on source reading;
the live pass simply could not reach it — which is itself a comment on §3.2.

### 7.6 Table semantics

Every table in the app carries proper headers **except one**: the **dashboard's "Recent
activity" table has no `<th>` and no `<caption>`** — it is a bare `<tbody>` of rows. It is the
first table a user meets, on the landing page.

### 7.7 Heading-order breaks

Two routes skip a level: `/vineyards/harvest` (h1 → h3, "Block 1") and
`/vineyards/sprays/new` (h1 → h3, "Header"). The literal heading text *"Header"* on the spray
form is also engineering vocabulary surfaced as user-facing copy.

### 7.8 Form density

Field counts on a single screen: **`/users` 117, `/settings` 82, `/vineyards/sprays/new` 59,
`/blend` 38, `/work-orders` 31.** The `/settings` figure is the measured form of the monolith
in §3.7; `/users` at 117 fields suggests a full editable row per user with no
progressive disclosure.

### 7.9 Domain language on the landing page

The dashboard's activity feed renders raw audit-log prose, verbatim, to what DESIGN.md calls
a leadership surface. Observed rows:

```
Planned harvest for block qa-spray-blk-1785168175883-1 / 2026 / main set to 2026-10-05 (v3, was 2026-09-30).
Retracted planned harvest 2026-08-25 for block qa-spray-blk-1785168175883-1 / 2026 / sparkling.
```

Three separate leaks, independent of the QA fixture naming: internal slug-style block
identifiers rather than block labels, engineering **version notation** (`(v3, was …)`), and
**raw actor email addresses** as the actor column. `ux-principles.md` rule 5 (*speak the
winery's language*) is broken on the first screen every user sees.

---

## 8. Recommended vertical slice for redesign

### The slice: **the cellar-floor task loop — work order → Execute → recorded**

Concretely: `/work-orders` (triage) → `/work-orders/[id]` (brief) →
`/work-orders/[id]/execute` (capture) → the recorded/undo state.

**Why this slice, over the alternatives**

- **Highest frequency × largest population.** Cellar staff are the biggest user group and
  this is the screen they touch many times a day, every day of harvest. Nothing else in the
  product has this exposure.
- **It is where the systemic problems intersect.** One slice contains S1 (false offline),
  S3 (undo asymmetry), S4 (the Edit gate), S7 (no loading states), V1 (touch targets),
  V2 (status colour) and V6 (DS bypass). Fixing it forces resolution of the cross-cutting
  themes rather than a local polish.
- **The bones are already right, so this is refinement, not invention.** The 620 px column,
  the large primary action, `inputMode="decimal"`, idempotency keys and the batch shortcut
  are all sound. The redesign is mostly *removing* a mode, *telling the truth* about
  connectivity, and *promoting* patterns that already exist elsewhere in the codebase.
- **Maximum pattern spillover.** The artefacts it produces — a task/capture card, a
  plan-as-default-value actuals form, an act-level undo affordance, an honest connectivity
  state, a status colour ramp, a mobile-first dense-data treatment — are exactly what
  `/bulk`, field notes, weigh-tags, samples and the spray form need next. No other slice
  generates as much reusable design.

**Why not the alternatives**
- ***The `/bulk` vessel board is the genuine runner-up***, and it is close. It is the cellar's
  browsing home, it renders empty by default (S15), and fixing it would force the
  dense-data-on-mobile pattern that §5.4 identifies as the highest-leverage mobile fix. It
  loses on two counts: its own capture layer is *already* the best in the product (undo, live
  math, 44 px targets), so the work is mostly list IA rather than end-to-end flow; and it does
  not contain the two safety defects (S1, S3) that make the execute path urgent. **The right
  sequencing is Execute first, `/bulk` immediately after** — the patterns transfer directly.
- *TTB filing* is the highest-consequence workflow, but low frequency and admin-only; its
  main defect (S2) is a single confirmation dialog, not a redesign. It is a fix, not a slice.
- *The work-order builder* is the heaviest screen, but it is a manager's occasional
  authoring task, and its problems are mostly scope/IA, which the slice above will inform.
- *The dashboard* is weak (V9, S17, S19) and cheap to improve, but re-designing a landing
  page before knowing what the floor loop needs would be backwards. Its fix is downstream of
  this slice: once the execute path defines "what needs me today," the dashboard has
  something true to show.

**Success criteria to agree before any design work**
1. Tasks recorded per session with zero mode-switching clicks.
2. No user-visible claim about connectivity that the system cannot honour.
3. Undo available for every ledger-affecting act, from the screen where it happened.
4. Every interactive target ≥44 px, verified at 390 px width.
5. Task status distinguishable at a glance without reading text.

---

## 9. Appendix — open questions for the product owner

1. **Is `Setup` (vessels, locations, varieties, vendors) and `Audit log` intentionally
   visible to every user**, or should they be admin-gated?
2. **Which of the 11 orphaned routes are real destinations** vs. deep links reached from
   context? That decision, not more sidebar rows, is the fix.
3. **How much of the floor is genuinely offline?** The answer decides whether S1 is a copy
   change or the trigger for Phase 28.
4. **Should the Assistant remain the primary findability mechanism**, or is a global search
   a first-class requirement?
5. **Does `Badge tone="gold"` get renamed to `wine`** (DESIGN.md's own candidate), and does
   task status get its own semantic ramp?
