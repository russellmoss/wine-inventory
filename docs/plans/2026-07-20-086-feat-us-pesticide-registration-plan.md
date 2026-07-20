---
title: US pesticide registration + resistance-group coverage (deterministic layer)
type: feat
status: draft
date: 2026-07-20
branch: claude/us-pesticide-registration
depth: deep
units: 11
---

## Overview

Give US vineyard users a trustworthy answer to three questions the app cannot answer today:
*is this product legally registered on grapes in my state*, *what resistance group is it*, and
*does my spray history actually rotate modes of action*. The data comes from EPA and state
registries on a monthly refresh, gated behind a per-tenant toggle so non-US tenants never see it.

The load-bearing decision: pesticide registration is **structured data queried by exact match**,
not prose queried by similarity. It goes in relational tables, not the embedding corpus.

## Problem Frame

A vineyard manager planning a spray program needs to know what is legal and what rotates. Today
Cellarhand records neither — `FieldNote.spraysApplied` is a JSON array of product *names* with no
date, rate, or product identity, and `FieldInput` is a name-only master list.

The job is not "look up a pesticide." It is *"don't let me spray Group 11 three times in a row,
and don't let me spray something with a 14-day PHI eight days before I pick."* That reframing
matters because the rotation check needs only the deterministic layer. The label-extraction work
is most of the effort and nearly all of the liability, so it is explicitly deferred (see Phase 2).

**Cost of doing nothing:** growers rely on a PCA and stale PDFs. Real but not acute. The reason to
build is that resistance-rotation validation against spray history is something no competitor does
well, and it is only possible because we already hold the vineyard block and harvest data.

**Pressure-test flag:** this is regulatory territory. The label is the law. Anything we surface must
carry its source and as-of date, and must never present a synthesized number as authoritative.

## Requirements

- MUST: registration status, state legality, county restrictions, and resistance codes are
  **deterministic joins** — never LLM-inferred.
- MUST: every one of the ~338 grape active ingredients resolves to exactly one of: *coded*,
  *no code exists for this class*, or *gap* — surfaced in a coverage report. A silently incomplete
  resistance table is worse than none: a grower believes they are rotating when they are not.
- MUST: per-tenant on/off, defaulting OFF, failing closed.
- MUST: no committee compilation (FRAC / HRAC / IRAC) is parsed or redistributed. Codes are derived
  from Tier-1 extension sources already in the corpus, each row carrying a citation.
- MUST: monthly refresh, wired into the existing `knowledge-recrawl.yml`.
- SHOULD: county-level restrictions (Nassau/Suffolk) with the FIFRA 24(c) carve-out represented,
  not a binary banned flag.
- NICE: rotation warning against spray history (needs Unit 10, the spray record).

## Scope Boundaries

**In scope:** EPA APPRIL ingest; CA DPR state layer; derived AI→resistance-code table with coverage
reporting; county-restriction flags; per-tenant toggle; assistant read tool; monthly refresh.

**Out of scope, and why:**
- **Rate / PHI / REI extraction from label PDFs** — deferred to Phase 2. Highest effort, highest
  liability, and the rotation use case does not need it.
- **NY / OR / WA state layers** — NYSPAD has no bulk export; PICOL's API is undocumented and probed
  404. CA first, as the largest grape state and the only free bulk source verified working.
- **Writing spray applications** — Unit 10 defines the record; the write UI is a follow-on.
- **Non-grape crops** — the join filters to grape site codes. The pipeline generalizes later.

## Research Summary

### Verified data sources (all probed live 2026-07-20)

| Source | Endpoint | Shape | Verified |
|---|---|---|---|
| EPA APPRIL | `www3.epa.gov/pesticides/appril/apprildatadump_public.xlsx` | 98 MB xlsx, 366,579 × 31 | ✅ 200, mod 2026-07-15 |
| EPA PPLS labels | `www3.epa.gov/pesticides/chem_search/ppls/{LABEL_NAMES}` | PDF, text layer | ✅ 200 |
| CA DPR | `files.cdpr.ca.gov/pub/outgoing/product/` | 43 fixed-width `.dat`, nightly | ✅ |
| Cornell Table 3.2.1 | paid guide; 16 free preview rows | **AI-keyed**, premixes carry both codes | ⚠️ paywalled |
| UC IPM | `ipm.ucanr.edu` conventional + biologicals tables | trade-name-keyed, ~60 entries | ✅ |
| Virginia Tech | `pubs.ext.vt.edu/.../ENTO-635-C.pdf` | FRAC in **prose**, no table | ✅ |

**Scale, measured from the dump:** 2,509 distinct active registrations on grapes; 338 distinct AIs;
144 in fungicide products. Coverage curve: top 60 AIs = **86.5%** of all product-AI occurrences.
62 AIs (43%) appear in exactly one product, and that tail is overwhelmingly *biologicals*
(`Bacillus subtilis strain AFS032321`, `Aureobasidium pullulans DSM 14940`) — which Cornell codes
`BM02` and which collapse under species-level rules. 317 grape rows have blank `PEST_CAT` and would
vanish from any class-filtered view.

**Negative results worth recording:**
- Label-text FRAC scraping systematically drops the SDHI partner in premixes (Luna 7+3 → 3 only;
  Miravis 7+12 → 12 only; Gavel M03+22 → none). Reliable for single-AI products only.
- The label cannot answer state registration. CA DPR `prod_site.dat` shows Gavel 75DF and
  Fusilade DX both registered on `GRAPES, WINE` (status A) despite widespread claims otherwise.
- CDPR `preharvest_interval.dat` / `reentry_interval.dat` are **unit lookup tables** (D/H/M), not
  values. Do not plan around them.
- Nassau/Suffolk detection: `/Nassau|Suffolk/` caught 4/4 restricted products, zero false positives,
  across four different sentence structures. But Luna carries *"except as permitted under FIFRA
  24(c), Special Local Need registration"* — a binary flag would be wrong.

### Codebase patterns

- `KNOWLEDGE_SOURCES` at `src/lib/knowledge/config.ts:26`; `uc-ipm` entry at `:450-495` is the
  closest analogue and its own comment says *"FRESHNESS IS SAFETY-RELEVANT here… registrations get
  cancelled."* This plan is the fix for that gap.
- Toggle exists end to end: `KnowledgeSourceSubscription` (`prisma/schema.prisma:3355`, RLS),
  `setKnowledgeSourceEnabled` (`src/lib/knowledge/actions.ts:15`, admin-only, audited), UI at
  `settings/KnowledgeSourcesCard.tsx`. Retrieval fails closed (`retrieve.ts:53` returns `[]`).
- Synthesized-source precedent: `scripts/crawl-ets.ts` — one document per record, builds HTML in
  memory, writes blob + document + observation rows itself, *then* calls `indexDocument`.
- Assistant read tool contract: `src/lib/assistant/registry.ts:25-33`; register in **two** places
  (import block + `ALL_TOOLS`). Tenancy from `ctx.user.activeOrganizationId`, never model input.
- CI gates that will bite: `verify:ai-native` requires every domain core be import-reachable from an
  assistant tool; the golden-eval coverage guard (`test/evals/assistant-tools.eval.test.ts:31-38`).

### Critical constraints discovered

1. **`chunk.ts` guarantees markdown pipe-tables are never split** (`chunk.ts:140-145`) — but
   `extract/pdf.ts` emits no pipes and no headings, so a label PDF becomes one segment with a
   garbage breadcrumb. Header/row separation ≈40-45%, and overlap is **zero** because
   `tailForOverlap` splits on `[.!?]` (`chunk.ts:108`) and numeric table runs have none.
2. **No ANN index exists on `knowledge_chunk.embedding`** — zero `hnsw`/`ivfflat` matches across all
   migrations. Every dense query is a sequential scan. Scale-register tripwire is ~10k chunks.
3. **`indexDocument` DELETES a document row on content-hash collision** (`index-documents.ts:84-92`).
4. **Curated sources are excluded from the monthly job in both directions** —
   `recrawl-knowledge.ts:38` (crawl) and `:83` (tombstone).
5. `crawlCadence` is declared, seeded, and verified but **never read by any scheduler**.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| Where registration data lives | **Relational tables**, tenant-global | Synthesized docs in the embedding corpus | "Is X registered on grapes in CA" is a `WHERE` clause, not a similarity search. Storing it relationally avoids +12,500 chunks, sidesteps the missing-ANN-index ceiling entirely, and makes answers exact instead of retrieved. |
| How the toggle works | Register EPA as a `KnowledgeSource` row for the **toggle + citation plumbing only**; data stays relational; the assistant tool checks the subscription before querying | New bespoke tenant setting | Reuses the shipped admin-only, audited, fail-closed toggle and its settings UI for free, without paying the corpus cost. |
| Resistance-code sourcing | Derive from extension sources, cite every row | Parse FRAC/HRAC/IRAC compilations | Both FRAC and HRAC reserve commercial use ("may not be… stored in a retrieval system"). Binding user decision. |
| Coverage target | **100% resolution**, not 100% coding | "get every AI coded" | FRAC only codes fungicides; sanitizers/oils/fumigants have no code. Unreachable target hides real gaps. |
| Label tables, if ingested later | Synthesize markdown pipe-tables | Ingest label PDFs via `extractPdf` | Only the pipe-table path has a no-split guarantee. |
| County restrictions | Structured flag with `exception: "24c-sln"` | Boolean banned | Luna's SLN carve-out makes a boolean wrong. |
| Cornell guide | Plan around free sources; treat as **documented upgrade path** | Purchase now | Purchasing is the user's call and not mine to make. Free sources reach full resolution; Cornell makes it cleaner. |

## Implementation Units

### Unit 1: EPA APPRIL fetch + parse (pure)

**Goal:** Turn the 98 MB xlsx into validated, typed records — no DB writes.
**Files:** `src/lib/pesticide/appril-parse.ts`, `test/pesticide-appril-parse.test.ts`
**Approach:** Stream the sheet; parse `AIS` (`Name (PCcode/CAS) - (pct%)`), `SITES`, `PESTS`,
`LABEL_NAMES`. Pure functions over fixture rows. Keep `PEST_CAT` raw — do NOT collapse multi-class
values, and treat blank as `unknown` rather than dropping (317 grape rows are blank).
**Tests:** multi-AI premix parse; blank `PEST_CAT`; grapefruit-vs-grape discrimination
(`/\bGrapes?\b(?!fruit)/` — "Grape-Ivy" is an ornamental, must not match).
**Depends on:** none
**Verification:** unit tests; parsed count matches the measured 2,509 grape registrations.

### Unit 2: Schema — pesticide registration tables

**Goal:** Relational home for registrations, AIs, and the AI↔registration join.
**Files:** `prisma/schema.prisma`, new migration
**Approach:** Tenant-**global** reference data (like `KnowledgeDocument`), no `tenantId`, no RLS —
entitlement is enforced at the tool via the subscription check. Document that choice in the model
comment, and add it to the RLS-coverage guard's explicit skip list so the exemption is deliberate
rather than an oversight. Store `sourceAsOf` on every row; it is displayed, not decorative.
**Tests:** schema test asserting no PII columns, mirroring `test/commerce7-schema.test.ts`.
**Depends on:** none
**Verification:** `npm run db:migrate`; RLS-coverage verify still green.

### Unit 3: APPRIL ingest script

**Goal:** Idempotent load of grape-scoped registrations.
**Files:** `scripts/ingest-appril.ts`
**Approach:** Follow `crawl-ets.ts` ergonomics — `--dry-run`, `KB_MAX_DOCS`-style cap, per-record
try/catch with a tally, `runAsSystem` + `disconnectSystem` in both paths. Upsert on `REG_NUM`.
Emit a `::PESTICIDE_INGEST_SUMMARY::{json}` stdout marker (the convention
`recrawl-knowledge.ts:124` uses — the existing curated scripts print plain `done:` lines, which is
exactly why they were never wirable into the workflow).
**Tests:** re-run is a no-op; changed status updates in place.
**Depends on:** 1, 2
**Verification:** `--dry-run` reports ~2,509; second real run reports 0 changed.

### Unit 4: Resistance-code derivation + coverage report

> **De-risk measured 2026-07-20 — see "Unit 4 de-risk result" below. Three findings changed this
> unit's design. Read that section before implementing.**

**Goal:** The AI→code table, every row cited, every gap visible, with rotation-eligibility modeled
separately from chemical identity.
**Files:** `src/lib/pesticide/resistance-derive.ts`, `scripts/derive-resistance-codes.ts`,
`data/resistance-codes.json`, `test/pesticide-resistance-derive.test.ts`
**Approach:** Three sources with explicit precedence: (1) extension structured tables, (2) extension
prose via LLM extraction, (3) label text **for single-AI products only**. Conflicts are surfaced,
never silently resolved. Checked-in JSON reviewed by a human — a curated artifact, not a live scrape.

Three constraints from the de-risk:

1. **Model `siteType` (`single` | `multi`) separately from the code.** Sources systematically
   disagree on multi-site compounds because they answer different questions: Cornell marks captan
   and copper `N/A` (not a rotation partner), UC IPM gives `M 04` / `M 01` (the taxonomic code).
   Both are correct. Storing one field forces a wrong answer to one of the two questions, and the
   rotation question is the one that produces bad advice.
2. **Never derive a product-level code from an AI-keyed source's trade-name parentheses.** Cornell
   lists trade names as *products containing this AI*, not *products whose code is this*. `Switch`
   appears under `cyprodinil (9)` but Switch is `9/12`. A naive join silently drops group 12 —
   an under-count of a mode of action, which is the dangerous direction. Product codes come from
   product-keyed sources or from summing the product's AIs, never from this parenthetical.
3. **Biologicals need their own sourcing decision.** Neither UC IPM page carries Stargus, LifeGard,
   Theia, or Romeo; Cornell codes all four. Species-level rules (`Bacillus subtilis * → BM02`) help
   but do not cover `Cerevisane` or `B. mycoides`. This is where Cornell's paid value concentrates.

**MSU as a fourth source (added 2026-07-20, after plan 085 scoped MSU Extension into the corpus):**
Tier-2 in this unit's precedence — *prose*, not a table. MSU's systematic AI→FRAC table lives in the
**E-154 Michigan Fruit Management Guide, a paid publication** — the same shape as Cornell, so it
does not change the free-source picture. What IS free is MSU Extension's `/news/` articles, several
of which carry FRAC codes in narrative (e.g. "FRAC codes help in fungicide resistance management",
"Revus Top, a new cost-effective fungicide for grapes"). Treat exactly like the Virginia Tech prose
path: LLM-extracted, cited, human-reviewed, never a table join. Its real value here is **cold-climate
coverage** — products used in MI/NY that CA guides never mention. It does not close the biologicals
gap, so finding 3 stands.

Emit a coverage report bucketing all 338 AIs into coded / no-code-exists / gap.
**Tests:** premix yields both codes; single-AI label path; species rule; a known-uncoded AI
(sodium hypochlorite) lands in *no-code-exists*, not *gap*; **captan resolves with
`siteType: "multi"` regardless of which source supplied the code**; **`Switch` resolves to 9 AND 12,
never 9 alone.**
**Depends on:** 1
**Verification:** coverage report shows zero AIs in an unclassified state; spot-check Zampro→45,40
and Pristine→7,11 (both independently confirmed twice this session).

#### Unit 4 de-risk result (measured, 2026-07-20)

Ground truth: the 14 usable rows of Cornell Table 3.2.1 recovered from the 2025 preview.
Derivation under test: UC IPM conventional + biologicals tables.

| Outcome | Count | Rows |
|---|---|---|
| **Match** | 6 (43%) | azoxystrobin→11, benzovindiflupyr→7, boscalid+pyraclostrobin→7/11, cyazofamid→21, cyprodinil→9, cyflufenamid→U6 |
| **Conflict** | 2 (14%) | captan (Cornell `N/A` vs UC IPM `M 04`), copper (`N/A` vs `M 01`) — **both multi-site; systematic, not random** |
| **Miss** | 6 (43%) | Zampro, Endura, + 4 biologicals (Stargus, LifeGard, Theia, Romeo) |

**Sample caveat:** Cornell's free preview is alphabetically truncated at a–c, which over-represents
*Bacillus* biologicals. The 43% match rate is pessimistic; the conflict *pattern* is the durable
finding, not the ratio.

**Verdict:** MEDIUM confidence was correct. The derivation works for mainstream single-site
chemistry and fails predictably in two places — multi-site compounds (semantic, fixed by finding 1)
and biologicals (coverage, needs finding 3). Neither failure is silent once the coverage report
exists, which is why that report is a MUST and not a nicety.

### Unit 5: CA DPR state layer

**Goal:** Answer "registered in California, on grapes."
**Files:** `src/lib/pesticide/cdpr-parse.ts`, `scripts/ingest-cdpr.ts`, tests
**Approach:** Fixed-width parse of `product.dat`, `prod_site.dat`, `site.dat`. Grape site codes
1014 / 1020 / 1021 / 1022 / 1501 / 29141 / 29143. Join to registrations on EPA reg number.
Do **not** use `preharvest_interval.dat` / `reentry_interval.dat` — they are unit lookups.
**Tests:** Gavel 75DF and Fusilade DX both resolve to registered-on-grapes-in-CA (the
counter-intuitive verified case); a product absent from CDPR resolves to not-registered.
**Depends on:** 2
**Verification:** the two verified cases pass.

### Unit 6: County / SLN restriction flags

**Goal:** Structured, non-binary county restrictions.
**Files:** `src/lib/pesticide/restrictions.ts`, tests
**Approach:** Pure detection over label text with a shape carrying `counties`, `state`, and
`exception` (`"24c-sln"` | null). Four verified phrasings as fixtures.
**Tests:** all four phrasings; Luna's 24(c) carve-out produces `exception: "24c-sln"`, NOT a plain
ban; Luna's separate "Aerial Application Prohibited in New York State" is captured distinctly.
**Depends on:** 1
**Verification:** unit tests over the four captured labels.

### Unit 7: Knowledge-source registration + toggle

**Goal:** Reuse the shipped per-tenant toggle.
**Files:** `src/lib/knowledge/config.ts`
**Approach:** One `KNOWLEDGE_SOURCES` entry, `key: "epa-pesticide"`, `tier: 1`,
`autoCrawl: false`, **`defaultEnabled: false`** (this is how non-US tenants stay clean). Add EPA
hosts to `TRUSTED_DOMAINS`. Re-run `npm run seed:knowledge-sources`.
**Tests:** none new — covered by `verify:kb-subscriptions`.
**Depends on:** none
**Verification:** source appears in the settings card, default off.

### Unit 8: Assistant read tool

**Goal:** Expose the deterministic layer to the assistant.
**Files:** `src/lib/assistant/tools/query-pesticide-registration.ts`,
`src/lib/assistant/registry.ts`, `test/evals/assistant-read-tools.golden.ts`
**Approach:** `kind: "read"`. Tenant from `ctx.user.activeOrganizationId` only. **Check the
`epa-pesticide` subscription first and return an explicit not-enabled result if off** — the tool is
the entitlement boundary, since the data has no RLS. Every response carries `sourceAsOf` and a
citation URL. Register in both places in `registry.ts`.
**Tests:** golden case; a tenant with the source disabled gets the not-enabled path.
**Depends on:** 2, 4, 5, 6, 7
**Verification:** `npx vitest run test/evals`; `verify:ai-native` green.

### Unit 9: Monthly refresh wiring

> ✅ **Unblocked — 085 merged as #415 (`c49d42bc`).** Its Unit 4 already reshaped this workflow's
> summary/review line and `scripts/recrawl-knowledge.ts`, so read those on main before editing.
> The conflict risk this note originally warned about is gone.

**Goal:** Curated sources refresh on the existing cron — fixes the gap generally, not just for EPA.
**Files:** `.github/workflows/knowledge-recrawl.yml`
**Approach:** A step with `id: pesticide`, `if: always()`, between the recrawl and issue steps,
using the same tee/grep/sed pattern into `pesticide-summary.json`; extend the issue-body heredoc
with a second fenced block. No new secrets (the `.env` step already provides them), no new job —
the existing `knowledge-recrawl` concurrency group correctly serializes it. Raise
`timeout-minutes` only if measured runtime demands it.

**Inherit from plan 085, do not re-solve:** its Unit 4 makes the tombstone pass treat a
`fetchDocument` throw as a *flag* rather than "page is gone" (`recrawl-knowledge.ts:93` currently
marks the doc `withdrawn` on any throw). That is the exact failure mode that would mass-tombstone
the EPA corpus on a transient fetch error. Take their fix; do not write a second one.
**Depends on:** 3, 5, **and plan 085 Unit 4 merged**
**Verification:** `workflow_dispatch` run; issue body contains both summaries.

### Unit 10: Spray application record

**Goal:** The record that makes rotation and PHI checks possible.
**Files:** `prisma/schema.prisma`, migration, `src/lib/vineyard/spray-core.ts`, tests
**Approach:** Tenant-scoped + RLS, full Phase-12 checklist (this is domain data, unlike Units 2/5).
Block-scoped via `VineyardBlock`'s existing `@@unique([tenantId, id])` composite target. Fields:
block, date, product (EPA reg number), rate, applicator. Deliberately **separate from
`CellarMaterial`** — that table is the wine-COGS cost authority and the codebase already chose once
(via `FieldInput`) to keep vineyard inputs separate.
**Tests:** tenant-isolation case; ledger/RLS invariants.
**Depends on:** 2
**Verification:** `npm run verify:tenant-isolation`.

### Unit 11: End-to-end verify script

**Goal:** House-pattern proof.
**Files:** `scripts/verify-pesticide.ts`, `package.json`
**Approach:** Follow `verify-knowledge-base.ts`: docblock header with invocation, typed case table
with inline rationale, `runAsSystem`, Demo Winery tenant. Assert the full chain — registration →
AI → resistance code → CA status → county restriction — plus a rotation case (two Group 11 sprays
in sequence produces a warning) and the two counter-intuitive CA cases.
**Depends on:** all
**Verification:** `npm run verify:pesticide` green.

## Test Strategy

**Unit:** vitest alongside each pure module. All parsing, derivation, and restriction detection is
pure and fixture-driven — no network in tests.
**Integration:** `verify:pesticide` against Demo Winery (`org_demo_winery`), never Bhutan.
**Manual:** settings toggle on/off changes assistant behavior; ask the assistant a registration
question with the source disabled and confirm it declines rather than answers from memory.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Resistance-code coverage gaps read as "no restriction" | MED | **HIGH** | Unit 4 coverage report; UI must render *gap* distinctly from *no-code-exists*. This is the single most dangerous failure mode. |
| Users read registration data as spray advice | MED | **HIGH** | Every response carries source + as-of date; tool description states the label is authoritative. |
| Trade-name → AI resolution is ambiguous | MED | MED | Resolve via APPRIL `ABNS`/`PRODUCT_NAME`; unresolved rows go to the coverage report, never guessed. |
| EPA changes the dump format/URL | LOW | MED | Unit 1 validates and fails loudly; monthly job reports into the existing issue. |
| Cold-start ingest exceeds the 180-min workflow timeout | LOW | MED | Relational ingest skips embedding entirely — this is largely dissolved by the Key Decision. Measure on first run. |
| CDPR fixed-width offsets are undocumented | MED | LOW | I mis-decoded the status column once already this session; Unit 5 pins it with the two verified cases as fixtures. |
| Scope creep into rate/PHI extraction | MED | MED | Explicitly Phase 2. Do not start it inside this plan. |

## Success Criteria

- [ ] All 338 grape AIs resolve to coded / no-code-exists / gap; zero unclassified
- [ ] Gavel 75DF and Fusilade DX both report registered-on-grapes-in-CA
- [ ] Zampro → 45, 40 and Pristine → 7, 11
- [ ] Luna Experience yields a Nassau/Suffolk restriction **with** the 24(c) exception, not a ban
- [ ] Source defaults OFF; a tenant without it enabled gets the not-enabled path
- [ ] Monthly workflow reports the pesticide summary in its issue
- [ ] `verify:pesticide`, `verify:ai-native`, `verify:tenant-isolation`, `npx vitest run` green
- [ ] No FRAC/HRAC/IRAC compilation is parsed or committed anywhere in the diff

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Spray record confirmed absent; job-to-be-done is clear |
| Scope Boundaries | HIGH | Phase 2 deferral is deliberate and argued |
| Implementation Units | HIGH | Units 1-3, 5-9 rest on verified endpoints and mapped code. Unit 4 was de-risked 2026-07-20: failure modes are now measured and named, not speculative |
| Test Strategy | HIGH | Counter-intuitive verified cases make strong fixtures; the de-risk added two more (captan `siteType`, Switch 9+12) |
| Risk Assessment | MEDIUM | The coverage-gap risk is understood but the mitigation is UI-dependent and not yet designed |

## Open Questions

1. **Cornell guide** — the de-risk sharpened this. Cornell's value is **concentrated in
   biologicals**: it codes Stargus, LifeGard, Theia, and Romeo, none of which appear on either free
   UC IPM page, and which make up 4 of the 6 measured misses. If biologicals matter to the rotation
   feature, Cornell is the cheapest way to close them. Still an upgrade path, not a blocker.
2. **Coverage-gap UI** — how does an uncoded AI render in a rotation view? Must not look like
   "no restriction." Needs a design pass before Unit 8's output is user-facing.
3. **Planned harvest date** — PHI checks (Phase 2) need one. `HarvestPick.pickDate` is *actual*
   only; nothing forecasts. Out of scope here, but Phase 2 is blocked without it.
