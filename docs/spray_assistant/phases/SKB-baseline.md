# SKB Unit 4 — pre-SKB measurement baseline

**Captured:** 2026-07-27T13:36:42.124Z, before Penn State Extension or Virginia Tech grape IPM
existed in `KNOWLEDGE_SOURCES`. Committed as `docs/kb-register-baseline.json` (commit `7787e4db`)
and copied immutably here as `SKB-baseline-register.json` so a later session re-capturing the shared
file mid-phase cannot destroy this before-evidence (council S2).

## Corpus state at capture time

Corpus already included the Cornell NY/PA Grape Guide (`cornell-grape-guide`) and PNW Pest
Management Handbooks (`pnw-handbooks`), both flipped `defaultEnabled: true` earlier the same day
(plan 099 / plan 100). SKB's baseline is measured against that state, not against the pre-2026-07-26
corpus.

## 20 `PRACTICAL_QUERIES` slot occupancy (top-6 each, 120 slots total)

Full detail in `SKB-baseline-register.json`. Every question hit 6/6 (no empty slots). Publisher mix
at capture time, condensed:

- **AWRI** and **Virginia Tech Enology** are the two heaviest incumbents, appearing in most
  questions.
- **"My ferment is stuck at 5 Brix"** — the free-source-bias finding recorded in an earlier baseline
  (`scott-labs` holding 5 of 6 slots) has **improved**: this capture shows AWRI / Virginia Tech
  Enology / Scott Laboratories genuinely mixed (2/2/2 split), not a single-publisher monopoly. Not
  attributable to this phase — recorded here only so the improvement is on the record before SKB's
  own displacement measurement runs.
- Eastern-US disease questions (**"How do I control powdery mildew in the vineyard?"**, **"What is
  the right time to apply a pre-infection fungicide..."**) were answered by AWRI / Wine Australia /
  UC IPM / Cornell — Mediterranean and Californian epidemiology, the exact gap SKB exists to close.
  Cornell holds one slot on each; PSU and VT hold none (they do not exist yet).

## Dense-query latency

**Not separately measured before this crawl** — an honest gap against the plan's ask to record a
pre-crawl number. The first latency sample taken in this phase is Unit 8's post-acceptance
measurement (`SKB-measurements.md`): **median 3013 ms** over 5 runs of a representative dense query
(embed + pgvector cosine + ts_rank, `org_demo_winery`, top-6). That number is what stands as the
**explicit flip threshold** going forward — a later re-measurement that degrades materially past
~3 s median is the signal D11/Unit 9 would need to act on, not an assumption that the corpus is fine.

## D11 — the tripwire already crossed

`docs/architecture/scale-register.md`'s plan-079 entry says "no HNSW/IVFFlat in v1", "fine until
hundreds-low-thousands of chunks", tripwire "chunk counts crossing ~10k", status green, as of plan
079. Chunk count at Unit 8 measurement time (after PSU + VT): **37,939** — nearly 4x the tripwire,
and it was already past 23.5k before this phase added anything. Correcting the register entry is
Unit 11's job; this phase's job was to produce the number, not assume the register's stale green
status was still true. Building an ANN index is explicitly out of scope (D11) — this is a
measurement, not a build.

## Verification

`npm run verify:kb-register` passes against `docs/kb-register-baseline.json` with zero drift
immediately after this capture (identical content, freshly written).
