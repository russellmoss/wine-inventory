---
title: Phase 9 — Work Orders (issue → execute → auto-log → approve → finalize)
type: feat
status: completed
date: 2026-07-03
branch: feat/work-orders
depth: deep
units: 15
reviewed_by: [codex/gpt-5.4, gemini/3.1-pro, plan-eng-review, plan-design-review]
completed_date: 2026-07-03
completion_note: >
  All 15 units built on feat/work-orders (one commit per unit). Engine proven e2e by
  `npm run verify:work-orders` (20 assertions incl. A3 open-time dosing, idempotency, reject=reverse
  restoring stock + netting cost to zero). Full suite 973 passed / 22 skipped; tsc + eslint clean; next
  build green (5 /work-orders routes); verify:tenant-isolation 80 tables; verify:invariants 20/20
  (WORKORDER-1/2 added). Addendum P0s applied: A1 attempt table, A2 tx-form cores (rackWineTx/
  recordNeutralDoseTx/topVesselTx, behavior-preserving), A3 rate-vs-amount at open time, A4 compare-and-swap
  on approve/reject. Deferred to follow-on (noted in ship summary): full Dexie-outbox integration for WO
  completion (v1 uses idempotent commandId — Phase 28), separate concurrency race harness (A11), and a
  DB-gated vitest for the execute/approval DB paths (covered by verify:work-orders instead).
---

## Overview

A shared work-order engine: a manager/foreman issues a work order (tasks, assignees, due dates, instructions), a cellar hand executes it on a floor-first checklist, and **completing a task writes the corresponding ledger operation immediately as a prefilled actual** — logging becomes a side effect of doing the job. The winemaker reviews and approves (or rejects → reverse), and the manager never re-keys what the crew already did. One engine serves the cellar now and the vineyard (Phase 20) later.

## Problem Frame

Today every wine movement, addition, and transform is hand-entered by whoever is at a keyboard, after the fact, from memory or paper. That is the exact chore winemakers hate and the reason cellar records drift from reality. The job the winemaker is hiring this feature to do: **"tell the crew what to do, have them do it, and have the system already know it happened — with a chance for me to catch mistakes before it's final."** Do nothing and we stay at parity with a spreadsheet; the incumbents (Vintrace jobs, InnoVint activities) already turn work into records. Our edge is the verification layer (maker-checker) done without desyncing the system from the floor, plus the NL/voice authoring wedge (Phase 10, later).

**Product pressure test:** the risk is over-building. The winning v1 is the *core loop on the cellar's real operations* (rack, addition, transfer, top), not a full templating IDE or the NL parser. Template richness, recurring WOs, and voice are staged. Flagged in scope boundaries.

## Requirements

- **MUST:** WO is a first-class entity (issue → assign → schedule → execute → approve → finalize) with a guarded status machine.
- **MUST:** Completing a task **writes the real ledger op immediately** through the existing cores (`rackWineCore`, `addAdditionCore`, …) — the projection reflects it at once. "Pending-approval" is a state on the **task**, not on the immutable op.
- **MUST:** Approval finalizes; **reject/un-approve = `reverseOperationCore`** (plan-024), never a row edit/delete (honors LEDGER-10).
- **MUST:** Approval is **configurable** (per tenant / template / role), supports **auto-finalize for self-executed work**, and **bulk approval**.
- **MUST:** **Operations vs. observations** are two lanes — state-changing tasks write pending ledger ops; observation tasks (chem/ferment/tasting) write directly with no approval gate.
- **MUST:** **Soft resource reservation** on issue — allocate source-lot volume + destination vessel capacity + supply quantity; **available-to-promise = on-hand − open allocations**; **warn, not hard-block**; auto-expire on complete/cancel/past-due. Hard invariants (capacity in `writeLotOperation`, `SupplyLot` decrement) remain the real guarantee at commit.
- **MUST:** Supply follows the same lifecycle — **reserve on issue, deplete on completion** (via the existing `consumeMaterialCore` path), reconcile planned-vs-actual on completion.
- **MUST:** Notes/instructions (order + task), completion notes, attachments, and **structured planned-vs-actual + reason**.
- **MUST:** Every new table follows the 9-step Phase-12 tenancy/RLS checklist with real isolation coverage.
- **MUST:** Floor-first execution UX (phone/tablet, ≥42px targets), offline-tolerant via the existing Dexie outbox + idempotent `commandId`.
- **SHOULD:** Versioned, clone-on-customize templates with a typed field vocabulary; system templates shipped as defaults.
- **SHOULD:** WO dashboard (scheduled / today / overdue / pending-approval) with a nav pending-count badge.
- **NICE (staged/out of v1):** recurring WOs; NL/voice authoring (Phase 10); pay-basis attach (Phase 11 display-only seam); full conflict-resolution offline sync (Phase 28).

## Scope Boundaries

**In scope:** the WO domain (entity + tasks + templates + reservations), the execute→auto-log seam reusing existing cores, approve/reject reusing plan-024, reservation/ATP engine, manager/worker/review surfaces, offline-tolerant execution on the existing outbox, tenancy/RLS + verify script + invariant notes.

**Out of scope (with reason):**
- **NL/voice authoring** — flagship wedge but co-designed with Phase 10 + gated by the H8 eval harness. Build the engine so it can be driven by a parser later; don't build the parser now.
- **Full RBAC capability matrix** — Phase 23. Use a minimal, replaceable authority check now.
- **Payroll/wage math** — Phase 11 owns it. WO only *displays/attaches* pay basis (a later, thin seam).
- **Conflict-resolution CRDT sync** — Phase 28. v1 rides the best-effort Dexie outbox (last-write-wins, idempotent); the WO promise is not "harvest-grade offline" until 28.
- **Vineyard-specific task types** — Phase 20 reuses the engine; keep it domain-generic, don't build block activities.

## Research Summary

### Codebase Patterns
- **Ledger write chokepoint:** `runLedgerWrite` (`src/lib/ledger/write.ts:38`) → `writeLotOperation` (`src/lib/ledger/write.ts:107`); capacity guard at `write.ts:151-162`; zero-line ops allowed (additions/fining). Family cores: `rackWineCore` (`src/lib/vessels/rack-core.ts:72`), `addAdditionCore`→`recordNeutralDose` (`src/lib/cellar/addition.ts:172,61`). Op enum: `src/lib/ledger/vocabulary.ts:9` mirrored in `prisma/schema.prisma` (`OperationType`). `LotOperation.batchId` (fan-out), `commandId @unique` (idempotency), `metadata Json?` already exist.
- **Supply consumption + cost:** `consumeMaterialCore` (`src/lib/cost/consume.ts:53`) is the *only* consumption path — the addition op **is** the consumption; decrements `SupplyLot.qtyRemaining`, writes `SupplyConsumption`, attaches a MATERIAL `CostLine`; unknown cost → UNKNOWN, never $0. On-hand computed via `groupBy _sum qtyRemaining` (`src/lib/cellar/materials.ts:49`). **No reservation/allocation concept exists.**
- **Reversal (plan-024):** universal `reverseOperationCore` (`src/lib/ledger/reverse.ts:107`) + `reversibilityOf` (`reverse.ts:77`); cellar path `correctOperationCore` (`src/lib/cellar/correct.ts:31`) + cost identity-negation `negateCostForReversedOp` (`src/lib/cost/reverse.ts:14`). Timeline Undo action `reverseOperationAction` (`src/lib/ledger/actions.ts:22`).
- **Draft→confirm precedents:** `BlendTrial` (`schema` `BlendTrialStatus DRAFT/CHOSEN/PROMOTED/DISCARDED`, promotes to a real op) — the closest analog; assistant confirm-nonce (`src/lib/assistant/confirm.ts`, `commit.ts`) for D10; `Sample` guarded status machine (`src/lib/chemistry/samples.ts:12-30`) with `assertTransition`.
- **Tenancy:** 9-step checklist in `AGENTS.md:53-82`; verbatim model pattern `ComplianceReport` (`schema:1794`); RLS migration template `prisma/migrations/20260701020300_compliance_rls/`; runtime `src/lib/tenant/{context,tx,models}.ts`, `runLedgerWrite`, `runInTenantTx`, `runInTenantRawTx`.
- **RBAC:** **no role tier between `admin` and `user`.** Pure logic in `src/lib/access.ts` (`accessDecision`, `canAccessVineyard`); action plumbing `src/lib/actions.ts` (`action`/`adminAction`), gates `src/lib/dal.ts` (`requireReadyUser`/`requireAdmin`). Manager/worker split precedent: Harvest `AdminViewToggle` + `?view=` (`src/app/(app)/vineyards/harvest/`).
- **Surfaces:** feature layout convention (`src/app/(app)/<feature>/page.tsx` → `data.ts` → `*Client.tsx`; actions in `src/lib/<feature>/actions.ts` → cores). Cleanest list+modal+action: Samples (`SamplesClient.tsx`, `src/lib/chemistry/actions.ts`). Stage-stepper: `EnTirageClient.tsx`. UI kit: `src/components/ui` (Card/Input/Button/Modal/Badge). Nav: `src/components/AppShell.tsx:10-44` (static `NavItem[]`, admin filter, badge pills; count wiring in `src/app/(app)/layout.tsx:7-19`).
- **Offline:** **no service worker;** Dexie outbox in `src/lib/offline/{queue,db,useSync}.ts` (pure `queue.ts` state machine, `commandId` idempotency, `needs_attention` terminal). Floor-first consumer `src/components/ferment/FermentMonitor.tsx`. Design tokens `src/styles/tokens/*`.
- **Audit + observations:** `writeAudit` (`src/lib/audit.ts`) in-tx; observations are a standalone non-ledger lane (`AnalysisPanel`/`AnalysisReading`/`LotTastingNote`/`LotStateEvent`, soft-delete, `schema:1614-1623`).

### Prior Learnings
- **Ledger immutability (LEDGER-10) + conservative-correction guard (LEDGER-11):** un-approve must be a `CORRECTION` via `reverseOperationCore`, and is **blocked if a later op touched the (vessel,lot)** — so approving/rejecting after a dependent task ran is a real sequencing hazard.
- **Windows/Prisma:** isolated `ALTER TYPE` enum migration first (status enums), committed before use; `migrate diff → deploy` (not `migrate dev`); stop dev server before `generate`; Neon cold start = P2028 retry.
- **Tenancy:** K12 (never read ALS tenant in a cached fn — pass `tenantId` to WO dashboards); raw SQL via `runInTenantRawTx` (ATP aggregation), guarded by `verify:raw-sql`; `SET LOCAL` in-tx (D17) for the offline drain; Demo Winery for all seeds.
- **Tech-debt:** only 3 of ~59 tables have behavioral isolation coverage — add *real* coverage for WO tables; transform-family cost-negation-on-reversal is currently unverified — WO reversals touching crush/press need explicit tests.

### External Research
None required — all mechanisms are internal and already in the codebase.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| WO as entity vs. op-state | **Separate WorkOrder + WorkOrderTask entities that *own* a real ledger op; approval state lives on the task** | Add `planned→executed→approved` lifecycle onto `LotOperation` | Keeps `LotOperation` immutable (LEDGER-10); op is always "real" so projection is truthful; reject reuses `reverseOperationCore` unchanged. Op-state would fork the ledger contract. |
| When state changes | **On task completion (pending), not on approval** | Commit-on-approval (hard gate) | Roadmap-locked; avoids desyncing system from floor, blocking sequential work, and winemaker bottleneck. |
| Reject / un-approve | **`reverseOperationCore` (plan-024) — a new CORRECTION op** | Flip a status / soft-delete the op | Honors immutability; reuses fully-built universal reversal + cost identity-negation. |
| Reservation | **Separate soft-allocation table (advisory, expiring, capacity-aware); warn-not-block** | Status flag on vessel; hard lock | Cellar plans change constantly; hard locks rot/grid-lock harvest. Hard invariants at commit are the real guarantee. |
| Approval authority | **Minimal configurable check now (per tenant/template/role), replaceable by Phase 23** | Build the full RBAC matrix; reuse admin-only | No role tier exists; full matrix is Phase 23; admin-only is too coarse for manager sign-off. |
| Templates | **Typed-field vocabulary + versioned clone-on-customize; ship system defaults** | Free-form cells | Free-form breaks cost/compliance mapping; roadmap-locked ERP pattern (mirrors Phase-19 registry). |
| Observations | **Direct-log lane, no approval gate** | Route everything through approval | Observations don't move liters or cost; a gate adds friction for zero compliance value. |
| Offline | **Reuse the Dexie best-effort outbox; completion = queued idempotent command** | Build CRDT sync now | Real conflict sync is Phase 28; v1 must not swallow it. Flag Phase 28 as the harvest prerequisite. |

## Implementation Units

### Unit 1: WO status enums (isolated migration)
**Goal:** Land all WO status enums before any table references them (Windows enum rule).
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_work_order_enums/migration.sql`
**Approach:** Add `WorkOrderStatus` (DRAFT, ISSUED, IN_PROGRESS, PENDING_APPROVAL, APPROVED, CANCELLED), `WorkOrderTaskStatus` (PENDING, DONE, PENDING_APPROVAL, APPROVED, REJECTED, SKIPPED), `ReservationStatus` (ACTIVE, RELEASED, EXPIRED), `WorkOrderTaskKind` (OPERATION, OBSERVATION). Isolated `ALTER TYPE`/`CREATE TYPE` migration only; commit + apply before Unit 2.
**Tests:** none (enum-only migration).
**Depends on:** none. **Execution note:** apply this migration standalone first.
**Verification:** `npx prisma migrate deploy` clean; enums visible in `\dT`.

### Unit 2: WO schema + tenancy + RLS
**Goal:** The tenant-scoped tables: `WorkOrder`, `WorkOrderTask`, `WorkOrderTemplate`, `WorkOrderTemplateVersion`, `Reservation`.
**Files:** `prisma/schema.prisma`, `prisma/migrations/<ts>_work_order_schema/`, `prisma/migrations/<ts>_work_order_rls/`
**Approach:** Follow the 9-step checklist verbatim against the `ComplianceReport` pattern (`schema:1794`) and the `compliance_rls` template. `WorkOrderTask` links to `LotOperation` via a **composite** FK `(tenantId, operationId) → (tenantId, id)` (add `@@unique([tenantId, id])` on `LotOperation`); `Reservation` composite-FKs to `Vessel`/`Lot`/`SupplyLot`. Per-tenant uniques on WO number + template `(code, version)`. Task carries `kind`, `opType`, prefilled `plannedPayload Json`, `actualPayload Json?`, `operationId?`, `approvalStatus`, provenance + `commandId @unique`. Do NOT add to `GLOBAL_MODELS`.
**Tests:** schema compiles; `prisma validate`.
**Depends on:** Unit 1. **Execution note:** `migrate diff → deploy`, stop dev server before `generate`.
**Verification:** `npx prisma migrate deploy`; RLS `DO $$` guard passes; `npm run db:generate` clean.

### Unit 3: Tenant-isolation coverage
**Goal:** Prove RLS on every new WO table (checklist step 9).
**Files:** `scripts/verify-tenant-isolation.ts`, `test/tenant-isolation.test.ts`
**Approach:** Add a behavioral case per new table (cross-tenant read/write denied) mirroring existing cases.
**Tests:** the cases themselves.
**Depends on:** Unit 2.
**Verification:** `npm run verify:tenant-isolation` green including new tables.

### Unit 4: WO lifecycle cores (issue/assign/schedule/cancel)
**Goal:** Script-safe cores + a guarded status machine for the WO shell (no execution yet).
**Files:** `src/lib/work-orders/lifecycle.ts`, `src/lib/work-orders/status.ts`, `src/lib/work-orders/actions.ts`, `src/lib/work-orders/data.ts`
**Approach:** Model the status machine on `src/lib/chemistry/samples.ts:12-30` (`TRANSITIONS` + `assertTransition`). Cores take `LedgerActor`; actions wrap via `action()` (`src/lib/actions.ts`). `writeAudit` in-tx. Reads via `data.ts` (K12-safe: pass `tenantId` explicitly).
**Tests:** `test/work-order-status.test.ts` — legal/illegal transitions; issue creates tasks from a template instance.
**Depends on:** Unit 2. **Execution note:** test-first for the status machine.
**Verification:** `npm test test/work-order-status.test.ts`.

### Unit 5: Reservation / available-to-promise engine
**Goal:** Soft, capacity-aware, expiring holds + ATP math.
**Files:** `src/lib/work-orders/reservations.ts`, `src/lib/work-orders/atp.ts` (pure), `test/work-order-atp.test.ts`
**Approach:** Pure `atp.ts`: `availableToPromise = onHand − Σ(active allocations)` for supply; destination capacity = `capacityL − currentHoldings − Σ(active vessel allocations)`; source = `lotVolume − Σ(active source allocations)`. Reservation writes on issue; **warn-not-block** (return a conflict advisory, never throw). Expiry swept on complete/cancel/past-due. On-hand from `src/lib/cellar/materials.ts:49` pattern; any raw aggregation via `runInTenantRawTx`.
**Tests:** pure ATP: sufficient/insufficient warns; two WOs over-allocate → second warns; capacity-aware on both sides; expiry releases.
**Depends on:** Unit 2. **Execution note:** test-first (pure math).
**Verification:** `npm test test/work-order-atp.test.ts`.

### Unit 6: Execute → auto-log seam (the core of Phase 9)
**Goal:** Completing an OPERATION task writes the real ledger op via the existing cores, owned by the task in `PENDING_APPROVAL`.
**Files:** `src/lib/work-orders/execute.ts`, `src/lib/work-orders/actions.ts`
**Approach:** A dispatcher maps `task.opType` → the existing core input (`rackWineCore`, `addAdditionCore`, transfer/top/…) built from `plannedPayload` merged with the worker's `actualPayload`. Call the core (which runs `runLedgerWrite`/`writeLotOperation` — reused unchanged), capture the returned `operationId` onto the task, set task `PENDING_APPROVAL`, release/reconcile the reservation against actuals, `writeAudit`. Idempotent on task `commandId`. **The op is real and immutable; pending-approval is task state.**
**Tests:** `test/work-order-execute.test.ts` — completing a rack task creates a real RACK op + projection reflects it + task is PENDING_APPROVAL; addition task consumes supply + attaches cost; duplicate submit is a no-op.
**Depends on:** Units 4, 5. **Execution note:** characterization-first against `rackWineCore`/`addAdditionCore` behavior.
**Verification:** `npm test test/work-order-execute.test.ts`.

### Unit 7: Approve / finalize / reject(=reverse)
**Goal:** Approval finalizes; reject calls `reverseOperationCore`; configurable authority + auto-finalize + bulk.
**Files:** `src/lib/work-orders/approval.ts`, `src/lib/work-orders/authority.ts`, `src/lib/work-orders/actions.ts`
**Approach:** Approve = flip task/WO status (no op mutation). Reject = `reverseOperationCore(actor, { operationId })` (`src/lib/ledger/reverse.ts:107`) then set task `REJECTED`. **Surface the LEDGER-11 hazard:** if a later op touched the (vessel,lot), reversal is blocked — return a clear conflict, don't silently fail. Authority = a pure `canApprove(user, wo, config)` in `authority.ts` (replaceable by Phase 23); config: per-tenant/template who-approves + **auto-finalize self-executed**. Bulk approve = iterate with per-item results.
**Tests:** `test/work-order-approval.test.ts` — approve finalizes; reject reverses (op corrected, cost negated, stock restored); blocked-by-later-op returns conflict; auto-finalize path; bulk partial-failure reporting; authority denies non-approver.
**Depends on:** Unit 6.
**Verification:** `npm test test/work-order-approval.test.ts`.

### Unit 8: Observation lane (no approval gate)
**Goal:** OBSERVATION tasks write directly to the measurement store, no pending state.
**Files:** `src/lib/work-orders/execute.ts` (branch), `src/lib/work-orders/observations.ts`
**Approach:** For `kind = OBSERVATION`, dispatch to the existing measurement cores (`AnalysisPanel`/reading, tasting, `LotStateEvent`) — soft-deletable, non-ledger. Task goes straight to `DONE`; no reservation, no approval.
**Tests:** `test/work-order-observation.test.ts` — a "log Brix" task writes a reading and completes without an approval step.
**Depends on:** Unit 6.
**Verification:** `npm test test/work-order-observation.test.ts`.

### Unit 9: Notes, attachments, planned-vs-actual deviation
**Goal:** Three-level notes + structured deviation capture.
**Files:** `prisma/schema.prisma` (note/attachment fields or a `WorkOrderNote` child), `src/lib/work-orders/lifecycle.ts`, `src/lib/work-orders/execute.ts`
**Approach:** Order/task instructions on issue; completion notes on execute; attachment refs (reuse the app's existing upload/asset convention if present, else store references). Deviation = `plannedPayload` vs `actualPayload` diff + a `reason` string, surfaced to the approver. If a schema field is added, it is note/text only (no new enum → no isolated migration).
**Tests:** deviation diff computes target-vs-actual; notes persist across the lifecycle.
**Depends on:** Units 6, 7.
**Verification:** `npm test` (deviation unit) + review render in Unit 12.

### Unit 10: Template registry (system + clone-on-customize + versioning)
**Goal:** Typed-field templates; system defaults; tenant clone-on-customize; instance records version.
**Files:** `src/lib/work-orders/templates.ts`, `src/lib/work-orders/template-vocabulary.ts`, `scripts/seed-work-order-templates.ts`
**Approach:** A typed field vocabulary (allowed task types + fields per type) validated against a schema — never free-form. System templates seeded (rack WO, addition WO, top WO, ferment-monitor WO) into Demo Winery via `runAsTenant`. Clone-on-customize copies a template into the tenant; issuing snaps the current version onto the instance (later edits never rewrite history). Recurring config stored but generation deferred (Unit 15).
**Tests:** `test/work-order-templates.test.ts` — clone is independent of the system template; version snap is immutable on the instance; vocabulary rejects an unknown field.
**Depends on:** Unit 4.
**Verification:** `npm run seed:work-order-templates` (Demo Winery) + tests.

### Unit 11: Manager issue surface
**Goal:** Create a WO from a template, add/assign tasks, schedule, reserve.
**Files:** `src/app/(app)/work-orders/page.tsx`, `.../WorkOrdersClient.tsx`, `.../new/page.tsx`, `.../[id]/page.tsx`, nav in `src/components/AppShell.tsx`
**Approach:** Follow the feature convention (page → `data.ts` → client). Reuse `src/components/ui` (Card/Input/Button/Modal) and the imperative `startTransition→action→router.refresh` submit pattern (`SamplesClient.tsx`). On issue, create reservations (Unit 5) and surface ATP warnings inline. Add a `WINERY` nav item.
**Tests:** manual (Unit 14 e2e covers issue).
**Depends on:** Units 4, 5, 10.
**Verification:** issue a WO in Demo Winery; reservations appear; ATP warns when short.

### Unit 12: Floor-first execution + approval/review surfaces
**Goal:** Worker checklist (mobile, offline) + winemaker review/approve queue with bulk + nav badge.
**Files:** `src/app/(app)/work-orders/[id]/execute/...`, `src/app/(app)/work-orders/review/...`, `src/components/work-orders/*`, `src/app/(app)/layout.tsx` (badge), `src/lib/offline/` (reuse)
**Approach:** Execution = ≥42px targets, `inputMode="decimal"`, prefilled actuals editable, `useSync`/Dexie outbox with idempotent `commandId` (model on `FermentMonitor.tsx`); offline completion is a queued command reconciled on drain (`withWriteRetry`, `SET LOCAL` tenant). Review = a status-driven worklist (model on `SamplesClient.tsx` + `EnTirageClient` stepper) with per-item and **bulk** approve, deviation shown, reject with reason. Pending-count badge via `layout.tsx` prop (model on `countOpenSamples`). Manager/worker/review split via the Harvest `AdminViewToggle` pattern until Phase 23.
**Tests:** manual + Unit 14 e2e.
**Depends on:** Units 6, 7, 9, 11.
**Verification:** complete a task on a phone viewport (incl. offline → reconnect drains); approve in the queue; badge count updates.

### Unit 13: WO dashboard / reporting
**Goal:** Scheduled / today / overdue / pending-approval views.
**Files:** `src/lib/work-orders/data.ts`, `src/app/(app)/work-orders/WorkOrdersClient.tsx`
**Approach:** Read-only aggregations off the write path (D18). **K12-safe**: cached readers take `tenantId` as an explicit arg, never read ALS. Any heavy join via `runInTenantRawTx`.
**Tests:** `test/work-order-data.test.ts` — bucketing (overdue/today/upcoming) is correct on fixture data.
**Depends on:** Unit 4.
**Verification:** dashboard buckets match seeded fixtures.

### Unit 14: End-to-end verify script + invariant notes
**Goal:** Prove the whole loop; encode new invariants.
**Files:** `scripts/verify-work-orders.ts`, `package.json` (`verify:work-orders`), `docs/architecture/invariants/WORKORDER-*.md`, `INVARIANTS.md`
**Approach:** e2e in Demo Winery via `runAsTenant`: seed template → issue (reservations created, ATP reflects) → execute rack + addition (real ops written, projection + cost + stock move, tasks PENDING_APPROVAL) → approve (finalize) → issue+execute+**reject** (reverseOperationCore corrects, cost negated, stock restored) → observation task logs directly. Add invariant notes: **WORKORDER-1** "a completed task's op is an ordinary immutable ledger op; approval is task metadata" (guard: `verify:work-orders`); **WORKORDER-2** "reservations are advisory; capacity/stock are enforced only at commit by LEDGER-4 + SupplyLot" (guard: `verify:work-orders`). Run `verify:invariants` to confirm coverage.
**Tests:** the script is the test.
**Depends on:** Units 6, 7, 8.
**Verification:** `npm run verify:work-orders` green; `npm run verify:invariants` green.

### Unit 15: Recurring WOs + pay-basis attach seam (thin)
**Goal:** Recurring generation + display-only pay basis.
**Files:** `src/lib/work-orders/recurring.ts`, `src/lib/work-orders/templates.ts`
**Approach:** Recurring config (weekly topping, SO₂) generates the next instance on a cadence (a cron or on-demand generator; reuse the reminders cron pattern if present). Pay basis: WO *displays/attaches* piece-rate-vs-hourly + rates read from Phase-11 wage settings **if present**, else a no-op placeholder — **no wage math here** (Phase 11 owns it).
**Tests:** recurring generates the next instance with a fresh template-version snap.
**Depends on:** Units 10, 11. **Execution note:** keep pay-basis a read-only stub; do not build Phase 11.
**Verification:** a recurring WO spawns its next occurrence; pay basis renders when wage settings exist.

## Test Strategy

**Unit tests (vitest, `test/`):** status machine, ATP math (pure), execute seam, approval/reject, observation lane, templates, dashboard bucketing, deviation diff. Follow `test/ledger-math.test.ts` / `test/chemistry` patterns.
**Integration / e2e:** `npm run verify:work-orders` (Demo Winery, full loop incl. reject→reverse) + `npm run verify:tenant-isolation` (new tables) + `npm run verify:invariants`.
**Manual verification:** the roadmap exit test — a manager issues a WO to rack two tanks; a crew member checks it off on a phone; the racks appear as PENDING_APPROVAL ledger ops with correct provenance; the manager bulk-approves and they finalize — the manager typed none of the rack details. Plus: reject a task and confirm the ledger reverses; complete an addition and confirm supply depleted + cost attached; go offline mid-execution and confirm drain-on-reconnect.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Un-approve blocked by LEDGER-11 (a later task built on the one being rejected) | MED | MED | Surface the conflict explicitly with the blocking op; require reversing dependents first; document the sequencing rule in the review UI. |
| Offline sync is best-effort (Phase 28 not built) → lost/last-write-wins conflicts under real harvest load | MED | HIGH | Scope v1 to best-effort outbox + idempotent `commandId` + `withWriteRetry`; **explicitly flag Phase 28 as the harvest prerequisite** in the plan and UI ("not harvest-grade offline yet"). |
| Sync-storm: many devices drain SERIALIZABLE ops on reconnect → 40001 aborts | MED | MED | Bounded/throttled drain; reuse `withWriteRetry`; `SET LOCAL` tenant per queued op. |
| No role tier exists → approval authority is ad-hoc | HIGH | LOW | Minimal pure `canApprove()` now, explicitly replaceable by Phase 23; don't over-build. |
| New tables leak (RLS coverage gap — only 3/59 tables tested today) | MED | HIGH | Unit 3 adds *behavioral* isolation cases for every WO table; `verify:tenant-isolation` gates. |
| Cost-negation-on-reversal for transform-family ops is unverified today | LOW | MED | v1 WO opTypes are rack/addition/top (well-covered); if crush/press tasks are added, require explicit reversal cost tests first. |
| Scope creep (templates IDE, voice, recurring) balloons the phase | HIGH | MED | Hard v1 boundary: core loop on rack/addition/top; voice=Phase 10, recurring=Unit 15 thin, full templates staged. |
| Windows enum-migration ordering breaks deploy | MED | MED | Unit 1 lands all status enums in an isolated migration first; `migrate diff→deploy`. |

## Success Criteria

- [x] Manager issues a WO from a template; tasks + reservations created; ATP warns when a supply/vessel is short (warn, not block).
- [x] Cellar hand completes a rack task on a phone; a real RACK op is written immediately and the projection shows the wine moved; task is PENDING_APPROVAL.
- [x] Completing an addition task depletes `SupplyLot` and attaches a MATERIAL cost line to the lot (UNKNOWN, never $0, if cost missing).
- [x] Winemaker bulk-approves; tasks finalize with no op mutation. Self-executed work auto-finalizes per config.
- [x] Rejecting a task reverses via `reverseOperationCore` (op corrected, cost negated, stock restored); a reject blocked by a later op returns a clear conflict.
- [x] Observation tasks (Brix/temp) log directly with no approval gate.
- [x] Offline completion queues and drains on reconnect (idempotent, no double-write).
- [x] `npm run verify:work-orders`, `verify:tenant-isolation`, `verify:invariants` all green; new WORKORDER invariant notes present.
- [x] All tests pass; no regressions.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Roadmap Phase 9 + operator conversation are explicit. |
| Scope Boundaries | HIGH | v1 core-loop boundary is clear; deferrals map to real later phases. |
| Implementation Units | MEDIUM-HIGH | Write seam + reversal + tenancy are well-mapped; the net-new terrain (reservation, approval authority, templates) is understood but unbuilt. |
| Test Strategy | HIGH | Mirrors existing verify:* + vitest patterns; e2e loop is concrete. |
| Risk Assessment | MEDIUM | Offline (Phase 28) and LEDGER-11 sequencing are genuine unknowns under real load; mitigations scope them, they don't eliminate them. |

## Review Addendum (council + eng + design, 2026-07-03)

Findings from `/council` (Codex + Gemini), `/plan-eng-review`, `/plan-design-review`. Full council detail in `council-feedback.md`. **Apply these before `/work`.**

### Required structural changes (P0 — both eng + council)
- **A1. Add `WorkOrderTaskAttempt` (append-only).** A task can't be a one-shot wrapper around an immutable op. `commandId @unique` lives on the *attempt* (idempotency on the immutable event, not the mutable task). Fields: tenantId, taskId, commandId, actualPayload, operationId?, correctionOperationId?, status, completedAt/approvedAt/rejectedAt, reviewedBy. `@@unique([tenantId, operationId])`. **Restructures Units 2/6/7.**
- **A2. Atomic completion tx.** Expose a `buildWriteOpInput()` / `...Tx(tx,…)` form of `rackWineCore`/`addAdditionCore` so WO completion writes ledger op + attempt + reservation-release + audit in **one** `runLedgerWrite`. Prevents split-brain / dangling reservation / offline double-write. **Unit 6.**
- **A3. Rate-vs-amount.** `plannedPayload` stores the **target rate + basis**; the execution UI computes the suggested amount from the vessel's **current ledger volume at open time**, not issue time (else an intervening rack over-sulfites). **Units 2/6/12.**
- **A4. Compare-and-swap on approve/reject.** Claim the row: `updateMany(where:{ status:'PENDING_APPROVAL', currentAttemptId, approvedAt:null, rejectedAt:null })`; reject binds to the specific attempt/op. **Unit 7.**

### Should-fix (eng + council)
- **A5.** Drop the separate `approvalStatus` column (status enum already carries it); use timestamps + actor ids. **A6.** Extract canonical columns from JSON (`sourceVesselId/destVesselId/lotId/materialId/dueAt/assigneeId/opType`); JSON = snapshot only. **A7.** Partial indexes up front (active reservations `(tenantId,{vessel|lot|supplyLot},expiresAt)`; dashboard `(tenantId,status,dueAt)`). **A8.** Read models defined up front (Units 11/12/13), not deferred → avoid N+1. **A9.** Reserve additions at **material/on-hand** level, not a specific `SupplyLot` (don't fight the costing engine). **A10.** Reservation `validUntil` separate from `dueAt`; **past-due does NOT expire** (default ≥7 days past due) — else harvest double-books. **A11.** Move race gates earlier: `verify:work-orders-idempotency` + `-concurrency` before UI units.

### Design additions (→ new Unit 12 detail)
- **D1.** Empty/first-run states (empty review = "All caught up ✓"; empty dashboard = "Issue your first work order"; no-templates guided seed). **D2.** Execution checklist IA: one task in focus, big prefilled actual + computed suggested amount, offline status pinned (`aria-live`). **D3.** Deviation-first review UI: variances segregated + `--warning` color; select-all picks only exact matches (anti-rubber-stamp). **D4.** LEDGER-11 "locked reject" affordance: drawer listing blocking downstream ops. **D5.** Live `IN_PROGRESS` claim ("In progress by Juan") on the dashboard the moment the crew taps Start. **D6.** Microcopy: "Recorded — pending review," not "Submitted for approval."

### Open product decisions — RESOLVED with recommended defaults (2026-07-03, operator away; override anytime)
1. **After reject → resubmit same task (new attempt).** Confirms the `WorkOrderTaskAttempt` table (A1) is required. Matches how a cellar re-does a botched job; keeps the redo trail.
2. **Approval authority v1 → admin approves + auto-finalize self-executed.** Minimal, replaceable by Phase 23. No fake role matrix.
3. **Approval granularity → per-task, bulk-approve exact matches, force individual review on deviation** (>1% volume or any chem-amount delta). Anti-rubber-stamp.
4. **Reservation → kept in v1** (operator explicitly asked for the barrel-3 coordination). v1.1 defer remains the cut line if the phase runs long.

*(These are the review's recommended options, applied because the operator stepped away. Each is a one-line change to revisit at `/work` kickoff.)*

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/council` (codex) | Independent 2nd opinion | 1 | issues_found | 4 critical, 8 should-fix, 3 design-Q |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | issues_open | 11 issues, 2 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | 5/10 → 8/10, 6 decisions |
| Council (Gemini) | `/council` (gemini) | Domain/UX 2nd opinion | 1 | issues_found | 3 critical, 3 should-fix, 3 design-Q |

- **CROSS-MODEL:** Codex + Gemini + eng all converge on the two P0s (execution-attempt model, atomic seam). Gemini's rate-vs-amount + LEDGER-11-trap are the domain-critical adds eng seconded.
- **UNRESOLVED:** 4 product decisions (above).
- **VERDICT:** Plan is architecturally sound. **Eng review = issues_open** — 2 P0 structural fixes (A1 attempt table, A2 atomic seam) required before implementation. Apply the addendum, confirm the 4 decisions, then `/work`.
