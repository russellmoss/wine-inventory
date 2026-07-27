# SKB Unit 9 — cross-region contamination: does council C4/D13's hazard reproduce?

**Verdict: YES, it reproduces.** 2 of 4 region-bound probes returned a climate-mixed result set
(measured 2026-07-27, `org_demo_winery`, `extension-psu` enabled for Demo, top-8). Recorded per the
plan's own pre-committed branch (D13) so the result cannot be rationalised after the fact.

## Why this was measured, not assumed

`retrieve.ts` runs `mmrSelect(..., 0.7)` — 30% of the selection weight is deliberate DISSIMILARITY
from what is already chosen. There is no region dimension anywhere: not on the chunk, not in the
query, not in tenant config. Council's own worked example: a Michigan grower asks about downy
mildew, retrieval returns a Michigan chunk *and* an Australian chunk, both semantically close to the
query, and the model synthesises a geographically impossible spray strategy, fully cited. Closing
the eastern coverage gap (this phase's whole point) makes that case DENSER, not rarer — there is now
more eastern content sitting next to the pre-existing Australian/Californian material for MMR to pair
against.

## The four probes

| Question | Off-region publishers present | On-region publishers present | Mixed? |
|---|---|---|---|
| "A Michigan vineyard is seeing downy mildew pressure this week - what should I do?" | Wine Australia, AWRI | Penn State Extension, Cornell, PNW Handbooks | **YES** |
| "Grape berry moth is active in my Pennsylvania vineyard - what generation and timing should I expect?" | UC IPM | Virginia Tech, Cornell | **YES** |
| "How do I manage powdery mildew pressure on grapes in Virginia this humid week?" | none | WSU, Cornell, Oregon Wine Research Institute | no |
| "What are the spray timing recommendations for black rot in an eastern US vineyard this season?" | none | Cornell (all 8 slots) | no |

The two mixed cases are not edge cases dreamed up to force a positive result — they are exactly the
shape council predicted: a disease/pest question with strong semantic overlap across climate zones
(downy mildew pressure, grape berry moth generations) pulls in the Mediterranean/Australian or
Californian authority alongside the eastern one. The two clean cases both happen to have one
publisher (Cornell) so dominant in the corpus for that specific topic that MMR's dissimilarity
pressure has nowhere off-region to reach.

## What this means for the two SKB sources, per D13's pre-committed branch

D13 said, in advance: *contamination reproduces → the sources stay dark, and a region metadata
dimension plus a tenant-region query filter becomes a hard blocker on the flip, scoped as its own
phase.*

- **`extension-psu`** is already `defaultEnabled: false` (dark, Demo-only subscription for
  measurement). This finding is a **hard block on ever flipping it** until a region filter exists.
  No config change needed — it was already doing the right thing.
- **`virginia-fruit`** is **already `defaultEnabled: true` for every tenant**, and was before this
  reconciliation started (Unit 7 chose not to re-litigate that pre-existing state). The Pennsylvania
  grape-berry-moth probe above shows virginia-fruit content sitting in the SAME mixed result set as
  UC IPM. **This is a real, live instance of the exact hazard D13 describes, not a hypothetical one**
  — it is not new (virginia-fruit's content has been live since before SKB), but this phase is the
  first time it has been measured rather than assumed away. Darkening it was NOT decided here: that
  is a live-production behavior change for a source that has been serving every tenant for over a
  week, and it deserves the owner's explicit call rather than a silent default either way.

## Why the fix is not built here

A region dimension on a global shared corpus touches chunk metadata, the retrieval SQL, and tenant
configuration — a real architecture change. Burying it in a source-expansion phase is how it gets
built badly. This phase's job was to make the hazard measurable and impossible to quietly forget, not
to design the filter. The `REGION_CASES` block in `scripts/kb-eval-cases.ts` keeps these four probes
in the snapshot going forward (`npm run kb:snapshot`), so a future corpus change that makes this
better or worse is visible without re-deriving the query set from scratch.

## Open question for Russell

Should `virginia-fruit` be darkened (`defaultEnabled: false`) pending a region filter, consistent
with how `extension-psu` is being held, or left live on the reasoning that it predates this
phase and the hazard - while real - is not new? Either answer is defensible; it is a product call
about acceptable risk on live tenants, not an engineering one, and it is being surfaced rather than
decided.
