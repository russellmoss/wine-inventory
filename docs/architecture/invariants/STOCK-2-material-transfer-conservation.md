---
id: STOCK-2
group: cost
severity: critical
enforcedBy: pure-code
verify: "npm run test -- material-stock"
decision: "plan-080"
status: guarded
appliesTo:
  - src/lib/cellar/material-stock-core.ts
  - src/lib/cost/consume.ts
tags:
  - invariant
---

# STOCK-2 — a consumable move conserves quantity AND value

> [!danger] Invariant (critical, pure-code)
> Moving a consumable between locations creates and destroys nothing. A transfer is a FIFO **lot-split**:
> Σ`qtyRemaining` is unchanged across the move, and each destination lot inherits its source lot's
> `unitCost`, `receivedAt`, `expiresAt`, `vendorId`, `policyVersion` and FX quintet — so Σ(qty × unitCost)
> is unchanged too. A split lot points back via `splitFromLotId`; provenance derives transitively through
> that edge and is never row-copied.

**Guarded by:** `npm run test -- material-stock` (`test/material-stock.test.ts`)

## Why it exists

Location was added to consumables in plan 080. The tempting implementation — decrement here, increment
there — silently destroys cost lineage: the destination stock either loses its unit cost (valuing at $0 or
UNKNOWN) or gets re-priced at today's average, which back-dates a cost change onto stock that never moved
in value. The lot-split keeps physical location and cost basis on the SAME row, so a move is a pure
partition of existing lots.

## What breaks it

- Creating the destination lot from a weighted average instead of the SOURCE lot's own `unitCost`
  (blends distinct FIFO layers into one and destroys age).
- Copying `LotDocument`/COA rows onto the split instead of relying on `splitFromLotId` — later-added
  source documents would then not resolve, and delete semantics diverge.
- Stamping `receivedAt = now()` on the destination, which makes moved stock look freshly received and
  reorders every subsequent FIFO draw.
- Letting a transfer draw a lot negative. Negative `qtyRemaining` is reserved for the CONSUME
  reconcile path (a dose past a location's on-hand, booked at a KNOWN weighted-avg); a deliberate
  user transfer must BLOCK with the specific shortfall instead.
