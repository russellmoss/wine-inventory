---
id: SPRAY-6
group: spray-record
severity: critical
enforcedBy: database
verify: "npm run verify:product-facts"
decision: "S2b KD-1/KD-3/KD-4/KD-10 (council C1, C5); runbook rules §3.1, §3.6, §3.9"
status: guarded
appliesTo:
  - prisma/schema.prisma
  - src/lib/pesticide/
  - src/lib/spray/product-facts-port.ts
  - src/lib/spray/facts-snapshot-core.ts
tags:
  - invariant
---

# SPRAY-6 — a product with no CURRENT curated facts resolves to unknown, never to permitted

> [!danger] Invariant (critical, database)
> The product-facts resolver may never turn absence, staleness, or a withheld source into a value.
> Four distinct paths, each independently guarded:
>
> 1. **No facts row → UNKNOWN.** `resolveMany` is index-aligned and never throws; an unresolvable
>    product returns `UNRESOLVED_PRODUCT_FACTS` (`source: NONE`, every field null). A resolver
>    failure degrades the record, it does not block the grower from recording what they applied.
> 2. **Stale → contributes nothing, and says so.** A fact group past its `reviewDueAt` has its own
>    fields dropped and is flagged `staleAtWrite`. It therefore can never push `factsCompleteness`
>    to `KNOWN`. Sibling groups and S2's registry identity are untouched — they are different
>    sources on different cadences (KD-11).
> 3. **Exactly one ACTIVE row per (epaRegNumber, factGroup)**, enforced by a partial unique index
>    (`WHERE supersededAt IS NULL`). The frozen `ProductFactsKey` carries no version selector, so
>    without this the resolver would have no deterministic answer and "pick the latest" would
>    silently choose (council C1).
> 4. **A malformed registration number never near-misses.** Keys are canonicalized through the same
>    typed parser the legality read uses (K6); a malformed number produces no canonical form, so it
>    matches nothing rather than matching something plausible.
>
> Two provenance rules ride along and are equally load-bearing:
> **a proposal is not a fact** — a row with `reviewedBy: null` (what the CDPR seeder writes) is not
> curated coverage, because a curated row's reviewer is a human signature on a legal fact
> (rule §3.1); and **grower-supplied facts are never gated on the `epa-pesticide` toggle**
> (KD-4) — that gate protects a source we ship, and applying it to data the grower typed would
> re-brick the non-US tenant, which is the failure council C6 promoted to critical.

**Guarded by:** `npm run verify:product-facts` (22 assertions) plus the widened K7 boundary test,
which enumerates every exported registry-backed read and fails if a new one is left unclassified
(council C5 — the original guard proved the gate inside one function only).

**Decision:** S2b plan v2.3, KD-1 / KD-3 / KD-4 / KD-10, council C1 + C5.
**Applies to:** `prisma/schema.prisma`, `src/lib/pesticide/`, `src/lib/spray/product-facts-port.ts`,
`src/lib/spray/facts-snapshot-core.ts`
