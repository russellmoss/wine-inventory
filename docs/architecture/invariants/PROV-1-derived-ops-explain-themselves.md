---
id: PROV-1
group: provenance
severity: high
enforcedBy: core
decision: "RFC-003 §3.3"
status: planned
appliesTo:
  - src/lib/ledger/
  - src/lib/cellar/
tags:
  - invariant
---

# PROV-1 — a derived quantity always explains itself, and is never silently promoted

> [!warning] Invariant (high, core) — PLANNED, not yet in force
> Any `LotOperation` written with `captureMethod = DERIVED` carries enough in `metadata` to
> recompute its magnitude exactly (`{ method, divisor, fillVolumeL, kegFillId, computedAt }`).
> A derived quantity is **never silently promoted to measured**: if someone measures the real value
> later, that is a `CORRECTION` with a stated reason, not an in-place reclassification. The same
> rule binds `NOMINAL` — an accepted stamped volume is never quietly relabelled `MANUAL`.

**Guarded by:** _planned_ — intended guard `npm run verify:provenance`, asserting every `DERIVED`
operation carries a well-formed `metadata.derivation`.

**Status:** `planned` — `CaptureMethod.DERIVED` does not exist yet (RFC-003, migration M1).
Flip to `guarded` + add `verify:` as part of that phase's definition of done.

**Decision:** RFC-003 §3.3 — see [[INVARIANTS]] and [[TOPPING-1-closeout-shares-sum-exactly]].
**Applies to:** `src/lib/ledger/`, `src/lib/cellar/`

**Grain.** `captureMethod` is a per-**record** scalar (`prisma/schema.prisma:2653`);
`LotOperationLine` has no such column. This invariant is therefore stated at **operation** grain,
which is sufficient because the RFC-002 close-out shape makes every operation
provenance-homogeneous (see [[ADR-0013]]). A mixed-provenance operation would put this invariant out
of reach — which is a reason to reject such an operation, not to add a column.

**Provenance is a trinary, not a binary** (owner decision, 2026-07-29 — RFC-003 §3.6): `MANUAL`
= measured, **`NOMINAL`** = a stated capacity accepted as-is, `DERIVED` = computed. A figure derived
FROM a nominal input stays `DERIVED`, but its `metadata` explanation must name the nominal source so
the weakest link in the chain stays visible rather than being averaged away.

**Scope caution.** `CaptureMethod` is shared by six models across the ledger, lab, tasting and
**spray-record** domains. `DERIVED` is meaningful only on `LotOperation` and `LotStateEvent`; it is
refused at the core elsewhere (RFC-003 §3.3 rule 6) so provenance cannot drift into records governed
by [[SPRAY-2-facts-as-of-snapshot]].
