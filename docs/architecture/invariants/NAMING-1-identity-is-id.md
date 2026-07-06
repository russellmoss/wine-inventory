---
id: NAMING-1
group: naming
severity: critical
enforcedBy: app-code
verify: "npm run verify:naming"
decision: "Decision 2 / council 3.7 / §B.1(ii)"
status: guarded
appliesTo:
  - src/lib/lot/
tags:
  - invariant
---

# NAMING-1 — identity is `id`, never `code`

> [!danger] Invariant (critical, app-code)
> Lot identity is the surrogate `id`. `code`/`displayName` uniqueness is a per-tenant UX constraint, not an identity constraint (`code` unique-per-tenant, `displayName` non-unique); a code collision is a label error the system OFFERS (never silently applies) to auto-disambiguate; nothing in lineage/cost/ledger may join on `code`.

**Guarded by:** `npm run verify:naming` (Phase 1) — asserts the collision OFFER (not silent), a non-unique `displayName`, and a static scan that no lineage/cost/ledger source joins on `code`.
**Decision:** Decision 2 / council 3.7 / SYNTHESIS §B.1(ii) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/lot/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Naming & identity presentation); `npm run verify:invariants` asserts
guarded invariants' guards exist; the `appliesTo` paths drive the auto-context hook that
surfaces this rule before any edit to the governed code.
