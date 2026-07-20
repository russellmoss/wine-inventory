# TODOS

Deferred work captured during planning/review. Each item has enough context to pick up cold.

## Per-tenant user role/state (role & banned on `Member`, not global `User`)

**What:** Today `User.role` (`user`/`admin`/`developer`) and `User.banned` are GLOBAL flags. In a true
multi-org world a user could be an admin in winery A and a plain user in winery B, or banned by A but
active in B — impossible to express on the global `User` row. The clean model is to move tenant-specific
role/state onto the `Member` join (Better Auth's org plugin already carries a per-`Member` `role`) and
have `resolveTenantId`/access checks read the membership for the active org.

**Why (raised in the #90 council review, Gemini):** the #90 fix scopes *who an admin can see/act on* to
their org, but the *attributes being mutated* (`role`/`banned`/password) still live on the shared `User`
record. It's safe **today** only because (a) `createUser` now binds each non-developer to exactly one
org, so regular users are single-tenant, and (b) the only multi-org accounts are developers, who are
`canManageDeveloperTarget`-gated against plain admins. The moment a non-developer legitimately belongs
to two orgs (e.g. a real cross-winery invitation flow), a global role/ban mutation by one org's admin
leaks into the other. Also flagged: `createUser`'s global-email uniqueness check reveals that an email
exists in another tenant (minor admin-only enumeration) — an invitation flow would resolve both.

**Scope / cons:** Non-trivial — touches `auth.ts` session hook, `dal.ts` `toAppUser`/`resolveActiveOrg`,
`access.ts`, every `requireAdmin`/`adminAction` gate, and a data migration to seed `Member.role` from
`User.role`. Do this as its own plan alongside (or before) building the end-user invitation/multi-org
switcher (ROADMAP Phase 21a), not as a hotfix.

**Context:** Deferred during the #90 security fix (cross-tenant user-management leak), 2026-07-13. The
hotfix itself (app-layer membership scoping) shipped; this is the model-level follow-up. See
[[security-register#User management is app-layer tenant-isolated]].

## Introduce a server-action / DB integration test harness

**What:** Stand up a Vitest integration setup (test database + helpers) so server
actions and Prisma-backed flows can be tested automatically, not just manually.

**Why:** As of the Vineyard Details work (plan
`docs/plans/2026-06-24-005-feat-vineyard-details-blocks-plan.md`), the riskiest paths
(server actions, audit writes, map polygon persistence) have only manual QA. The project
currently has zero action/DB/component tests — `vitest.config.ts` runs in the `node`
environment and existing tests in `test/**/*.test.ts` cover only pure functions
(`audit.test.ts`, `inventory-csv.test.ts`, etc.). Pure logic for the vineyard feature
(units, colors, serializer) IS unit-tested, but the IO layer is not.

**Pros:** Automated coverage of the highest-blast-radius code; catches audit/serialization
regressions; lets future features ship with confidence instead of manual click-throughs.

**Cons:** Non-trivial setup — needs a disposable Postgres (e.g. a Neon branch or local
container), migration application in CI, transaction rollback/cleanup between tests, and a
jsdom env if component tests are added. It's its own mini-project, not a quick add.

**Context:** Decision made during `/plan-eng-review` of the vineyard plan (2026-06-24):
ship pure-logic tests + manual QA now, defer the harness. Start by deciding the test-DB
strategy (Neon branch per CI run vs local docker Postgres), then add a `vitest` project
config for integration tests separate from the existing pure-unit tests.

**Depends on / blocked by:** None. Best tackled before the next DB-heavy feature, or
alongside PR3 (interactive drawing) of the vineyard plan if action confidence is wanted.

## Accessible (keyboard) alternative for polygon drawing

**What:** Provide a non-pointer way to define a block polygon, e.g. manual lat/lng
vertex entry or import, since Leaflet-Geoman drawing is mouse/touch only.

**Why:** Surfaced in `/plan-design-review` of the vineyard plan (2026-06-24). The map
drawing flow (PR3) is pointer-driven; a keyboard-only or screen-reader user cannot draw
a block boundary. The rest of the feature (blocks, acreage, metadata, summary) is fully
accessible — only the drawing is not.

**Pros:** Closes the one real a11y gap in the feature; also useful for users who have
survey coordinates and want exact boundaries.

**Cons:** A coordinate-entry UI is fiddly; most users will prefer drawing. Lower priority
than shipping the core feature.

**Context:** Drawing is inherently visual; the accessible fallback is to type/paste vertex
coordinates that render as a polygon (reusing the same `saveBlockPolygon` validation).
Decision at design review: accept the limitation for now, capture here.

**Depends on / blocked by:** PR3 (interactive drawing) of the vineyard plan.

## Multi-tenancy isolation foundation (do BEFORE design-partner winery #2)

**What:** Lay the tenant boundary: an `Organization` (winery) tenant, `tenantId` on every
domain row, **Postgres Row-Level Security** enforcing isolation in the DB, per-tenant
uniqueness, and tenant threading through the ledger chokepoint + projections + RBAC. Full
detail in ROADMAP **Phase 12** and VISION **D16**.

**Why:** The product is a multi-tenant SaaS (see `STRATEGY.md`), and the beachhead
milestone ("3–5 Northeast wineries live") is multi-tenant by definition. Multi-tenancy is
the one thing that gets *harder* to add with every phase and every row, and a cross-tenant
data leak is the worst possible B2B bug. This is a foundation, not a finale — it should
land before a second winery's data ever coexists in the database.

**Pros:** Unblocks design partners; enforces isolation at the DB layer so an app bug can't
leak across wineries; cheapest possible time to do the per-tenant-uniqueness retrofit.

**Cons:** Adds a small `tenantId`-threading tax to every feature built afterward; RLS +
SERIALIZABLE ledger writes + the Prisma singleton need care; a data migration to backfill
`tenantId` onto existing Bhutan data and recreate unique indexes per-tenant.

**Context:** Landmine to fix early — current uniqueness is **global** (lot codes,
`WineSku`, vessel codes) and must become **per-tenant**. Open model decision: pooled+RLS
vs schema-per-tenant vs Neon project/branch-per-tenant (pooled+RLS is the boring default).
**This phase gets the full review gate: `/council` + `/plan-eng-review` are required
(cross-tenant-leak blast radius); `/plan-design-review` covers the later ops-layer UI.**

**Depends on / blocked by:** None technically; sequence it before onboarding external
design partners. Best done at a stable point in the current in-flight phase, not deferred.

## SaaS operational layer (deferred — after the isolation foundation)

**What:** Org signup/provisioning, user invitations, per-tenant config + **branding/theming**
(app is currently hardcoded "Bhutan Wine Company"), billing, and a tenant-admin surface.

**Why:** Needed to onboard real *paying* wineries self-serve, but not required for the
isolation foundation or the first hand-held design partners.

**Pros:** Turns the platform into a sellable self-serve SaaS; per-tenant branding makes it
feel like each winery's own tool.

**Cons:** Real product surface (auth flows, billing integration, admin UX) — build it when
onboarding demand is real, not up front.

**Context:** The second slice of ROADMAP Phase 12. Needs a genuine `/plan-design-review`
(signup, tenant admin, org switcher, theming). Billing provider + plan model are open
decisions. Per-tenant branding builds on the existing token system (DESIGN.md) — values
become tenant-configurable, tokens stay.

**Depends on / blocked by:** The multi-tenancy isolation foundation above.

## [plan-042 PR-B] Wire dirty-form guard to real forms
The assistant global dock can auto-navigate ("take me to X") after a 3s countdown.
`pageHasUnsavedChanges()` (src/app/(app)/assistant/AssistantChat.tsx) checks for a
`[data-unsaved="true"]` attribute, but no form sets it yet — so the downgrade-to-link
protection is inert; only the countdown+Cancel protects a mid-edit user. Wire the
high-risk forms (field-report editor, template spec builder, inventory-adjust) to set
`data-unsaved="true"` while dirty. Source: /review of plan-042 PR-A.

## Plan 081 follow-ups — assistant Draft Card residuals

Deferred out of NOW.md during the 2026-07-20 spine compaction. Plan 081 shipped
(PRs #354/#355); these are the measured, honest gaps it did NOT close.

**(a) `brix-write` still 5/10.** The Draft Card fixed the WORK-ORDER path; it did not
generalise to other write families. `log_brix` emits no tool call about half the time.
This is the largest remaining piece of Mike's original "it says there's a card but there
isn't" complaint. NOTE: PR #380 later took `log_brix` to 10/10 via a tool-description
prepend, and PR #387 established that the stronger lever is the system prompt, not the
description — re-measure before assuming this is still 5/10.

**(b) Draft rendering unproven in a live browser.** All 14 shipping trials returned
`ready` (Mike resolves cleanly in Demo, so nothing was ever missing). The Draft path is
unit-tested and DB-proven (`needs_input`, 0 signed builds, `committable:false`) but
nobody has watched Confirm sit greyed out on screen. Needs the interactive logged-in pane.

**(c) `wo-vague-target` knownGap is probably an eval artifact, not a product bug.** Live,
that utterance DOES card — it routes to `issue_operation_wo`, while the eval case asserts
`propose_work_order`. Fix the case's expected tool before the nightly starts mailing false
failures. Second time this eval's fixtures rather than the product produced a misleading
signal.

**(d) Absent assignee ≠ wrong assignee.** Requesting a WO for a nonexistent person
correctly avoids fabricating an email, but returns a READY card that is silently
unassigned. The over-claim guard catches a wrong email, not a missing one.

**(e) `canonicalizeRawIntents` throws instead of drafting.** In `nl-proposal.ts` it still
THROWS for a task missing a required vessel, *before* a proposal object exists, so those
utterances stay prose. Sole cause of (c) above.

**(f) must-on-skins readiness rule — not built.** Nothing in the codebase detects that a
must on skins cannot be racked (it clogs a positive-displacement pump); the model knew it,
the engine does not. Wants the winemaker's call on `blocking` vs `confirmable`, and whether
TOPPING/BARREL_DOWN are covered.

**(g) In-place Draft resolution.** Type the missing email on the card and re-drive
id-pinned via the resume-token path. Today the user answers in chat. The route already
carries the `draft` flag, so this is a UI increment, not new architecture.

**(h) `verify:work-orders-transform` red** on the plan-059 bottling guard — its fixture
needs a label. Chip filed.

## NRCS SSURGO soil composition per vineyard block

**What:** Russell asked (office-hours, 2026-07-20) whether soil maps could be pulled in so a
drawn block reports "30% soil A / 20% B / 50% C".

**Answer:** yes. It is **NRCS, not USGS**. The API is Soil Data Access
(`sdmdataaccess.nrcs.usda.gov/Tabular/post.rest`), free and keyless, and
`VineyardBlock.polygon` already holds the GeoJSON input. No PostGIS needed.

**Key design call:** do **NOT** area-weight properties into block-level numbers. pH is
logarithmic, drainage class is categorical, and averaging restrictive depth is actively
dangerous. The use case is documentation, so roll up area percentage only and keep each map
unit's properties intact.

**BLOCKED on a ~20-minute curl spike** that answers: (1) how many map units a real block
returns — if it is 1 mukey, the whole composition premise collapses; (2) whether SDA can clip
server-side; (3) the `JSON+COLUMNNAME` response shape. Do the spike before `/plan`, against
Demo Winery (Bhutan is outside SSURGO coverage).

Design doc: `~/.rstack/projects/wine-inventory/russe-claude-usgs-soil-maps-vineyard-eabe6c-design-20260720-005928.md`.
An empty branch `claude/usgs-soil-maps-vineyard-eabe6c` exists with no commits.

## Plan 062 Units 2/5 — liquid SO₂-solution booking (feature gap, NOT the money bug)

Booking a *stocked liquid KMBS-solution material* by ppm currently books an UNKNOWN-cost line
with no depletion: there is no durable `so2SolutionPercentKmbs` field, and `consumeMaterialCore`
cannot convert g → mL. Powder KMBS is fully correct.

⚠️ Do NOT simply run `/work` on plan 062 — the money-critical half already shipped (plan 066,
PR #180), and re-running would DOUBLE-APPLY the 0.576 active fraction and re-break `verify:cost`.

Needs a governed schema change + eng review. Separate plan when prioritized.

## Break Mode — configure Sentry server-side data scrubbing

Break Mode shipped (PRs #345, #375) with client-side defaults: replay never captures
request/response bodies, masking always on, fails closed. **That is a client-side default,
not a guarantee.**

⚠️ **BLOCKER before Break Mode is used on any real tenant:** configure Sentry server-side
data-scrubbing. Tracked in `docs/architecture/security-register.md` (🟡).

Also not done, and out of repo: the `/bug-triage` skill step that reads the captured hunt trail.
