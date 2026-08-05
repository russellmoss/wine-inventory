---
id: VINEYARD-1
group: tenancy
severity: high
enforcedBy: app-code
verify: "npm run verify:vineyard-scope"
decision: "Code-health review 2026-08-05 (finding 1); interim fence pending Phase 23 / plan 092"
status: guarded
appliesTo:
  - src/lib/vineyard/
  - src/lib/weather/
  - src/lib/spray/
  - src/lib/soil/
  - src/lib/spatial/
  - src/lib/plantingArea/
  - src/lib/harvest/
tags:
  - invariant
---

# VINEYARD-1 — the vineyard-membership fence is complete, not partial

> [!warning] Invariant (high, app-code)
> Every exported server action in a vineyard-scoped module resolves its caller-supplied id back to a vineyard and applies `canAccessVineyard` (D9): an admin/developer reaches every vineyard in the tenant, a manager (`role: "user"`) only the vineyards in their membership set. A manager with an EMPTY membership set reaches nothing, never everything. Postgres does NOT enforce this — RLS scopes by TENANT — so it holds only where the action layer applies it, and a module that skips it is a silent intra-tenant leak.

**Guarded by:** `npm run verify:vineyard-scope` (static) **+** `npm run verify:vineyard-scope-db` (runtime, CI job `vineyard-scope-db`)
**Decision:** Code-health review 2026-08-05 (finding 1) — see [[INVARIANTS]] and [[TENANT-1-rls-isolation]].
**Applies to:** `src/lib/vineyard/`, `src/lib/weather/`, `src/lib/spray/`, `src/lib/soil/`, `src/lib/spatial/`, `src/lib/plantingArea/`, `src/lib/harvest/`

The fence used to exist in 8 files and be absent everywhere else, so weather, spray, soil, planting
areas, NDVI and block CRUD authorized to TENANT only — 53 exported actions. A manager assigned to
vineyard A could read and mutate vineyard B's blocks, geometry, weather config, spray records and soil.

**The proof it was a bug and not a policy** is internal: `src/lib/assistant/entities.ts` marks exactly
two entities `vineyardScoped: true` (`Vineyard`, `VineyardBlock`) and
`src/lib/assistant/tools/db-update.ts` already refused out-of-scope edits to them ("You can only edit
records in your assigned vineyard"). So for the same rows the ASSISTANT path was stricter than the GUI
path. Separately, `src/lib/harvest/actions.ts` gated all five of its mutations while its own domain
sibling `planned-harvest-actions.ts` gated none.

Two shapes, and the difference matters:
- **A keyed action** (one vineyard/block/planting area/spray record) THROWS `FORBIDDEN` out of scope.
  Returning an empty result instead would disguise a denial as "no data".
- **A list read** (season board, planned-harvest board, block picker) FILTERS to the reachable set. A
  manager legitimately sees a subset, and throwing would blank a working screen. `narrowVineyardFilter`
  is the seam: an explicit id must be in scope (it throws, so a crafted id cannot widen a read), an
  absent id means "everything I reach", and a manager with no memberships gets `[]` — never `null`,
  which callers read as "no predicate needed".

A spray pass may legitimately span sites (`record-core.ts` computes `isCrossSite`), and the header
`vineyardId` is only "defaulted from the FIRST block line". So spray gates on the **footprint** — every
vineyard the record's block lines touch — not the header, and writes gate on the blocks named in the
payload. Trusting the header would let a manager name their own vineyard while spraying another site.

**The proof is in three parts, and no one of them is sufficient.**
1. `verify:vineyard-scope` — static AST, every PR, no DB: every exported action REACHES a gate. It cannot
   tell whether the gate resolves the *right* vineyard.
2. `verify:vineyard-scope-db` — runtime, CI job `vineyard-scope-db`, run AS `app_rls` (NOBYPASSRLS): the
   FK paths resolve correctly against real rows, a cross-site spray record reports BOTH its vineyards,
   and the membership set actually LOADS. That last check is not paranoia — per the security register
   (2026-07-26) `vineyardIds` was silently `[]` for every user under `app_rls`, and an empty set makes
   every deny-check vacuously pass, so a totally broken fence looks identical to a working one.
3. `test/vineyard-scope.test.ts` — unit: the fail-closed decision logic.

The gates reach `getActionUser()` → `headers()` and so only run inside a request; the runtime script
therefore imports `scope-core.ts`, the script-safe half (no `next/*`, no `dal`, no `"use server"`). That
split exists precisely so parts 1 and 2 can both be real — importing `scope.ts` from a `tsx` process dies
loading Next's client router context (`React.createContext is not a function`) before reaching a database.

**This is NOT plan 092.** It is an app-layer fence with zero DB enforcement, so it holds only for
traffic through these actions. Plan 092 (Phase 23) replaces the mechanism with a capability matrix plus
a RESTRICTIVE RLS quad that Postgres enforces, and its own problem frame says this scoping was
"app-layer, partial, and opt-in". This invariant makes it complete rather than partial in the meantime,
and the guard keeps it from going partial again. When 092 lands, the fence moves to the database and
this note should be superseded rather than deleted.
