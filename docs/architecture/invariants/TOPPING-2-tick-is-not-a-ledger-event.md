---
id: TOPPING-2
group: cellar-topping
severity: high
enforcedBy: schema
decision: "RFC-002 §3.2"
status: planned
appliesTo:
  - src/lib/cellar/
tags:
  - invariant
---

# TOPPING-2 — a tick is never a ledger event

> [!warning] Invariant (high, schema) — PLANNED, not yet in force
> A `topping_tick` is a **pre-ledger intent record**. No tick row may reference a `LotOperation`,
> and no UI may describe a tick as recorded to the ledger. Until the keg closes out, **no volume
> has been asserted** — the tick says "this barrel was topped", never "this much wine moved".

**Guarded by:** _planned_ — intended guard `npm run verify:tick-is-not-ledger`, a schema test in the
shape of `test/commerce7-schema.test.ts` (which fails if a forbidden column ever appears).

**Status:** `planned` until the `topping_tick` table exists. Flip to `guarded` + add `verify:` then.

**Decision:** RFC-002 §3.2 — see [[INVARIANTS]] and [[TOPPING-1-closeout-shares-sum-exactly]].
**Applies to:** `src/lib/cellar/`

The UI language for a tick is "topped"; receipt language belongs only to close-out (RFC-002 AC-10).
Note the table is append-only-ish, and new tables arrive with `UPDATE`/`DELETE` already granted to
`app_rls` — the migration must **explicitly REVOKE**, not merely decline to grant.
