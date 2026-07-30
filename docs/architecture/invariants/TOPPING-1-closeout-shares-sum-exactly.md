---
id: TOPPING-1
group: cellar-topping
severity: critical
enforcedBy: pure-code
decision: "RFC-002 §3.3/§3.4"
status: planned
appliesTo:
  - src/lib/cellar/
  - src/lib/ledger/
tags:
  - invariant
---

# TOPPING-1 — derived topping shares sum exactly, with no dust

> [!danger] Invariant (critical, pure-code) — PLANNED, not yet in force
> Every derived per-barrel topping share sums **exactly** to the volume actually drawn from the keg
> (`fill.volume − keg remaining balance`) at **centilitre** granularity, allocated by
> largest-remainder. No residue, no fabricated volume.

**Guarded by:** _planned_ — intended guard `npm run verify:keg-closeout`, an arithmetic proof over
a synthetic close-out. Pairs with [[LEDGER-8-no-fabricated-volume]].

**Status:** `planned` until RFC-002 close-out lands. Flip to `guarded` + add `verify:` then.

**Decision:** RFC-002 §3.3/§3.4 — see [[INVARIANTS]] and [[ADR-0013]].
**Applies to:** `src/lib/cellar/`, `src/lib/ledger/`

**Why critical.** `LotOperationLine.deltaL` is `Decimal(10,2)` (`prisma/schema.prisma:2694`), so
naive even division does not close: 30 L ÷ 21 = 1.43 at 2dp, and 21 × 1.43 = 30.03. The 0.03 L
residue is *above* `FUNCTIONAL_ZERO_L` (0.01 L), so LEDGER-8's sweep will not absorb it and it
lingers as dust — exactly what LEDGER-8 forbids. Use the existing integer-centilitre
largest-remainder helper `computeProportionalDraw` (`src/lib/bottling/draw.ts:33`) with equal
weights; it already asserts an exact sum. Consequence: shares are **not all equal** (some 1.43 L,
some 1.42 L), and no UI may claim otherwise.

**Scope.** This governs close-out. It does **not** hold after a partial re-fan correction, where
`LEDGER-3`/`LEDGER-11` may leave some barrels unadjusted by design — see RFC-002 §3.6.1.
