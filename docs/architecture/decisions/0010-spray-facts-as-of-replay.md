# ADR 0010 — Spray facts-as-of replay semantics (S3a)

**Status:** accepted (2026-07-26, S3a build — plan KD-3/KD-4/KD-14, council-reconciled)
**Context docs:** `docs/spray_assistant/phases/S3a-spray-record-plan.md` ·
`docs/spray_assistant/phases/S3a-council-feedback.md` · runbook rule §3.8

## Context

Every spray record's material line needs the product facts that were true WHEN THE DECISION WAS
MADE — resolved active ingredients, resistance groups, PHI/REI, rainfast period, mobility class.
The registry (S2/S2b) refreshes monthly; labels change; products get de-registered. A decision
made in September must still mean in November exactly what it meant in September, because PHI
checks, rotation budgets, residual clocks, and regulator questions all replay it later.

## Decision

1. **Snapshot at entry, on the line** (KD-4, the `BottlingCostSnapshot` pattern): discrete typed
   columns for anything engines query (`snapshotPhiDays`, `snapshotReiHours`,
   `snapshotRainfastHours`, `snapshotMobilityClass`), Postgres `String[]` + GIN for set-membership
   reads (`snapshotResistanceGroups`, `snapshotActiveIngredientKeys`), one Json for the
   human-readable AI decomposition, and **an Int watermark (`factsRevision`) + `factsAsOf` naming
   which facts** — never "current facts at read time".
2. **Unknown is a database-enforced state, not a convention** (council C7 — invariant SPRAY-3):
   `resistanceGroupsKnown` / `activeIngredientsKnown` booleans with CHECKs make
   `[] ∧ known=true` impossible and force both flags for `factsCompleteness = KNOWN`. An empty
   array can never read as "no groups used".
3. **A correction COPIES the predecessor's snapshot verbatim** — `factsRevision` and `factsAsOf`
   included — and re-resolves **only a line whose own product identity changed**
   (`epaRegistrationNumber` / `tenantProductRef` / `productName`). Per-line, not per-document.
   (KD-14 — this REVERSES the plan's original re-resolve-on-correction design, per council G1:
   fixing a ground-speed typo in November must not repaint a July spray with November's
   registration data.)
4. **Facts arrive through an injected port** (`ProductFactsResolver.resolveMany`,
   `src/lib/spray/product-facts-port.ts`); S3a ships the null resolver, so *unknown-never-clear*
   (rule §3.6) is current tested behavior, not a promise. S2b registers the real resolver;
   existing rows simply stay at their revision — a later widening never invalidates them.

## Consequences

- Replay is exact: any engine reading a material line sees the facts-as-of-then, forever.
- A monthly registry refresh changes NOTHING retroactively; divergence between current facts and
  a snapshot is surfaced as a flag (S9), never silently reconciled.
- Whole-document correction is semantically free (the snapshot copies), which is what closed the
  per-line-correction design question (council CQ1).
- Guard: `npm run verify:spray-record` assertion 6 (header-only correction leaves every line's
  `factsAsOf`/`factsRevision` byte-identical; an identity change re-resolves that line alone).
