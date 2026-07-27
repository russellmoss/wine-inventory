# S2b — Product Facts Master: phase report

**Program:** Spray Intelligence · [runbook](../SPRAY_ASSISTANT_RUNBOOK.md) §9 S2b
**Plan:** [S2b-product-facts-master-plan.md](S2b-product-facts-master-plan.md) (v2.3, resumption §0 added 2026-07-27)
**Council:** [S2b-council-feedback.md](S2b-council-feedback.md)
**QA:** [qa/S2b-qa-report.md](../qa/S2b-qa-report.md)
**Status:** 🟨 **Foundation + Units 1/2/3/5 built and DB-proven. Phase not closed** — coverage is 0%
by design (no human-curated content yet), so S7a and S6 stay blocked per the pre-committed thresholds.

## What shipped

**Foundation (2026-07-26, PR [#535](https://github.com/russellmoss/wine-inventory/pull/535)):**
schema (8 new tables/relations), the real `ProductFactsResolver` wired at the composition root,
pest-vocabulary ingest (41 categories / 42,132 mappings), the coverage report, `verify:product-facts`
(22 assertions), the monthly drift-detector cron hook.

**Resumption (2026-07-27, this branch):**

| Unit | What | Proof |
|---|---|---|
| **3** — separation.ts | Pure evaluator: unions both labels' rules for the relevant direction, returns the most restrictive as evidence (never a verdict — S7b decides). Prevents two failure modes: a second oil inheriting JMS Stylet-Oil's rules, and a CLASS-targeted rule silently reading as "no restriction" when the candidate is unclassified (council G5). | 14 goldens on the brief's own JMS Stylet-Oil worked example (§8.2). |
| **1** — jurisdiction | `resolveJurisdiction`/`resolveJurisdictionBatch` (ungated by design — farm metadata, not registry content); vineyard settings form gets propose-from-GPS (keyless Photon reverse-geocode) + explicit confirm; `spray_block_line` snapshots jurisdiction at record AND correction time, resolved *before* the transaction opens. | `verify:spray-record` assertion group 15 (new): confirmed jurisdiction snapshots correctly; a cross-site pass resolves each vineyard independently; editing a vineyard's jurisdiction after the fact never changes an already-written snapshot (rule §3.8); a later pass picks up the edit fresh; the null-resolver default never fabricates one. |
| **2** — facts artifact | `cdpr-parse.ts` gains PHI/REI parsing (unit-keyed nullity — a blank unit means "not recorded", never a zero); `product-facts-derive.ts`'s most-restrictive-recorded rollup across a product's conflicting grape-site rows; `product-facts-artifact.ts`'s discipline validator (council S5's REGULATORY-can't-cite-extension / AGRONOMIC-can't-cite-EPA-label falsification case); `seed-product-facts.ts` (replay / `--propose` / `--dry-run`). | Live-tested against real CDPR data: 1072 proposals, reproducing the probe's own oracle exactly (Pristine 7969-199 → 14-day PHI / 12-hour REI). **Not committed** — see Deviations. |
| **5** — tenant-facts entry surface | `/vineyards/sprays/products` page + `listTenantProductFacts`/`upsertTenantProductFacts`; a spray material line gets a "Custom product ref" field, threaded through record + correction. | 5 new `verify:tenant-isolation` cases: RLS, WITH CHECK, mutable UPDATE (same-tenant allowed / cross-tenant refused), and the KD-3 composite-key upsert never duplicating a row. |

## Gate evidence

tsc clean · full vitest suite 4,959 pass (one pre-existing, previously-documented whole-suite-contention
flake unrelated to this work) · `verify:spray-record` 15/15 · `verify:pesticide` 31/31 ·
`verify:product-facts` 22/22 · `verify:tenant-isolation` all green incl. 6 new cases ·
`verify:ai-native` green, zero new allowlist entries spent (KD-7 held — none of the four new modules
are named `*-core.ts`). Full detail: [qa/S2b-qa-report.md](../qa/S2b-qa-report.md).

## Deviations from the plan

1. **The `--propose` artifact was generated, spot-checked, and NOT committed.** The plan expected
   Unit 2's seeder to exist; it did not anticipate the seeder actually being run live. Doing so
   surfaced a real question the plan didn't address: is a `reviewedBy: null` row safe to seed? See
   Finding 1 below — the answer turned out to be no, given the current resolver, so the artifact was
   reverted to `[]` before commit rather than shipping 1072 unreviewed values as if curated.
2. **The §10 calibration spike (10-product timing measurement) was not run.** It requires a human
   actually curating ten products end-to-end and timing it — an agent cannot produce that measurement
   honestly. It remains the open prerequisite before committing to the top-60-AI curation target.
3. **No live interactive browser QA this pass.** All resumption proof is DB/script-level
   (`verify:spray-record`, `verify:tenant-isolation`) and unit-test-level, not a clicked-through
   session with the standing QA-PROTOCOL's login step. The two new UI surfaces (jurisdiction
   propose/confirm, the tenant-products page) compile and route correctly but weren't exercised live.

## Findings that change later phases — do not re-derive

1. ⚠️ **The shipped Unit 6 resolver does not gate on `reviewedBy`.** `lookupProductFactsBatch` returns
   any active row regardless of review status; every existing `verify:product-facts` fixture already
   relies on `reviewedBy: null` rows resolving successfully. This means **the actual safety boundary
   for curated content today is the git PR review, not a runtime check.** Before any real curated
   `product-facts.json` content is merged, decide explicitly: either add a `reviewedBy IS NOT NULL`
   filter to the resolver, or document the PR-review-as-gate design on purpose. Left as an open
   decision (not fixed) because changing Unit 6's already-tested behavior is out of this unit's scope.
2. **`prod_site.dat`'s PHI/REI proposal pipeline works and is fast.** Live-tested: fetch + parse +
   roll-up of the full CDPR corpus (~1.24M `prod_site.dat` rows) completed well within a normal
   session, producing 1072 usable proposals (26 flagged with cross-row conflicts) with zero parse
   failures. The "verify and fill" workflow §10 anticipated is real — a reviewer starting from these
   proposals is doing verification, not research, for ~40% of PHI / 64% of REI per Unit 0's own measurement.
3. **Jurisdiction resolution must run *before* opening an interactive transaction, not inside one.**
   `runInTenantTx` (unlike its sibling `runInTenantRawTx`) does not lift Prisma's 5-second default
   ceiling for a cold Neon compute. Resolving jurisdiction as a non-tx read from inside that window
   P2028'd during testing. Fixed by resolving before the transaction opens and passing the result in
   by closure — the same pattern `resolveFactsSnapshots` already used, which is why the facts path
   never hit this. Worth knowing for any future phase adding a resolver call inside `runInTenantTx`.
4. **Coverage is still 0%.** `report:product-facts-coverage` re-run 2026-07-27: identical to the
   foundation's number. This is the one thing resumption could not move — moving it needs a human's
   review signature on real content, which is the actual remaining work before S7a/S6 unblock.

## What's still open

- The `reviewedBy` gate decision (Finding 1).
- The §10 calibration spike, then real curation against the top-60-AI target.
- A live interactive QA pass on the two new UI surfaces.
- Units 6/7/7b/8/9 remain as shipped 2026-07-26 — untouched by this resumption.
