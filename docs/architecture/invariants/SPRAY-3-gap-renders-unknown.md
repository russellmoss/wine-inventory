---
id: SPRAY-3
group: spray-record
severity: critical
enforcedBy: database
verify: "npm run verify:spray-record"
decision: "S3a KD-4 (council C7); runbook rule §3.6"
status: guarded
appliesTo:
  - prisma/schema.prisma
  - src/lib/spray/
  - src/lib/fieldnotes/legacy-spray-core.ts
tags:
  - invariant
---

# SPRAY-3 — a coverage gap renders as UNKNOWN, never as clear

> [!danger] Invariant (critical, database)
> An unknown product, an unresolved AI, or a missing spray record must read as UNKNOWN — never
> "no restriction" and never "no groups used". Enforced at the DATABASE: `snapshotResistanceGroups
> = []` can only coexist with `resistanceGroupsKnown = false` (CHECK), and `factsCompleteness =
> KNOWN` requires both knownness flags (CHECK). In the read core, `rotationContribution` keys off
> the knownness flag and never returns an empty group list; an unconfirmed legacy spray BLOCKS a
> rotation-OK claim rather than granting one.

**Guarded by:** `npm run verify:spray-record`
**Decision:** S3a KD-4 / council C7 — the most important finding in the S3a review.
**Applies to:** `prisma/schema.prisma`, `src/lib/spray/`, `src/lib/fieldnotes/legacy-spray-core.ts`
