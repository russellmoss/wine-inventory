---
id: SPRAY-4
group: spray-record
severity: high
enforcedBy: database
verify: "npm run verify:spray-record"
decision: "S3a KD-8 (council D4 / C4 / G4)"
status: guarded
appliesTo:
  - prisma/schema.prisma
  - src/lib/harvest/
tags:
  - invariant
---

# SPRAY-4 — the planned harvest date is an audited event stream

> [!warning] Invariant (high, database)
> A planned harvest date is never mutable intent: every change closes the open interval row and
> appends the next version (Shape D); at most ONE open row per (block, vintage, passLabel) —
> partial unique index — and ZERO open rows is how "no planned date" is represented. Point-in-time
> reads answer "what did we believe on 3 July". The stream IS the outbox: S7a's PHI reverse-check
> consumes `plannedHarvestChangesSince(cursor)` as a watermark — there is no in-process listener
> to lose on a crash. Split picks coexist under distinct pass labels; PHI evaluates against the
> EARLIEST open date.

**Guarded by:** `npm run verify:spray-record`
**Decision:** S3a KD-8 — see [[INVARIANTS]].
**Applies to:** `prisma/schema.prisma`, `src/lib/harvest/`
