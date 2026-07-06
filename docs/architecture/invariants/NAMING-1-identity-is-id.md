---
id: NAMING-1
group: naming
severity: critical
enforcedBy: app-code
decision: "Decision 2 / council 3.7 / §B.1(ii)"
status: planned
appliesTo:
  - src/lib/lot/
tags:
  - invariant
---

# NAMING-1 — identity is `id`, never `code`

> [!danger] Invariant (critical, app-code) — PLANNED
> Lot identity is the surrogate `id`. `code`/`displayName` uniqueness is a per-tenant UX constraint, not an identity constraint (`code` unique-per-tenant, `displayName` non-unique); a code collision is a label error the system OFFERS (never silently applies) to auto-disambiguate; nothing in lineage/cost/ledger may join on `code`.

**Guarded by:** _planned_ — guard `npm run verify:naming` lands in **Phase 1**, which flips this note to `status: guarded` and adds the `verify:` field. Until then this note is intentionally unguarded (the checker skips notes with no `verify:`).
**Decision:** Decision 2 / council 3.7 / SYNTHESIS §B.1(ii) — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/lot/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Naming & identity presentation); `npm run verify:invariants` asserts
guarded invariants' guards exist; the `appliesTo` paths drive the auto-context hook that
surfaces this rule before any edit to the governed code.
