# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

**Work-order Lead → MANDATORY invariant + detail-page editability (Plan 070) — BUILT + rebased onto main, shipping.**
Branch `claude/work-order-assignment-edit-276af4`, rebased onto `origin/main` AFTER vendor mgmt (#195) +
inbox DM (#197) landed. Renumbered 069→**070** (vendor mgmt already took 069). 7 commits. Lead defaults to
the actor at the single `createWorkOrderCore` chokepoint (covers all 6 create paths); builder requires a
Lead + sends assigneeId; admin/dev detail-page Edit card (Lead + due date, reusing assign/schedule
backends); backfill `scripts/backfill-work-order-lead.ts` (`runAsSystem`) fixes existing null-Lead WOs;
WORKORDER-5 invariant + guard. Green pre-rebase (tsc, vitest 2050, verify:work-orders 38, verify:invariants
31/31, next build); re-verifying post-rebase. **BEFORE DONE:** run the backfill against PROD (fixes WO #27
→ russellmoss87@gmail.com); browser-QA the two UI surfaces.

<details><summary>original directive + diagnosis</summary>

User directive: every WO must ALWAYS have a WO-level Lead (`WorkOrder.assigneeEmail`); per-task assignees
stay optional. Diagnosed WO #27: Mike set the *task* assignee to Russell (= `russellmoss87@gmail.com`, the
only Russell) but left the WO-level "Lead" dropdown at "— unassigned —"; header + Print/PDF read only the
Lead field → show "—". Fix: default the Lead to the actor at `createWorkOrderCore`, require it in the
builder, add an admin/developer detail-page Edit, backfill existing rows, guard with WORKORDER-5.

</details>

<details><summary>prev objective (shipped)</summary>

Vendor management (Plan 070, PR #195) and inbox DM (#197) landed on main; Plan 068 inbox shipped (#191).

</details>

## 🧵 Tangent stack  (LIFO — push when you detour, pop when done)

1. ← you are here

## 🪝 Off-path — do NOT do now

- **Plan 062 Units 2/5 — liquid-solution booking (feature gap, NOT the money bug).** Booking a
  *stocked liquid KMBS-solution material* by ppm currently books an UNKNOWN-cost line with no depletion
  (no durable `so2SolutionPercentKmbs` field; `consumeMaterialCore` can't convert g→mL). Powder KMBS is
  fully correct. Needs a governed schema change + eng review — separate plan when prioritized, not now.

## ✅ Done recently

- **Plan 070 — vendor management — BUILT (12 units) + reviewed + browser-QA'd; SHIPPING.**
  Reused the existing (Phase 15 QBO) `Vendor` table + new `VendorContact` child (RLS + composite FK);
  `vendorId` on `CellarMaterial` + `SupplyLot`; backfill (Demo: 54 mats/106 lots, 0 nulls) with a seeded
  "Unknown" fallback; shared vendor cores (A/P find-or-create refactored to reuse); mandatory fuzzy
  `VendorPicker` with pinned "+ create new vendor" + URL autofill on Add/Edit expendable; `/setup/vendors`
  CRUD; assistant `create_vendor` + `query_vendors` (golden gate green). `/review` fixed 5 findings
  (no-vendor-reactivate wipe, restock-lot linkage, edit gate for legacy vendors, +2). Browser-QA'd on
  Demo (mandatory picker, pinned create, URL autofill, inline create-and-select, Unknown editable).
  Gates: tsc, 2034 vitest, lint, next build, verify:tenant-isolation (110/110 + vendor FK checks),
  eval:assistant, verify:naming — all green. Worktree made buildable (copied .env + npm ci).
- **Plan 068 — user inbox / Gmail-like messaging — SHIPPED, PR #191 merged (`2a139dd`).** Merged into
  this branch during the Plan 070 pre-ship merge (disjoint from vendor work).
- **SO₂ ~1.74× dosing money bug — RECONCILED CLOSED (2026-07-15, no code change).** Investigated on a
  fresh branch off `origin/main`: the money-critical fix already shipped. Plan 066 (PR #180, `370b7b6`,
  MERGED) divides the stock draw by the active fraction in `consumeMaterialCore` (÷0.576); Plan 065
  (PR #179) landed `resolveSo2Dose` — used **display-only**, so no double-application. `verify:cost`
  55/55 green (40 ppm × 450 L → 18 g SO₂ delivered, 31.25 g KMBS drawn, $1.56). Running `/work` on
  Plan 062 would have DOUBLE-APPLIED 0.576 and re-broken `verify:cost` — deliberately did not.
  Remaining Plan 062 scope (liquid-solution booking) is a feature gap → Off-path.

- **Feedback cmrm5x3lq "vineyard identification" — SHIPPED, PR #190 merged; ticket RESOLVED.**
  Assistant told admin Mike "the Bajo vineyard doesn't exist" — `resolveVineyards`
  (`src/lib/assistant/scope.ts`) used a one-directional SQL `contains`, so the stored name
  "Bajo" failed to match "Bajo Vineyard". Added pure `vineyardNameMatches` (two-directional,
  mirrors `findScopedBlocks`), match in JS after untouched access scoping. Proven on live data
  (scope preserved for non-admins) + tenant-isolation CI green; 7-case regression test;
  assistant suite 25f/145t green. Reviewed (1 LOW note: 200-vineyard fetch cap, non-issue at
  realistic counts). Also shipped the calculator display fix (PR #189, browser-QA'd).
- **bug-triage `/bug-triage` dry-run RAN LIVE this session — REMEDIATED.** `args` reached the workflow
  as a JSON *string*, so `args.dryRun` was `undefined` → `DRY_RUN=false`. It dispatched a real
  `feedback_bug_fix` run (calculator display) + `feedback_plan` run (harvest-pick deletion), dismissed
  the thumbs-down ticket, set 5 statuses. Nothing merged to `main`. All triage decisions were sound, so
  kept (not rolled back). The calculator fix run completed → **PR #189 "fix: display" open for review**
  (nothing to cancel). Vineyard ticket cmrm5x3lq updated to IN_PROGRESS/DEFECT + PR #190 note.
  Hazard memory hardened ([[bug-triage-dryrun-args-gotcha]]) — burned twice now.
- **Plan 067 PR A — agentic PLAN/FIX routing — SHIPPED, PR #181 merged** (`d2b504f`).
- **Plan 067 PR B — Linear handoff core — BUILT, PR #183 open.** Tenant-scoped/RLS-protected
  feedback-to-Linear links, sanitized handoff rules, conflict-safe link/replace actions, exact loaders,
  dual-cursor pagination, notes-version concurrency protection, and DB/isolation verification. No
  Linear API credentials are used; browser-facing workflow remains PR C.
- **Plan 066 — SO₂/KMBS ledger active-fraction fix — BUILT, eng-review PR (no auto-merge).**
  `consumeMaterialCore` gains an optional `activeFraction`; `recordNeutralDoseTx` passes it for
  ppm/mg/L SO₂ doses so the stock draw + cost = SO₂g/0.576 (KMBS), while `LotTreatment.computedTotal`
  stays delivered SO₂. Fraction from `percentActive` else 0.576. `verify:cost` flipped (31.25 g/$1.56)
  + green; cost-consume unit tests; WORKORDER-3 + invariants green; ADR 0005; read-only under-booking
  advisory. History NOT rewritten. Branch `claude/so2-kmbs-ledger-active-fraction`.
- **Plan 065 — SO₂ addition execution-view clarity — SHIPPED, PR #179 merged** (`df6c6dc`); browser-QA'd.
- **Feedback "SO2 work order unclear" — RESOLVED** (outcome note written; deeper money bug → Plan 066).
- **Plan 064 — bug-triage outcome notes — SHIPPED, PR #177 merged** (`39abefa`). Richer
  write-back (what+how / why+next) in the global workflow + SKILL.md (out-of-repo), and a
  visible outcome timeline + "Outcome" column + `resolvedAt` in `/developer`. New pure
  `parseTriageNotes` (6 tests). No schema (reuses `developerNotes`). Branch pruned; on main.
- Security #90 — cross-tenant user leak + account takeover. `src/lib/users/scope.ts` membership
  filter now scopes the `/users` page reads + all `users/actions.ts` mutators to the caller's
  effective tenant; `createUser` binds new users to the org; `resetUserPassword` gained the
  developer-target guard. Proven closed on live Bhutan/Demo data + isolation harnesses. On branch
  `claude/fix-90-cross-tenant-user-mgmt` → shipping now. Follow-up: TODOS "Per-tenant user role/state".
- Scale tripwire #166 — wrapped the 4 SERIALIZABLE work-order maintenance completion/undo
  txns in `withWriteRetry`. **SHIPPED, PR #172 merged** (`28331fd`); issue closed.
- Plan 063 developer user type (self-replicating) — **SHIPPED, PR #170 merged** (`1fda348`).
  Remaining: interactive browser QA only.

## ⏭️ Next up (candidates, not commitments)

- Browser QA pass on Plan 063 (developer user type).
- **Feedback log HTML-entity garbling** — SHIPPED #178 (`6bc2db1`).
- **Plan 065 — SO₂ addition execution-view clarity — BUILT, shipping.** Execute view is now
  summary-first + edit-gated ("Add 14 ppm SO₂ to Tank 4 → ≈ X L of 10% KMBS solution"); landed
  `resolveSo2Dose` (×0.576) on main; captured solutionPercentKmbs through NL/assistant authoring;
  new pure `buildTaskSummary`. Green locally: tsc, eslint, `next build`, vitest 1927. No schema.
  Branch `claude/addition-execution-view-clarity`. Remaining: CI + browser QA on `/work-orders/*/execute`.

---
_Last updated: 2026-07-15 — Plan 070 (WO mandatory Lead + editability) BUILT + rebased onto main (after vendor #195 + inbox #197); renumbered from 069. WO Lead mandatory (defaults to actor at createWorkOrderCore), builder requires it, admin/dev detail-page Edit, backfill script, WORKORDER-5 guard. Re-verifying post-rebase, then PR + merge. Pending: prod backfill (fixes #27) + browser-QA._
