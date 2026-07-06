---
id: NAMING-2
group: naming
severity: critical
enforcedBy: app-code
decision: "§B.1(iii) / council 3.7"
status: planned
appliesTo:
  - src/lib/lot/
  - src/lib/ledger/
tags:
  - invariant
---

# NAMING-2 — honest rename (append-only, never rewrites snapshots)

> [!danger] Invariant (critical, app-code) — PLANNED
> A rename is an append-only `LotCodeEvent` (`fromValue`/`toValue`/`actor`/`observedAt`/`commandId`) that NEVER rewrites `LotOperationLine` code snapshots. Current-state reads resolve `id → current code/displayName`; historical reads show the as-recorded code plus a "renamed → X / also-known-as" affordance. All user-facing lookup by `code` MUST resolve to `id` first, then read history by `id` — never join on the mutable `code`.

**Guarded by:** _planned_ — will be verify-guarded **exactly like [[LEDGER-10-immutable-operations|LEDGER-10]]**; guard `npm run verify:naming` lands in **Phase 1** and flips this note to `status: guarded`. Currently unguarded by design (checker skips notes with no `verify:`).
**Decision:** SYNTHESIS §B.1(iii) / council 3.7 — see [[INVARIANTS]] and [[system-map]].
**Applies to:** `src/lib/lot/`, `src/lib/ledger/`

This note is the machine-readable face of the invariant. The narrative lives in
[[INVARIANTS]] (§ Naming & identity presentation); `npm run verify:invariants` asserts
guarded invariants' guards exist; the `appliesTo` paths drive the auto-context hook.
