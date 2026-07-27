# SKB Unit 8 — retrieval evidence for Penn State Extension + Virginia Tech grape IPM

Measured 2026-07-27 against the live corpus, `org_demo_winery` tenant, `extension-psu` subscribed
for Demo only (staged rollout - not yet `defaultEnabled`). `virginia-fruit` was already
`defaultEnabled: true` before this reconciliation and stays that way (see the runbook SKB row and
the Unit 7 commit for why its flip is not re-litigated here).

## Per-source document/chunk counts

| Source | Active docs | Withdrawn (scope cleanup) | Active chunks |
|---|---|---|---|
| extension-psu (new) | 47 | 4 | 485 |
| virginia-fruit (reconciled) | 68 | 34 | 264 |

Withdrawn counts are not incidental - both sources needed a live-crawl-driven scope correction after
landing (see the two fix(kb) commits): PSU's hub allowPrefix admitted off-mandate sub-hubs
(wine-production, business-management-and-marketing, staff directory, a features aggregator);
VT's inherited allowPrefixes: ["/"] let a --follow crawl wander into sibling apple/pear/peach
orchard content, station pages, a faculty bio, and 14 years of pesticide-use-statistics pages. Both
are now scoped by allowPaths (SKB Unit 5) and the off-scope documents were withdrawn (tombstoned,
not deleted) rather than left live.

Corpus-wide total: **37,759 active chunks** (up from ~23.5k when the scale-register was last
correct - see D11 in SKB-baseline.md and the register correction due in Unit 11).

## KB-1 boundary gate - did tier-C content actually leak?

npm run verify:kb-boundary (full corpus, live re-fetch of every enforcing source):

```
ENFORCE  cornell-grape-guide     1 docs  product-table 0  uncertain 0  unaudited 0  empty 0
ENFORCE  extension-psu         47 docs  product-table 0  uncertain 0  unaudited 0  empty 2
ENFORCE  pnw-handbooks         64 docs  product-table 0  uncertain 0  unaudited 0  empty 2

PASS - no product-fact table on any enforcing source.
```

extension-psu's two "empty" documents are the gate working as designed, not a gap in the curation:
both were hand-selected as tier-A on their TITLE alone (a spotted-lanternfly management article and
an auxin-herbicide grower-survey writeup), and both turned out to embed a real product/rate table -
spotted-lanternfly-management-in-vineyards (13 qualifying rows: rate-per-acre, trade-name,
formulation, relative-effectiveness, active-ingredient headers) and the herbicide survey article (7
rows, formulation header). The inline KB-1 gate caught both at crawl time, cleared their chunks, and
left the document row in place - exactly the skipped: "product-table" path Unit 2 built. This is
the strongest evidence yet that the detector generalizes past its own test fixtures to real,
previously-unseen extension content chosen by a human who did not know in advance which pages
contained tables.

virginia-fruit is report-only (a pre-SKB incumbent, not newly-enforcing), so its arm is measured
via --report-only: 68 docs, 0 product-table, 1 uncertain (syllabus.html, a 13-line flat run -
almost certainly an IPM short-course schedule reading as a row-shaped list, not a rate table; recorded
for Unit 11's D3 census rather than adjudicated here since report-only gates nothing).

## Retrieval cases - do the two sources earn real slots?

All 5 new RETRIEVAL_CASES pass against the live corpus (npm run verify:knowledge-base, 26/26
including the 8 pre-existing CSV cases and the known-failing AWRI/Pinot-noir vocabulary gap, which
stays PENDING as designed):

| Question | Source that answers it | Evidence |
|---|---|---|
| Eastern black rot cause + management | extension-psu (/grape-disease-black-rot/) + Cornell | Both in top-6 |
| Grape berry moth generations/life cycle | virginia-fruit (GBM.html) | 3 of top 6 slots, not just present - the "only this source answers it" bar the plan asks for |
| Spotted lanternfly vineyard management | extension-psu (/spotted-lanternfly-in-vineyards/) + Cornell | Both in top-6 |
| Sour rot near harvest | extension-psu (/grape-sour-rot/) | Rank 1 |
| Eastern powdery mildew (council S6) | cornell-grapes (4/6), WSU (2/6) | Zero uc-ipm, zero awri in the result set - the eastern fallback the corpus already had via Cornell holds; PSU/VT do not need a PM page (PSU has none - confirmed 404 in recon; VT is an entomology site with no fungal-disease content) |

## Displacement (npm run verify:kb-register)

**8/120 slots changed hands; 4 went to publishers absent from the baseline (3%)** - inside both the
per-question and aggregate thresholds. DISPLACEMENT GATE PASSED.

Only 2 of the 8 changed slots are directly attributable to the new sources (Penn State Extension
appearing on "What TA and pH should I target for a Riesling?" and "When is the right time to pick
based on numbers?"). The other 6 are pre-existing corpus churn unrelated to this phase (ETS
Laboratories -> AWRI, Scott Laboratories -> AWRI, WSU -> ICVV, Cornell -> AWRI/Wine Australia) -
recorded rather than hidden, per D10's per-source attribution discipline.

Baseline re-captured after acceptance: docs/kb-register-baseline.json and docs/kb-eval/snapshot.json
(25 queries now, up from 20 - the 5 new Unit 8 cases are included in the snapshot's query set).

## Dense-query latency (D11/S7 precondition)

Median **3013 ms** over 5 runs of a representative dense query (embed + pgvector cosine + ts_rank,
org_demo_winery, top-6), measured post-acceptance. No distinct pre-crawl sample exists (see the gap
noted in SKB-baseline.md) - this number is the threshold a later re-measurement compares against.

## What this does NOT settle

Displacement + retrieval-earns-its-slots are two of the flip gate's three required signals (council
S1). The third - cross-region contamination - is Unit 9, not measured here. **Neither source's
defaultEnabled flip should be treated as decided by this document alone.**
