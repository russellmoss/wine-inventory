# NOW

> The working-set spine. The ONE file that answers "where was I?" on resume.
> Long-horizon lives in `ROADMAP.md`; parked ideas in `TODOS.md`; decisions in the
> context-ledger. This file is only **today / in-flight**. Keep it short — if it grows
> past a screen, something belongs in TODOS.md or the roadmap instead.

## 🎯 Current objective  (ONE thing)

Ship the #90 security fix — cross-tenant user-management leak/takeover (app-layer membership scoping).

## 🧵 Tangent stack  (LIFO — push when you detour, pop when done)

1. ← you are here

## 🪝 Off-path — do NOT do now

_Anything that shows up mid-build and isn't the objective goes to `TODOS.md` or a task
chip, not into this session. Nothing parked right now._

## ✅ Done recently

- **Plan 064 drafted** — bug-triage outcome notes: richer write-back (what+how / why+next)
  + a visible outcome timeline in `/developer`. No schema (reuses `developerNotes`). 4 units.
  `docs/plans/2026-07-14-064-feat-bug-triage-outcome-notes-plan.md`. **Awaiting approval** to `/work`.
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

- **Plan 062 SO₂-solution dosing — Units 2–9** (Unit 1 shipped; branch
  `claude/so2-solution-dosing`). Fixes the ~1.74× KMBS under-dose bug.
- Browser QA pass on Plan 063 (developer user type).
- **Plan 064 — bug-triage outcome notes** (drafted, awaiting approval): `/work` the 4 units.

---
_Last updated: 2026-07-14 — Plan 064 (bug-triage outcome notes) drafted, awaiting approval._
