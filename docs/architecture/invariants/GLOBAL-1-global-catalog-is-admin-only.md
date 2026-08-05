---
id: GLOBAL-1
group: tenancy
severity: high
enforcedBy: app-code
verify: "npm run verify:global-catalog-admin"
decision: "Code-health review 2026-08-05 (finding 1, second branch); interim fence pending Phase 23 / plan 092"
status: guarded
appliesTo:
  - src/lib/reference/
  - src/lib/locations/
  - src/lib/vessels/
  - src/lib/inventory/
  - src/lib/spray/
tags:
  - invariant
---

# GLOBAL-1 — a tenant-global catalog write is admin-only

> [!warning] Invariant (high, app-code)
> The entities `src/lib/assistant/entities.ts` marks `vineyardScoped: false` — Variety, Location, FinishedGoodCategory, Vessel, WineSku, FinishedGood — are ADMIN-ONLY to create or edit, in every write path. `assertScoped` in both `db-update.ts` and `db-create.ts` ends in `else if (!isTenantAdminLike(user)) throw "Only an admin or developer can change global records."`, so a GUI action mutating the same rows must reach the same gate. The line is CATALOG vs OPERATIONAL: editing the vessel catalog is admin, racking wine between vessels is not.

**Guarded by:** `npm run verify:global-catalog-admin`
**Decision:** Code-health review 2026-08-05 — see [[INVARIANTS]] and [[VINEYARD-1-vineyard-membership-fence]].
**Applies to:** `src/lib/reference/`, `src/lib/locations/`, `src/lib/vessels/`, `src/lib/inventory/`, `src/lib/spray/`

This is the **second branch of the same rule** as [[VINEYARD-1-vineyard-membership-fence]]. That
invariant closed the `if (entity.vineyardScoped)` side; this one closes the `else`. Before it, 13 GUI
writes let any authenticated user rename the tenant's varieties, add or deactivate locations, add or
retire a tank, and create finished goods and categories — all of which the assistant refused them.

**`reference/actions.ts` is the interesting case and must stay polymorphic.** Its `RefKind` is
`"variety" | "vineyard"` — one global entity and one vineyard-scoped one — so a blanket `adminAction`
would have been *wrong in the other direction*, locking managers out of editing their own vineyard,
which the assistant explicitly permits. Its gate resolves per kind: variety → admin, vineyard → D9
membership, and any *create* → admin (a create has no row to derive scope from, and db_create reaches
the same conclusion because a non-admin create carries no in-scope `vineyardId`). That module is
therefore also listed in VINEYARD-1's guard — it mutates Vineyard rows, which the first VINEYARD-1 sweep
missed because the module name gives no hint.

**Where the line is NOT drawn.** Operational paths stay open, and the assistant is the reference for
that too: `adjust-inventory` and `adjust-consumable` are not `adminOnly`, so stock movements, on-hand
corrections and receipts are non-admin here as well (each is listed with its reason in the guard's
ALLOWED map). `findOrCreateWineSku` is deliberately untouched — it runs inside a bottling flow, and
admin-gating it would block bottling for cellar staff; the admin rule is about *catalog editing*, not
about a SKU materialized as a side effect of production. Equally, the dedicated assistant creators for
entities OUTSIDE the six (`create-grower`, `create-custom-unit`, `create-vendor`, `create-material`) are
NOT `adminOnly`, so those modules are deliberately absent here: for them non-admin creation is a product
decision, not an oversight.

**The regulatory case folded in with this.** `upsertTenantProductFacts` (`src/lib/spray/actions.ts`)
writes the tenant's `worstCaseReiHours`, `worstCasePhiDays`, `minRepeatIntervalDays` and
`maxApplicationsPerSeason` — worker re-entry and pre-harvest intervals, snapshotted onto every spray
record written afterwards. It was gated by `requireReadyUser()` alone. That is the **authorization side
of [[PEST-1-gap-is-not-a-clearance]]** (critical): PEST-1 stops the data path from rendering an unknown
as a clearance, but an unprivileged user could achieve the same outcome by typing a number. The
invariant was enforced against bad data and not against bad authorization. `TenantProductFacts` has no
vineyard column, so this is an admin fence rather than a D9 one, and the exemption is recorded with its
reason in `scripts/check-vineyard-scope.ts`.

Like VINEYARD-1 this is app-layer with zero DB enforcement. Plan 092 replaces role checks with a
capability matrix (`configure` on the settings/reference domains); when it lands, supersede this note
rather than deleting it.
