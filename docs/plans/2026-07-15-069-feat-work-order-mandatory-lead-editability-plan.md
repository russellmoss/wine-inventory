---
title: Work-order Lead — mandatory invariant + detail-page editability
type: feat
status: completed
date: 2026-07-15
branch: claude/work-order-assignment-edit-276af4
depth: standard
units: 7
---

> **Build status (2026-07-15):** Units 1-6 built + committed on `claude/work-order-assignment-edit-276af4`.
> Unit 7 (DB NOT NULL) deferred by design. Green: tsc, vitest 2050, eslint, verify:work-orders (38),
> verify:invariants (31/31), verify:invariant-frontmatter (32), `next build`. Backfill dry-run validated
> on 8 real rows. **TWO manual follow-ups before this is done in prod:** (1) run
> `scripts/backfill-work-order-lead.ts` against PROD creds (this repo's local `.env` is a dev/preview DB —
> prod Bhutan WO #27 is not in it); (2) browser-QA the builder + detail-edit UI (no RTL/jsdom in repo).

## Overview

Every work order must always have a **Lead** (`WorkOrder.assigneeEmail` + `assigneeId`) — the one
person accountable for the order — while per-task assignees stay optional. Today the Lead is optional
and silently defaults to blank, which is why WO #27 shows "Assigned to —" even though its only task is
assigned to Russell. We make the Lead mandatory on every creation path (defaulting to the creating
actor when no human is named), backfill existing Lead-less orders, add an app-code invariant + verify
guard, and give admins/developers a way to set or change the Lead (and due date) from the WO detail page.

## Problem Frame

A winemaker (Mike) assigned WO #27's **task** to Russell but left the WO-level **Lead** dropdown at
"— unassigned —". The detail header and the printed work order only read the Lead field, so the
assignment Russell got is invisible everywhere except the task row. Worse, there is **no way to fix it
after creation** — the detail page offers only Issue / Open execution view / Print / Cancel.

Two root causes:
1. The Lead is an optional field with a silent "unassigned" default, so orders routinely ship with no
   accountable owner. There are two un-reconciled assignee concepts (order Lead vs per-task assignee).
2. The WO-level reassign/reschedule backends exist but were never wired to the detail page.

Doing nothing means work orders keep getting created with no owner, and there's no in-app path to
correct assignment — every fix is a DB edit or an assistant command.

## Requirements

- **MUST:** Every work order has a non-null Lead (`assigneeEmail`, and `assigneeId` when a real user is
  known) after this ships — enforced at the single write chokepoint so no path can bypass it.
- **MUST:** Per-task assignee (`WorkOrderTask.assigneeId`) stays **optional** — unchanged.
- **MUST:** Automated/assistant/template paths with no named human default the Lead to the creating
  actor (`actor.actorUserId` / `actor.actorEmail`).
- **MUST:** The builder's "Lead" field becomes required (create is guarded until a Lead is chosen; clear
  inline validation), and it captures the chosen member's `userId` (not just email).
- **MUST:** Existing Lead-less work orders are backfilled: single distinct task assignee → that user;
  else the issuer; else the tenant's oldest admin (logged for review). This fixes WO #27
  (→ russellmoss87@gmail.com).
- **MUST:** Admin **and** developer can set/change the Lead and reschedule the due date from the WO
  detail page (reusing the existing assign + schedule backends).
- **SHOULD:** Add a `WORKORDER-5` invariant note + narrative entry + a verify guard so the invariant is
  self-enforcing; keep `verify:invariants` + `verify:invariant-frontmatter` green.
- **NICE / DEFERRED:** A DB-level `NOT NULL` constraint on `assigneeEmail` as belt-and-suspenders (has a
  deploy-ordering caveat — see Risks). Per-task reassignment from the detail page.

## Scope Boundaries

**In scope:**
- Mandatory Lead enforcement in `createWorkOrderCore` (covers all 6 creation paths).
- Threading a real `assigneeId` for the Lead from the builder (primary human path).
- One-time cross-tenant backfill script for existing null-Lead orders.
- Detail-page Edit affordance for Lead + due date (admin + developer).
- `WORKORDER-5` invariant note + verify guard + narrative entry.

**Out of scope (and why):**
- **Per-task reassignment UI** — separate concern, needs a new task-reassign core; note as follow-up.
- **Wiring the recurring cron** — `generateRecurringInstanceCore` still has no caller; the core default
  covers it automatically when someone wires it later.
- **A roll-up display** (showing task assignees when Lead is blank) — unnecessary once Lead is mandatory
  and backfilled; the header/Print already read `assigneeEmail`, which will now always be populated.
- **DB NOT NULL constraint** — deferred to a NICE unit to avoid deploy-ordering risk.

## Research Summary

### Codebase Patterns
- **Single write chokepoint:** `createWorkOrderCore` (`src/lib/work-orders/lifecycle.ts:141-204`) is the
  one place every creation path funnels through. It writes `assigneeId: input.assigneeId ?? null` /
  `assigneeEmail: input.assigneeEmail ?? null` (lines 152-153). Defaulting here covers all callers.
- **Actor shape:** `LedgerActor = { actorUserId: string | null; actorEmail: string }`
  (`src/lib/vessels/rack-core.ts:40`). Via the `action()` wrapper (`src/lib/actions.ts:13`) `actorUserId`
  is non-null in practice (a user without id/active org is rejected before the handler).
- **Creation paths (all funnel to the core):** generic `createWorkOrderAction`
  (`actions.ts:94`); builder `createWorkOrderFromBuildsAction` (`actions.ts:162`, passes email only,
  never `assigneeId` — line 195); `createWorkOrderFromTemplateCore` (`templates.ts:174→205`, forwards
  both); template action (`actions.ts:110`, email only); recurring `generateRecurringInstanceCore`
  (`recurring.ts:33→37`, passes neither — **no caller yet**); vessel composer
  `createAndIssueWorkOrderAction` (`composer-actions.ts:57→67`, email only). Assistant tools
  (`propose-work-order.ts`, `create-work-order.ts`, `issue-operation-wo.ts`, `work-orders-write.ts`)
  wrap these actions. **`equipment/actions.ts` does NOT create WOs.**
- **Reassign/reschedule backends already exist:** `assignWorkOrderCore` (`lifecycle.ts:246-274`, guard:
  DRAFT|ISSUED only, emits an "assigned" inbox notification when `assigneeId` non-null) and
  `scheduleWorkOrderCore` (`lifecycle.ts:277-299`, blocked when APPROVED|CANCELLED). Exposed as
  `assignWorkOrderAction` / `scheduleWorkOrderAction` (`actions.ts:224,232`).
- **Lead picker source:** `listOrgMembers(tenantId)` (`data.ts:638`) returns `{ userId, name, email }` —
  already used for the per-task picker; exactly what a Lead picker needs.
- **Schema:** `WorkOrder.assigneeId String?` / `assigneeEmail String?` (`prisma/schema.prisma:3395-3396`)
  are **nullable**, and `assigneeId` is a **bare String, not an FK** to User (soft ref, like
  `issuedById`). So this is a pure data backfill + app-code invariant — no schema change required.
- **Permission flag:** `isTenantAdminLike` (`src/lib/access.ts:64`) returns true for admin **and**
  developer; the detail page already receives it as `isAdmin` (`[id]/page.tsx:15`).
- **Cross-tenant backfill convention:** `runAsSystem(fn)` (`src/lib/tenant/system.ts:22-25`) —
  un-extended client on `DATABASE_URL_UNPOOLED` (BYPASSRLS), used for "AUDITED SCRIPTS ONLY". Must set
  `tenantId` explicitly in every where/data (pattern: `scripts/verify-migration.ts:24-40`). Run scripts
  via `npx tsx --env-file=.env scripts/<name>.ts`; idempotent, self-verify, `disconnectSystem()` at end.
- **Invariant convention:** typed note in `docs/architecture/invariants/<ID>-*.md` (frontmatter: id,
  group, severity, enforcedBy, decision, status, appliesTo, tags; `status: guarded` ⇔ has `verify:`),
  narrative entry in `INVARIANTS.md`, guard verified by `verify:invariants`
  (`scripts/verify-invariant-guards.mjs`) which checks the `verify:` target exists. Notes must be LF.
  Example: `WORKORDER-1-*.md` + `scripts/verify-work-orders.ts` (live-DB e2e vs `org_demo_winery`).
- **Tests:** vitest in `test/` (e.g. `test/work-orders-authority.test.ts` — cleanest pure-unit pattern);
  DB-level assertions live in `scripts/verify-work-orders.ts`.

### Prior Learnings
- Build in the MAIN repo checkout (has `.env`), not `.claude/worktrees` ([[build-in-main-checkout-not-worktrees]]).
- `verify:*` DB checks hit Neon from the main checkout; `check` CI does NOT run `next build` — run
  `npx next build` before merging UI PRs ([[plan053-work-order-builder-drafted]]).
- Prisma on Windows/Neon: avoid interactive `migrate dev`; use `migrate diff → migrate deploy`, stop the
  dev server before `generate` ([[prisma-neon-migrations-windows]]). (Only relevant to the deferred NOT NULL unit.)
- Migrations/backfills that touch RLS tables need the OWNER/system connection, not the tenant-extended
  client ([[raw-sql-tenant-scoping]], [[plan068-inbox-backend-complete]]).

### External Research
None needed — internal-only change.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Where to enforce mandatory Lead | Default-to-actor in `createWorkOrderCore` | Enforce in each action; throw if no Lead | One chokepoint covers all 6 paths; can't be bypassed; no automated path breaks |
| Automated/assistant default | Creating actor (id+email) | Add template default-lead field; block creation | Keeps the invariant universally true with zero new UI; recurring cron gets a sensible owner when wired |
| DB enforcement | App-code invariant + verify guard | DB `NOT NULL` constraint now | Matches repo convention; avoids Vercel migrate-deploy-before-backfill ordering hazard. NOT NULL deferred as hardening |
| Backfill resolution | Single task assignee → issuer → oldest admin (logged) | All-to-issuer; no backfill | Preserves the real intent (fixes #27 → Russell); guarantees the invariant holds for history |
| Backfill client | `runAsSystem` (cross-tenant, BYPASSRLS) | Loop `runAsTenant` per org; extended `prisma` | Established audited-script pattern; extended client would throw without tenant context |
| Edit UI scope | Lead + due date, admin+developer | Also per-task reassign | Reuses existing backends; unblocks the reported complaint; per-task is a clean follow-up |

## Implementation Units

### Unit 1: Pure Lead-resolution helpers + unit tests

**Goal:** Isolate the two decision functions as pure, DB-free helpers so they're unit-testable and reused
by both the core and the backfill.
**Files:** `src/lib/work-orders/lead-resolve.ts` (new); `test/work-order-lead-resolve.test.ts` (new).
**Approach:** Export `resolveCreateLead({ assigneeId, assigneeEmail }, actor)` → returns the effective
`{ assigneeId, assigneeEmail }`: if an explicit email (or id) is present, pass through; else default to
`actor.actorUserId` / `actor.actorEmail`; throw a clear error if neither an explicit Lead nor a usable
actor email exists. Export `resolveBackfillLead({ taskAssignees: {id,email}[], issuedBy: {id,email}|null,
fallbackAdmin: {id,email}|null })` → single distinct task assignee → issuer → fallback admin → null
(caller logs nulls). Keep both pure (no imports beyond types).
**Tests:** happy path (explicit email passes through); no-Lead-defaults-to-actor; actor-without-email
throws; backfill single-assignee; backfill multi-assignee-falls-to-issuer; backfill no-signal-falls-to-admin;
backfill all-null returns null.
**Depends on:** none
**Patterns to follow:** `test/work-orders-authority.test.ts` (pure vitest).
**Verification:** `npx vitest run test/work-order-lead-resolve.test.ts`

### Unit 2: Enforce mandatory Lead in the create core (+ thread assigneeId)

**Goal:** Guarantee every created WO has a Lead, defaulting to the actor, at the one chokepoint.
**Files:** `src/lib/work-orders/lifecycle.ts` (createWorkOrderCore/Tx); `src/lib/work-orders/actions.ts`
(add optional `assigneeId` to `createWorkOrderFromBuildsAction` + `createWorkOrderFromTemplateAction`
input types and forward it); `src/lib/work-orders/composer-actions.ts` and `src/lib/work-orders/templates.ts`
(forward `assigneeId` where they currently forward email only).
**Approach:** In `createWorkOrderCore`, run inputs through `resolveCreateLead(input, actor)` and write the
resolved pair (replaces lines 152-153's `?? null`). Because the core defaults from `actor`, every path
(builder, template, composer, recurring, generic, assistant) inherits the invariant with no per-caller
change. Additionally thread `assigneeId` through the builder/template/composer action input types so a
human-chosen Lead is stored as a real user id (enables the "assigned" notification + a proper detail-edit
value); email-only Leads remain valid.
**Tests:** covered by Unit 1 (pure) + Unit 6 (DB e2e). Add a focused assertion in the verify script (Unit 6).
**Depends on:** Unit 1
**Patterns to follow:** existing `input.x ?? null` writes in `createWorkOrderTx` (lines 145-161);
`assignWorkOrderCore` (lines 246-274) as the model for an id+email Lead pair.
**Verification:** `npx tsc --noEmit`; then Unit 6's `npm run verify:work-orders`.

### Unit 3: Builder — make Lead required

**Goal:** The palette builder cannot create a WO without a Lead, and it captures the member's userId.
**Files:** `src/app/(app)/work-orders/new/WorkOrderBuilderClient.tsx`.
**Approach:** Change the "Lead" `<select>` (currently `leadEmail`, default "— unassigned —",
lines 311-316) to also carry the selected member's `userId` (store `{email,userId}` or look it up from
`members` on submit). Disable the Create button and show an inline "A work order needs a lead." message
until a Lead is chosen. Pass `assigneeId` (+ `assigneeEmail`) into `createWorkOrderFromBuildsAction`
(the action gained `assigneeId` in Unit 2). Keep the per-task Assignee picker optional and unchanged.
**Tests:** manual browser QA (builder is client-only; repo has no RTL/jsdom — see [[assistant-dock-history-shipped]]).
**Depends on:** Unit 2
**Patterns to follow:** the existing per-task assignee `<select>` (line 437-438) which already maps
`members` → `userId`.
**Verification:** Browser QA on Demo Winery — create a QA-* WO with no Lead (blocked), then with a Lead
(succeeds, header shows the Lead, notification fires). `npx next build`.

### Unit 4: Detail-page Edit affordance (Lead + due date)

**Goal:** Admin/developer can set or change the Lead and reschedule from the WO detail page.
**Files:** `src/app/(app)/work-orders/[id]/WorkOrderDetailClient.tsx`;
`src/app/(app)/work-orders/[id]/page.tsx` (fetch + pass `members` and current Lead/dueAt).
**Approach:** In `page.tsx`, call `listOrgMembers(tenantId)` and pass to the client. In the client, add an
"Edit" control (gated on the existing `isAdmin` = admin+developer) that reveals a Lead `<select>`
(from `members`, preselected to the current Lead) + a due-date input, wired to `assignWorkOrderAction`
and `scheduleWorkOrderAction`. Respect the backends' status guards: show Lead-edit only for DRAFT|ISSUED
and due-date-edit for anything except APPROVED|CANCELLED (mirror `lifecycle.ts:252,283`); surface the
CONFLICT ActionError inline. Reuse the existing `act()` transition + `router.refresh()` pattern already
in the component.
**Tests:** manual browser QA.
**Depends on:** Unit 2 (not strictly, but keeps a consistent id+email Lead); reuses existing backends.
**Patterns to follow:** the existing `act(() => cancelWorkOrderAction(...))` wiring
(`WorkOrderDetailClient.tsx:56-58`); `listOrgMembers` usage in the builder page.
**Verification:** Browser QA — as developer, change WO #27's Lead to russellmoss87@gmail.com; header +
Print/PDF now show it; reschedule due date; confirm the "assigned" notification lands in the new Lead's inbox.

### Unit 5: One-time backfill of existing Lead-less work orders

**Goal:** Make the invariant true for history; specifically fix WO #27.
**Files:** `scripts/backfill-work-order-lead.ts` (new).
**Approach:** Using `runAsSystem`, select all `WorkOrder` rows with `assigneeEmail = null` across every
tenant. For each, gather its tasks' distinct `assigneeId`/`assigneeEmail`, its `issuedById`/`issuedByEmail`,
and (once per tenant) the oldest admin member; feed to `resolveBackfillLead` (Unit 1) and update
`assigneeId`+`assigneeEmail` (set `tenantId` explicitly in the where — RLS is bypassed). Idempotent (skips
rows already having a Lead), deterministic ordering, wraps writes in a transaction, logs a summary and any
rows it could not resolve (left null → flagged, not guessed silently), self-verifies (re-count null Leads),
`disconnectSystem()` at end. Documented run command in the header.
**Tests:** dry-run mode (log-only) proven on Demo Winery first; then a targeted assertion that a seeded
single-task-assignee WO resolves to that user.
**Depends on:** Unit 1
**Patterns to follow:** `scripts/recode-legacy-lots.ts` (idempotent one-time shape) + `scripts/verify-migration.ts:24-40`
(`runAsSystem` with explicit tenantId).
**Verification:** `npx tsx --env-file=.env scripts/backfill-work-order-lead.ts --dry-run` then live; confirm
0 null-Lead WOs remain and WO #27's Lead = russellmoss87@gmail.com.

### Unit 6: WORKORDER-5 invariant + verify guard + narrative

**Goal:** Make "every work order has a Lead" self-enforcing.
**Files:** `docs/architecture/invariants/WORKORDER-5-work-order-has-lead.md` (new, LF);
`INVARIANTS.md` (add bullet under Work orders); `scripts/verify-work-orders.ts` (extend to assert the
created WO has a non-null Lead, incl. the default-to-actor case).
**Approach:** Write the note with frontmatter `id: WORKORDER-5`, `group: work-orders`, `severity: high`,
`enforcedBy: app-code`, `decision: "Plan 069"`, `status: guarded`, `verify: "npm run verify:work-orders"`,
`appliesTo: [src/lib/work-orders/]`. Extend the existing `verify-work-orders.ts` drive to (a) create a WO
with no explicit Lead and assert the Lead defaulted to the actor, and (b) assert a null Lead is impossible.
Add the narrative entry to `INVARIANTS.md`.
**Tests:** the verify script IS the guard.
**Depends on:** Unit 2, Unit 5
**Patterns to follow:** `WORKORDER-1-op-is-immutable-approval-is-task-state.md` + `scripts/verify-work-orders.ts` header.
**Verification:** `npm run verify:work-orders`; `npm run verify:invariants`; `npm run verify:invariant-frontmatter`.

### Unit 7 (NICE / DEFERRED): DB NOT NULL constraint on assigneeEmail

**Goal:** Belt-and-suspenders DB-level guarantee.
**Files:** `prisma/schema.prisma`; new `prisma/migrations/<ts>_wo_lead_not_null/migration.sql`.
**Approach:** Only after Unit 5 has run in prod, flip `assigneeEmail` to non-null and author the migration
via `migrate diff → migrate deploy` (Windows/Neon flow). Guard with a DO-block that aborts if any null
remains.
**Tests:** migration applies cleanly on a Neon branch.
**Depends on:** Unit 5 (must run in prod first)
**Verification:** `npx prisma migrate deploy` on a branch DB; app boots.
**Note:** Deferred by default — carries a Vercel deploy-ordering hazard (build runs `migrate deploy`
before any manual backfill). Only pursue once the backfill is confirmed applied in prod.

## Test Strategy

**Unit tests (vitest):** `test/work-order-lead-resolve.test.ts` — the pure resolution logic (create
default-to-actor + backfill resolution), the fastest and most valuable coverage.
**DB e2e (verify scripts):** extend `scripts/verify-work-orders.ts` to assert the create-time invariant
against `org_demo_winery`; `npm run verify:invariants` + `verify:invariant-frontmatter` for the note.
**Manual verification (browser QA, Demo Winery, QA-* fixtures):** builder blocks create with no Lead;
builder create with a Lead populates header + Print + fires notification; detail-page Edit changes the
Lead and due date as a developer; per-task assignee still optional. Run `npx next build` before merge.
**Backfill:** dry-run on Demo Winery, then live; re-count null Leads = 0; WO #27 → russellmoss87@gmail.com.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| `actor.actorUserId` null in some non-`action()` path defaults a bad Lead | LOW | MED | `resolveCreateLead` throws on no-email actor rather than writing junk; all prod paths use `action()` (non-null) |
| Backfill mis-assigns a Lead for ambiguous WOs (multi/zero task assignees) | MED | LOW | Deterministic fallback (issuer → oldest admin); log unresolved rows; dry-run first; Leads are freely editable via Unit 4 |
| Backfill run against RLS tables with wrong client | LOW | HIGH | Use `runAsSystem` + explicit `tenantId` per repo convention; verify-migration.ts pattern |
| DB NOT NULL deploys before backfill (Vercel) | MED | HIGH | Keep Unit 7 deferred; ship invariant as app-code + verify only until backfill confirmed in prod |
| Builder change breaks existing create flow | LOW | MED | Client-only guard; `next build` + browser QA before merge |
| Detail-edit hits a status the backend rejects | LOW | LOW | Mirror the backend status guards in the UI; surface CONFLICT inline |

## Success Criteria

- [ ] No creation path can produce a WO with a null `assigneeEmail` (verified by `verify:work-orders`).
- [ ] Automated/template/assistant creates default the Lead to the creating actor.
- [ ] Builder requires a Lead and stores its `assigneeId`.
- [ ] Existing Lead-less WOs backfilled; 0 remain null; WO #27 Lead = russellmoss87@gmail.com.
- [ ] Admin **and** developer can set/change the Lead and due date from the WO detail page.
- [ ] `WORKORDER-5` note exists and `verify:invariants` + `verify:invariant-frontmatter` are green.
- [ ] Per-task assignee remains optional (no regression).
- [ ] All existing work-order tests + `npx next build` pass.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Reproduced from screenshots + code; single Russell user confirmed |
| Scope Boundaries | HIGH | All 6 creation paths mapped to one chokepoint; equipment path ruled out |
| Implementation Units | HIGH | Backends for edit already exist; core default is a small, well-located change |
| Test Strategy | MEDIUM | Pure logic well-covered; UI is manual-QA-only (no RTL/jsdom in repo) |
| Risk Assessment | HIGH | Main risk is backfill ambiguity, mitigated by dry-run + editable Leads |
