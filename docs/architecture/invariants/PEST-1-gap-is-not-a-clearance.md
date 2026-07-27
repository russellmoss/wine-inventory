---
id: PEST-1
group: spray
severity: critical
enforcedBy: db-constraint
verify: "npm run verify:pesticide"
decision: "S2 plan K2/K13 (council G3)"
status: guarded
appliesTo:
  - src/lib/pesticide/
  - scripts/derive-resistance-codes.ts
tags:
  - invariant
---

# PEST-1 — a coverage gap never renders as "no restriction"

> [!danger] Invariant (critical, db-constraint) — GUARDED
> "We don't know" and "there is no code" are DIFFERENT values, at the active-ingredient level **and
> at the product level**. A missing resistance code must never be readable as an absence of
> restriction, and a premix containing one uncoded active ingredient is `GAP` as a product — the
> codes that did resolve travel only as explicitly-labelled partial evidence.

**Why this is the program's most dangerous failure mode:** a grower reads a missing resistance code
as "no restriction" and believes they are rotating when they are not. Resistance is bred silently and
the damage shows up a season later (runbook §3.6, discovery brief §3.1).

**Guarded by:**
- **Schema (the teeth):** `ResistanceResolution { CODED, NO_CODE_EXISTS, GAP }` is a required
  tri-state, and `chk_pra_coded_has_codes` enforces `(resolution = 'CODED') = (cardinality(codes) > 0)`
  in `20260726220000_pesticide_schema` — an empty array can never masquerade as a resolved code, and
  a CODED row can never be empty.
- **Service:** the K13 most-conservative rollup in `src/lib/pesticide/lookup.ts` — any constituent AI
  in `GAP` makes the product `GAP` with `partialEvidence: true`. A directly-cited product assignment
  does NOT override it.
- **Proof:** `npm run verify:pesticide` (coverage has zero unclassified AIs; `GAP` is a non-empty
  real bucket; Zampro resolves `GAP` rather than being guessed) plus
  `test/pesticide-resistance-derive.test.ts` and `test/pesticide-entitlement.test.ts`.

**Not yet guarded — the open seam:** S2 can prove the DATA is honest; it cannot prove the RENDER is.
**S9 owns the risk visual vocabulary** and must render `GAP` distinctly from `NO_CODE_EXISTS`. Do not
invent a treatment for it before then (S2 plan, Open question 2).

**Applies to:** `src/lib/pesticide/`, `scripts/derive-resistance-codes.ts`
