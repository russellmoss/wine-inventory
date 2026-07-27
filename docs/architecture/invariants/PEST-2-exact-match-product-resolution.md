---
id: PEST-2
group: spray
severity: critical
enforcedBy: app-code
verify: "npm run verify:pesticide"
decision: "S2 plan K6/K12 (runbook council S9, council G2/G4)"
status: guarded
appliesTo:
  - src/lib/pesticide/
tags:
  - invariant
---

# PEST-2 — product resolution is exact-match only, and no negative result is a clearance

> [!danger] Invariant (critical, app-code) — GUARDED
> A registration number resolves by EXACT match on its canonical form or it does not resolve at all.
> `malformed`, `unsupported-format`, and `not-found` are three distinct answers and **none of them is
> a permission**. Federal registration alone is never a clearance: a jurisdiction is required, and
> outside California the honest answer is `state-registration-unknown`.

**Why:** a near-miss that resolves confidently to the wrong product produces a confidently wrong
legality answer — and a wrong legality answer is an illegal application. FIFRA also lets a state
restrict a federally registered product, so a federal-only "yes" fails OPEN on a legal question for
every non-CA tenant.

**Guarded by:**
- `parseRegistrationNumber` (`src/lib/pesticide/reg-number.ts`) — a typed discriminated union; the
  interior of a number is never repaired, and a CA-state-only or FIFRA 25(b) number is typed as its
  own format rather than called malformed (a legally-required tank adjuvant must stay loggable).
- `lookupRegistration` (`src/lib/pesticide/lookup.ts`) — jurisdiction is a REQUIRED argument; only
  `country: "US"` + `state: "CA"` + an explicit CDPR `REGISTERED` row can yield `ok: true`; a non-US
  jurisdiction returns `jurisdiction-unsupported` rather than throwing (Bhutan is a live tenant).
- **Mechanical guard:** `test/pesticide-boundaries.test.ts` scans the whole lane and fails on any
  `contains` / `startsWith` / `endsWith` / `mode: "insensitive"` / `similarity` / `levenshtein` —
  comments stripped first, so the rule is proven by code, not by prose.
- **Proof:** `npm run verify:pesticide` — the U+2011 hyphen case, the CA-state-only case, the NY
  jurisdiction case, and the non-US case.

**Applies to:** `src/lib/pesticide/`
