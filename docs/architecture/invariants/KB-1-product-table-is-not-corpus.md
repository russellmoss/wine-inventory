---
id: KB-1
group: knowledge-base
severity: critical
enforcedBy: pure-code
verify: "npm run verify:kb-boundary"
decision: "SKB plan §2 (Russell 2026-07-26); council C1/C2/C3"
status: guarded
appliesTo:
  - src/lib/knowledge/boundary/
  - src/lib/knowledge/index-documents.ts
  - src/lib/knowledge/config.ts
tags:
  - invariant
---

# KB-1 — a product→fact table is never corpus content

> [!danger] Invariant (critical, pure-code) — GUARDED
> The corpus/relational line is **tabular vs prose**, not mentions-FRAC vs does-not. A **table or
> matrix keyed by product or active ingredient** — product × FRAC group, × efficacy rating, × rate,
> × REI/PHI — must never be indexed for an enforcing source. Disease biology (tier A) and advisory
> prose that names FRAC groups as context while deferring rates to the label (tier B) are corpus
> content and must pass.

**Why:** a product→fact table in the corpus is a *second, unversioned answer* to a question the
relational engine answers exactly. It can be retrieved and quoted as authoritative while
`pesticide_resistance_assignment` says `GAP` for the same product. That is not a coverage gap
rendering as unknown — it is a coverage gap rendering as **a confident answer from the wrong engine**
(runbook §3.6, and [[PEST-1-gap-is-not-a-clearance]] read from the other side).

**Tier B is admitted for its VALUE, not because it is safe** (council C1). The two-engine collision is
a property of *any* corpus content naming a product: "captan (M4) provides additional coverage"
synthesises into a clearance that overrides a relational `GAP` just as well as a table does. Tier C
merely makes it dense and legible. What separates B from C is that B carries regional epidemiology
available nowhere else while C carries a lookup the relational engine already answers. **So the
legality refusal in `search_knowledge_base` is a hard precondition of tier B, not a parallel nicety.**

**Guarded by:**
- **Detector (pure):** `src/lib/knowledge/boundary/product-table-core.ts` — thresholds ride
  repeated-row count, never document size (same posture as `crawl/challenge.ts` refusing a size
  heuristic).
- **Seam:** it reads **raw HTML / the PDF pre-chunk lines, never post-extraction text**. `extract/pdf.ts`
  emits no pipe tables and no headings, so reading extracted text would disarm the detector on exactly
  the table-dominated documents it exists to catch (council C2).
- **Gate (inline):** `src/lib/knowledge/index-documents.ts` runs it **before extraction** and returns
  `skipped: "product-table"` for an enforcing source. It **never signals by throwing** — a throw in
  this path is read by the monthly re-crawl's tombstone pass as "the page was removed" and would
  mass-tombstone a source's whole corpus slice.
- **Failure direction:** `uncertain` **skips** for an enforcing source (fail closed) and is **admitted
  and counted** for a report-only one, where the detector is a measurement and nothing is gated.
- **Scope:** `src/lib/knowledge/boundary/enforcing.ts` — enforcement is the DEFAULT; the 25 pre-SKB
  sources are a frozen, explicitly-named report-only census. D3's close-out is a deletion from that
  list; report-only is a single-PR state, not a resting one (council C3: a safety invariant cannot be
  grandfathered).
- **Proof:** `npm run verify:kb-boundary` (zero flagged documents on every enforcing source; the
  report-only count printed as the number the close-out decides against) plus
  `test/knowledge-product-table.test.ts` and `test/knowledge-boundary-gate.test.ts`.

**Not yet guarded — the open seam:** the detector cannot see a product→fact mapping that a source
publishes as prose sentences one per product. Nothing in the pipeline can. That case is covered
conversationally instead, by the legality refusal in `search_knowledge_base` — which is why the two
ship together.

**Applies to:** `src/lib/knowledge/boundary/`, `src/lib/knowledge/index-documents.ts`,
`src/lib/knowledge/config.ts`
