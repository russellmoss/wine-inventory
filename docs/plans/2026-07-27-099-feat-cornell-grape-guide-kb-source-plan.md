# Plan 099 — Cornell 2025 Grape Guide as a KB source (+ the breadcrumb fix it forces)

**Date:** 2026-07-27
**Type:** feat
**Depth:** Standard — 6 implementation units
**Branch:** `claude/grape-guide-pdf-kb-87c8d8`

## Execution log

**Units 1-5 BUILT, 2026-07-27.** Full suite green (394 files / 4689 tests), `tsc --noEmit` clean,
eslint 0 errors. Unit 6 is operator work and has not run.

Measured on the real PDF through `extractPdf` → `chunkMarkdown`, before and after Unit 1:

| Metric | Before | After |
|---|---|---|
| Distinct `sectionPath` | 11 | **46** |
| Chunks with a truncated breadcrumb | 75 / 77 (97%) | 19 / 77 (25%) |
| Avg breadcrumb length | 137.4 | 118.4 |
| Breadcrumbs over the 140 cap | 0 | 0 |
| `lowConfidence` | false | false |

The 19 remaining ellipses elide the *middle* of the path; the leaf is intact in every one. Breadcrumbs
now read `… > 3 Vineyard Disease Management > 3.2 Fungicide Information` rather than `… > 3…`.

**Deviation from the plan, deliberate:** Unit 1 said "never drop the leaf even if it matches" the root.
Implemented as dropping a root-restating heading *wherever* it sits, leaf included — when the leaf IS
the duplicated title, the root already carries that text, so nothing is lost and the budget is freed.

---

## Problem frame

Growers on this platform have no NY/PA-specific IPM reference in the assistant. The corpus'
North-American extension coverage is Cornell's free `blogs.cornell.edu/grapes/` blog plus UC IPM
(California) and a dormant MSU source. `docs/spray_assistant/spray-decision-discovery-brief.md:974`
already named the fix: Cornell paused the 2026 guidelines, so the **2025 NY/PA grape guide is the
agronomic base** for the spray program.

The owner asked for that guide's public preview PDF to be ingested, toggleable, and cited in-app.

### What the artifact actually is (verified, not assumed)

`https://cropandpestguides.cce.cornell.edu/Preview/2025/2025_Grape_Guide_Preview.pdf`
— HTTP 200, `application/pdf`, 2,475,338 bytes, `Last-Modified: 2025-04-30`.

- **25 pages**, a *sampler* of a 166-page book — not chapters 1-3. It takes a few pages from each of
  all eight chapters, deliberately including the chapter 8 pesticide tables.
- Title (extractor-derived, correct): *2025 New York and Pennsylvania Pest Management Guidelines for
  Grapes*. `publishedAt` 2025-04-30 from PDF metadata.
- Page 25 is a sales page: order from the Cornell Store, "online access can also be ordered online".
- Closes with **© 2025 Cornell University. All rights reserved.** No permission or reproduction grant
  anywhere in the document.

### The posture, decided and on the record

Three concerns were raised before planning and the owner decided each. Recording them here so the
decision is auditable rather than buried:

1. **`docs/plans/2026-07-20-087-...-plan.md:34/119/147` lists this exact host as "paid. Do not
   crawl.", with "No document from `cropandpestguides.cce.cornell.edu`" as a negative success
   criterion.** The *unreachable* half of that note is stale (the host answers 200 today). The
   *paid* half is not.
2. **Pages 22-24 are tier-C product tables** (Common Name × Trade Name × Formulation × WSSA Group ×
   Days to Harvest × REI × EPA Reg. Number) — the category the tabular-vs-prose rule of 2026-07-26
   keeps out of the corpus, and the basis on which VT's `ENTO-635-C.pdf` was rejected.
3. **Licensing.** 23 of 25 existing sources rest on an absence of objection; this one has an active
   commercial interest in objecting.

**Owner decision (2026-07-27):** ingest it; surface the PDF link as a citation and paraphrase rather
than reproduce; **take it down if Cornell asks**. This is the posture `vt-enology-notes` already runs
under in production (`config.ts:563` — "All rights reserved; no license granted", cite-and-link-back,
accepted risk). Plan 087's negative criterion is superseded **for this one preview URL only**; the
rest of that host stays out of scope.

### The problem this exposes, which is the bigger half of the work

Running the real pipeline over the PDF (`extractPdf` → `chunkMarkdown`) measured:

| Metric | Value |
|---|---|
| `lowConfidence` | **false** — the plan-090 confidence gate passes cleanly |
| Headings inferred | 56, matching the true chapter/section structure |
| Chunks | 77, avg 336 tokens |
| **Distinct `sectionPath`** | **11** |
| **Avg breadcrumb length** | **137.4 chars** against a 140 cap |
| **Chunks with a truncated breadcrumb** | **75 / 77 (97%)** |

Every breadcrumb reads:

```
2025 New York and Pennsylvania Pest Management Guidelines for Grapes > New York and Pennsylvania Pest Management Guidelines for Grapes > 3…
```

The chapter *number* survives; the chapter *name* and all 56 sub-headings are cut. Mechanism, exactly:

- `parseSegments` (`src/lib/knowledge/chunk.ts:59-63`) builds `[rootTitle, ...headingStack].join(" > ")`.
- `rootTitle` is 68 chars. `linesToMarkdown` (`extract/pdf-structure.ts:396`) re-emits the cover title
  as an H1 — same words minus the year, 63 chars.
- 68 + 3 + 63 = 134 of the 140-char budget, spent saying the same sentence twice.
- `capBreadcrumb` (`chunk.ts:34-40`) then truncates the **tail**, discarding the leaf — which is the
  only part with retrieval value.

This is **not** Grape-Guide-specific, and it is **already a known open defect**: `TODOS.md` §"Chunk
breadcrumbs carry the page `<title>`, site suffix and all" describes the same failure on IVES HTML and
pre-writes the fix — *"drop the leading title segment when it merely repeats the first heading. Pure
and unit-testable."* It affects all 25 sources.

So the honest framing: **ingesting this guide is the forcing function to close a corpus-wide defect.**
Shipping the source without the fix would add 77 chunks whose embedded text is 97% redundant prefix.

---

## Scope boundaries

**In scope**
- Breadcrumb normalisation in `chunk.ts` (root/heading de-duplication + leaf-preserving cap).
- The Grape Guide source: `config.ts` entry, `TRUSTED_DOMAINS` row, `CuratedSpec`.
- Unit tests for both; config-integrity coverage.
- Staged rollout: baseline → deploy → seed → manual crawl → verify → enable Demo → measure → flip.

**Out of scope, deliberately**
- **Any other URL on `cropandpestguides.cce.cornell.edu`.** One preview PDF, `allowPrefixes: []`.
- **Repairing or improving table extraction.** The tier-C tables stay as whatever the extractor
  produces; we are not investing in making product×rate matrices retrievable. See the KB-1 note below.
- The unmerged KB-1 boundary detector (`claude/skb-knowledge-sources-plan-bd36b7`). Not on main; this
  plan does not depend on it and does not merge it.
- A grower-facing toggle surface. The per-tenant toggle **already exists** end to end
  (`KnowledgeSourceSubscription` → `setKnowledgeSourceEnabled` → `KnowledgeSourcesCard` on `/settings`),
  and a new source appears there automatically. Zero front-end work. Likewise citations: the
  `/kb/source/[id]` route already 302s to the source URL, so "surface the link as a citation" is free.
- A corpus-wide HTML re-index (see the deferral in Unit 1).

---

## Key decisions

| # | Decision | Why |
|---|---|---|
| D1 | Fix the breadcrumb in `chunk.ts`, not in the PDF extractor | The defect is generic — IVES HTML hits it too (`TODOS.md`). Fixing it in `extract/pdf.ts` would be the wrong layer and hide the general case, the exact mistake `TODOS.md` calls out for `crawl-ives.ts`. |
| D2 | Cap the breadcrumb from the **head**, always preserving the leaf | The leaf is the most specific and most retrieval-valuable segment. Truncating the tail is backwards. |
| D3 | De-duplicate a heading that repeats the root title | Root cause of the 134-char prefix. Pre-written in `TODOS.md`. Must be near-match, not exact — the two strings differ by the leading year. |
| D4 | Bump `PDF_EXTRACT_VERSION` | `deriveIndexHash` folds it for PDFs; without a bump every re-crawl short-circuits to `skipped:"unchanged"` and ships a green run that changes nothing. This is silent no-op #1 from plan 090. |
| D5 | Accept HTML breadcrumb drift; do not re-index the corpus in this plan | An HTML doc with no section filter hashes on bare `contentHash`, so a `chunk.ts` change does not re-index it. A full re-embed is ~23.5k chunks of Voyage spend. Defer with a tripwire, don't smuggle it in. |
| D6 | `defaultEnabled: false` on arrival, staged rollout | The runbook gate. `.env` is production — a source seeded `defaultEnabled: true` goes live to every tenant the moment it is seeded, before any PR merges. |
| D7 | `autoCrawl: false`, `allowPrefixes: []`, single `directUrls` entry | One PDF, never path-crawled. The `viticulture-extension-refs` fail-closed pattern. |
| D8 | Record the takedown posture in `KnowledgeSource.license` | The owner's "take it down later if they ask" needs to be a one-line flip, not archaeology. `license` is the field the corpus already uses for posture. |

### On the tier-C tables (not re-litigating; recording the residual risk)

The owner approved ingestion knowing pages 22-24 are product tables. The residual risk is **not**
licensing, it is correctness: a rate/REI/PHI cell retrieved out of context and paraphrased by the
assistant can produce an unsafe or illegal recommendation. Two things already in the repo bear on it,
and this plan should not pretend otherwise:

- The guide's own page-1 disclaimer: these guidelines are not a substitute for pesticide labeling.
- `TODOS.md` §"EM 8413 is in the corpus with corrupted pesticide rates" (found 2026-07-26) documents
  a **live** case in `osu-extension` where a markdown converter ate a leading `0.`, indexing
  `0.5–1 lb ai` as `5–1 lb ai` — a citable 10× dose error, retrievable today.

Unit 6 therefore includes a **numeric-fidelity spot check** on this document's rate cells before the
source is enabled for anyone. If rates are corrupted the way EM 8413's are, that is a stop-and-report,
not a ship. This does not gate the prose; it gates enabling the source.

---

## Implementation units

### Unit 1: Breadcrumb normalisation — de-duplicate the root, preserve the leaf

**Goal:** A chunk's `sectionPath` names the section it came from, not the document title twice.
**Files:** `src/lib/knowledge/chunk.ts`
**Approach:** Two pure changes in the breadcrumb path.
(a) In `parseSegments`, before joining, drop any stack segment that is a near-duplicate of `rootTitle`
— normalise both (lowercase, collapse whitespace, strip punctuation) and drop when one contains the
other or they differ only by a leading year. Only drop a *stack* segment, never the root, and never
drop the leaf even if it matches.
(b) Rewrite `capBreadcrumb` to elide from the head: keep the leaf whole, then add ancestors right-to-left
while they fit, prefixing `…> ` when segments were dropped. If the leaf alone exceeds the cap, fall
back to the current word-boundary tail truncation on the leaf.
Keep `MAX_BREADCRUMB_CHARS = 140` and the exported signature — `capBreadcrumb` is exported and tested.
**Tests:** `test/knowledge-chunk.test.ts` —
- root duplicated as H1 differing by a leading year → the duplicate segment is dropped;
- exact duplicate → dropped; genuinely distinct heading that merely shares a word → **kept**;
- a deep stack over 140 chars → leaf present in full, `…>` prefix, length ≤ 140;
- leaf alone over 140 chars → tail-truncated with an ellipsis, length ≤ 140;
- a breadcrumb already under the cap → returned byte-identical (no regression for HTML sources);
- round-trip through `chunkMarkdown` on the Grape Guide heading shape → distinct `sectionPath` count
  rises well above 11 for the same input.
**Depends on:** none
**Execution note:** test-first — the assertions are cheap and this is pure logic.
**Patterns to follow:** existing pure-function tests in `test/knowledge-pdf-structure.test.ts:25-330`.
**Verification:** `npx vitest run test/knowledge-chunk.test.ts`

### Unit 2: Force PDF re-extraction

**Goal:** The extractor change actually reaches already-indexed PDFs instead of short-circuiting.
**Files:** `src/lib/knowledge/extract/pdf-structure.ts`
**Approach:** Bump `PDF_EXTRACT_VERSION` from `"1"` to `"2"`. `deriveIndexHash` folds it into the
index hash for PDFs, so unchanged bytes still re-index. Note in the constant's comment that Unit 1
changed breadcrumb output.
**Tests:** none of its own — the behaviour is covered by the existing `deriveIndexHash` tests; assert
in review that the constant is referenced by `sections/index.ts:102-113`.
**Depends on:** Unit 1
**Verification:** `grep` the constant is consumed by `deriveIndexHash`; `npx vitest run test/knowledge-sections-*.test.ts`

### Unit 3: The source config, trusted domain, and curated spec

**Goal:** The Grape Guide is a registered, crawlable, single-PDF curated source.
**Files:** `src/lib/knowledge/config.ts`, `src/lib/knowledge/curated-specs.ts`
**Approach:** Add a `KNOWLEDGE_SOURCES` entry keyed `cornell-grape-guide`:
`publisher` "Cornell Cooperative Extension — NY/PA Pest Management Guidelines for Grapes";
`homeDomain` `cropandpestguides.cce.cornell.edu`; `tier: 1`; `autoCrawl: false`;
`crawlCadence: "manual"`; `seedRoots: [<the preview URL>]` (non-empty — `crawler.ts` dereferences
`seedRoots[0]`); **`allowPrefixes: []`** so it can never be path-crawled; `defaultEnabled: false`.
The `license` string must state, in the house style where every source carries its reasoning: paid
publication, this is the free 25-page preview excerpt, © 2025 Cornell University all rights reserved,
no licence granted, cite-and-link-back only, **withdraw on request from the publisher**, and that the
full guide is sold by the Cornell Store. Add a `TRUSTED_DOMAINS` row for the host (without it
`crawlUrls` silently drops the fetch). Add a `CuratedSpec` with `directUrls: [<the preview URL>]` and
`delayMs: 2000`; the file is 2.4 MB so the 15 MB default `maxBytes` is fine — do not raise it.
Follow the `mapa` single-PDF precedent at `curated-specs.ts:85-92`.
**Tests:** covered by Unit 4.
**Depends on:** none
**Patterns to follow:** `config.ts:449-462` (`mapa`), `config.ts:159-193` (`viticulture-extension-refs`
fail-closed `allowPrefixes: []`), `config.ts:557-616` (`vt-enology-notes` licence-posture prose).
**Verification:** `npx vitest run test/knowledge-config.test.ts`

### Unit 4: Registry-integrity coverage for the new source

**Goal:** The invariants that make a curated source work are asserted, not hoped for.
**Files:** `test/knowledge-config.test.ts`
**Approach:** The existing suite already enforces the general rules (every `directUrls` host trusted,
every curated source operator-reachable, no bare-root allow on a shared host, unique keys). Add a
source-specific `describe` in the shape of the `cornell-grapes` / `msu-grapes` blocks asserting:
`allowPrefixes` is empty; `autoCrawl` is false; `defaultEnabled` is false **at merge time**; the
single `directUrls` entry is the preview URL on the trusted host; and the `license` string mentions
the withdraw-on-request posture, so a future edit that quietly drops it fails the build.
**Tests:** the unit is tests.
**Depends on:** Unit 3
**Patterns to follow:** `test/knowledge-config.test.ts:306`, `:339`, `:358`.
**Verification:** `npx vitest run test/knowledge-config.test.ts`

### Unit 5: Close the `TODOS.md` breadcrumb entry and record the deferral

**Goal:** The docs match reality; the deferred re-index has a tripwire instead of being forgotten.
**Files:** `TODOS.md`, `docs/architecture/scale-register.md`, `NOW.md`
**Approach:** Rewrite the "Chunk breadcrumbs carry the page `<title>`" entry: the code defect is fixed
(Unit 1), but **the corpus is not** — existing chunks keep their old breadcrumbs until re-indexed,
because `indexDocument` early-returns on an unchanged content hash and HTML without a section filter
hashes on bare `contentHash`. State exactly what remains (an HTML re-index across ~25 sources), what it
costs (~23.5k chunks re-embedded), and the lever (`reindex:knowledge`, or `reset:knowledge-source` +
re-crawl per source). Add the tripwire to `scale-register.md`. Update `NOW.md` per the focus-spine
convention.
**Depends on:** Unit 1
**Verification:** the entry names a command and a cost; `npm run verify:invariants` still green.

### Unit 6: Staged rollout (operator sequence, ordered — not a script)

**Goal:** The source is live, measured, and enabled without displacing the existing corpus.
**Files:** none — this is the operator runbook, run from a checkout with `.env`.
**Approach:** Strict order. Each step's failure is a stop.
1. **Capture the displacement baseline BEFORE anything changes:** `verify:kb-register -- --capture`
   and `kb:snapshot -- --repeat 3`. Retrieval is not fully deterministic (~1 query in 18 wobbles); a
   single-run diff proves nothing.
2. **Merge and deploy.** Seeding before deploy is the recorded landmine.
3. `npm run seed:knowledge-sources` — idempotent upsert. Until this runs the source does not exist to
   the crawler, which reads sources from the **DB**, not config.
4. `npm run crawl:curated -- cornell-grape-guide --dry-run`, then the real run. The monthly sweep
   **cannot** populate a new source, and `autoCrawl: false` keeps it out of that sweep permanently.
5. **Read the rows back** — counters lie. Assert in SQL: one `knowledge_document`, `contentType = 'pdf'`,
   `status = 'active'`, `publishedAt` = 2025-04-30, `canonicalTitle` is the real title, chunk count > 0,
   every chunk has a non-null `embedding` at `voyage-4`/1024, and **`COUNT(DISTINCT sectionPath)` is
   materially above 11** — that last one is the proof Unit 1 reached the corpus.
6. **Numeric-fidelity spot check** (see the tier-C note above): pull the chunks covering pages 22-24 and
   compare a sample of rate / REI / days-to-harvest cells against the PDF. A leading-zero or
   digit-dropping corruption of the EM 8413 kind is a **stop and report**, not a ship.
7. Re-run `verify:kb-register` against the baseline. Displacement over the 25% threshold → keep
   `defaultEnabled: false` and report rather than flipping.
8. Enable for Demo Winery only, via a `KnowledgeSourceSubscription` row. Verify in `/settings` that the
   toggle renders and flips, and that a citation resolves through `/kb/source/[id]` to the PDF.
9. Measure slot occupancy on grower-shaped queries. Only then flip `defaultEnabled: true` in a
   follow-up, and re-capture **both** baselines together.
**Depends on:** Units 1-5 merged
**Verification:** `verify:knowledge-base`, `verify:kb-subscriptions`, `verify:kb-register` all green.

---

## Test strategy

Pure logic (Units 1-4) is unit-tested and runs in CI: `knowledge-chunk`, `knowledge-config`,
`knowledge-sections-*`. Everything requiring the live corpus, `VOYAGE_API_KEY`, or the production
database (Unit 6) runs from a checkout with `.env` and is **not** in CI, matching how every prior KB
source shipped.

The load-bearing assertion is not "the crawl reported success" — it is step 5's row read-back plus the
distinct-`sectionPath` count. Plan 090's lesson was that three separate silent no-ops each produced a
green run that changed nothing.

---

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cornell objects to the preview being indexed | Low-Medium | Owner-accepted. `license` records the posture; withdrawal is `active: false` + `reset:knowledge-source`, a one-line flip. |
| Tier-C rate tables produce an unsafe paraphrase | **Medium** | Unit 6 step 6 numeric spot check gates enablement. Residual risk explicitly accepted by the owner; the guide's own "not a substitute for labeling" disclaimer is in the ingested text. |
| Unit 1 moves retrieval for existing sources | Medium | It changes embedded text only for docs that get re-indexed; `verify:kb-register` before/after is the gate. Under-cap breadcrumbs are asserted byte-identical. |
| Mixed breadcrumb formats in the corpus | **High — accepted** | D5. Old HTML chunks keep old breadcrumbs until a re-index. Tripwired in Unit 5, not silently ignored. |
| `PDF_EXTRACT_VERSION` bump re-indexes every PDF at once | Medium | ~893 PDF docs re-embed on their next crawl. Cost is Voyage calls, spread across the monthly sweep rather than one burst; `reindex:knowledge --pdf-only` is the lever if it needs forcing. |

---

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | **HIGH** | The PDF was fetched and run through the real pipeline; every number here is measured, not estimated. |
| Scope Boundaries | **HIGH** | Toggle and citation surfaces verified as already-built. |
| Implementation Units | **HIGH** | Units 1-4 are pure functions and config with an existing precedent (`mapa`) and a pre-written fix shape (`TODOS.md`). |
| Test Strategy | **MEDIUM** | Unit tests are straightforward; the numeric-fidelity check in Unit 6 is a manual sample, not an automated gate. Making it automated would need a fixture of expected cells. |
| Risk Assessment | **MEDIUM** | The licensing risk is a business judgement already made. The tier-C correctness risk is real, partially mitigated, and consciously accepted. |

---

## Success criteria

- [ ] `capBreadcrumb` preserves the leaf and elides ancestors; under-cap breadcrumbs unchanged byte-for-byte.
- [ ] A root title duplicated as an H1 is de-duplicated; a merely similar heading is not.
- [ ] The Grape Guide chunks to **materially more than 11 distinct `sectionPath` values**, with < 10%
      of chunks truncated (from 97%).
- [ ] `cornell-grape-guide` is registered, `autoCrawl: false`, `allowPrefixes: []`, `defaultEnabled: false`.
- [ ] Exactly one document ingested from `cropandpestguides.cce.cornell.edu`; no other URL on that host.
- [ ] `publishedAt` = 2025-04-30 and the real title persisted **after** indexing.
- [ ] Rate cells spot-checked against the PDF with no digit corruption.
- [ ] `verify:kb-register` within threshold vs a baseline captured before the change.
- [ ] The source renders and toggles in `/settings`; a citation resolves to the PDF.
- [ ] `TODOS.md` breadcrumb entry reflects code-fixed / corpus-pending, with the re-index tripwired.
