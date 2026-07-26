# S2 ↔ S3a — the composite `factsAsOf` contract

**Status:** S2 side SHIPPED and frozen (PR-3). S3a must consume this shape; do not re-derive it.
**Source:** S2 plan K8 / council C1, and Open question 4 — *"the one cross-lane coordination item in
S2 — settle it in the first `/work` session, not at merge."* This file is that settlement.

---

## The shape

Exported from `src/lib/pesticide/types.ts` as `PesticideFactsAsOf`, returned on **every** successful
`lookupRegistration` read and on every not-ok result that has data behind it:

```ts
export interface PesticideFactsAsOf {
  publishedRevisionId: string;                 // the newest PUBLISHED PesticideDataRevision
  apprilAsOf: string | null;                   // ISO date — EPA APPRIL dump's own Last-Modified
  cdprAsOf: string | null;                     // ISO date — CA DPR product.dat's own Last-Modified
  resistanceArtifactSha256: string | null;     // sha256 of the committed resistance-codes.json
}
```

**ISO strings, not `Date`s** — deliberately. S3a snapshot-copies this object onto a spray record; a
JSON-round-trippable value is what survives that copy without a serialization seam.

## Why it is a composite and not a scalar

A single `revisionId` would be a **false contract**. One legality lookup spans four sources on
different cadences: the APPRIL dump (EPA publishes when it publishes), the CDPR `.dat` files
(nightly), the curated resistance artifact (changes only when a human reviews and commits it), and
the revision row itself. A scalar would imply they all moved together. They do not.

Each component is resolved **independently**: `getPesticideFactsAsOf` scans the recent `PUBLISHED`
revisions and takes the newest non-null value for each field. A null means *we have never published
that source*, not *it is current* — S3a must render a null as unknown, never as fresh.

## Rules for S3a

1. **Snapshot the resolved VALUES, not a pointer.** S3a's spray record stores what the grower was
   told at the time. `factsAsOf` rides along as provenance for that snapshot; it is not a key to
   re-query history with. S2 has no bitemporal history to point into, deliberately (K8: full
   `valid_from`/`valid_to` is over-build for S2 and solves a problem S3a does not have).
2. **Reads resolve only against `PUBLISHED` revisions** (council C8). A `RUNNING` or `FAILED` ingest
   never contributes a component, so a crashed run can never stamp a spray record with mixed
   old/new facts under a misleading date.
3. **Store `provenance` alongside it.** The union is `"registry" | "grower-supplied"`, already full
   from day one (council C4 — widening a literal union later breaks exhaustive consumers). S2 only
   ever produces `"registry"`; S2b's tenant override produces the other arm.
4. **A null component is not a failure.** Render it as "unknown" and keep going.

## Changing this shape

Adding a field is safe (S3a reads what it knows). **Removing or renaming one is a breaking change
across two lanes** — coordinate before, not at merge. If a fifth source joins (an NY/OR/WA state
layer, per S2 Open question 5), it gets its own `<source>AsOf` field; do not overload `cdprAsOf` into
a generic "state" slot.
