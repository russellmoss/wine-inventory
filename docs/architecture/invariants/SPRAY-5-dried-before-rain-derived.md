---
id: SPRAY-5
group: spray-record
severity: high
enforcedBy: core
verify: "npm run verify:spray-record"
decision: "S3a KD-2 (council S3)"
status: guarded
appliesTo:
  - src/lib/spray/
tags:
  - invariant
---

# SPRAY-5 — driedBeforeRain is derived, never self-reported

> [!warning] Invariant (high, core)
> Whether a spray dried before rain is COMPUTED (from the block's own finish time + hourly
> precipitation through the injected port), or it is UNKNOWN — it is never typed in as truth. With
> no series the answer is null + INSUFFICIENT_DATA. A human correction is an ATTRIBUTED
> append-only `spray_drying_override` row (who/when/why retained, latest wins, trigger allowlists
> nothing) — never a mutable column. A block line with a null `finishedAt` resolves REI and
> residual to UNKNOWN and never falls back to the header timestamp (council G2/C14).

**Guarded by:** `npm run verify:spray-record`
**Decision:** S3a KD-2 / council S3 — see [[INVARIANTS]].
**Applies to:** `src/lib/spray/`
