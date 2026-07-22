---
title: KB RAG retrieval quality — fix the corpus before growing it
type: fix
status: draft
date: 2026-07-22
branch: claude/kb-rag-enology-viticulture-edde77
depth: deep
units: 11
---

## Overview

42% of the knowledge corpus is chunked wrong. `chunkMarkdown` is heading-driven, but
`extractPdf` emits headingless linearized text — so for 893 PDF documents (11,051 chunks)
the "section breadcrumb" degenerates to the first ~192 characters of page one, prepended
verbatim to every chunk of that document, and embedded, and indexed into the tsvector.

This plan fixes the ingest path, backfills title/date metadata that 95% of the corpus is
missing, and — first — builds an eval instrument that can actually see the defect. The AJEV
(American Journal of Enology and Viticulture) open-access import is explicitly deferred
until this lands. Adding 4,000 more chunks to a corpus with this defect would make it worse.

## Problem Frame

A winemaker asks the assistant *"what are the best nutrients to add to Pinot noir
fermentation."* Today they get: a 2015 OWRI newsletter masthead at rank 1, four 1996–1999
Oregon research reports with no visible date, the same document twice, and **zero AWRI** —
despite AWRI owning the canonical YAN page that ranks #1 on a differently-phrased query.

The citation then reads "Oregon Wine Research Institute (OSU)" with no document title,
because `canonicalTitle` is null for 95% of the corpus and `citation.ts` renders
`canonicalTitle || publisher`.

**Doing nothing costs compounding.** Every source added inherits the defect, and the eval
suite stays green throughout because it only asserts "expected doc in top-k" — it cannot
see the other 5 of 8 slots.

**Product pressure test:** the request was framed as "clean up the KB." The measurement
says it is narrower and more tractable than that: one structural bug in the PDF path
explains most of the observed symptoms. Fix the mechanism, not the symptoms.

## Requirements

- MUST: PDF documents produce meaningful `sectionPath` breadcrumbs, not a 192-char blob.
- MUST: an eval artifact that records the FULL ranked result set, diffable across changes.
- MUST: the VA query's current (excellent) behaviour is locked in as a regression guard
  BEFORE any chunking change.
- MUST: re-index strategy respects `revision` / `activeRevision` and the
  `sha256(documentId+revision+ordinal+text)` chunk id.
- MUST: eval primary signal stays deterministic. LLM-judge remains opt-in and secondary.
- SHOULD: backfill `canonicalTitle` and `publishedAt` for the ~2,975 / ~2,112 docs missing them.
- SHOULD: suppress boilerplate sections (references, acknowledgments, copyright pages).
- NICE: normalize ligature mojibake (113 chunks, 7 docs).

## Scope Boundaries

**In scope:**
- `src/lib/knowledge/extract/pdf.ts`, `chunk.ts`, `index-documents.ts`, `sections/`
- `scripts/verify-knowledge-base.ts` + a new committed snapshot artifact
- A corpus-wide re-index of affected documents

**Out of scope:**
- **The AJEV import.** Deferred by explicit decision until this plan lands and the snapshot
  diff is accepted. Research already done: AJEV went full open access 2025-01-01 under
  CC BY 4.0; `robots.txt` is stock Drupal with `Crawl-delay: 7`; ~150 OA papers exist today
  growing ~55/yr; pre-2025 is paywalled (abstracts free, full text $10). Do not re-research.
- **Tier weighting in `retrieve.ts`.** See Key Decisions — deliberately deferred, not forgotten.
- **AI-generated summary chunks.** Rejected; see Key Decisions.
- Any new knowledge source.

## Research Summary

### Measured corpus state (Neon, 2026-07-22)

| Metric | HTML | PDF | Total |
|---|---|---|---|
| Active documents | 2,001 | 1,119 | 3,120 |
| Chunks | 14,978 | 11,275 | 26,253 |
| Multi-chunk docs with exactly ONE distinct `sectionPath` | 597 | **893 (80%)** | 1,490 |
| Chunks in those docs | 3,492 | **11,051 (42% of corpus)** | 14,543 |
| Avg max `sectionPath` length | 96 chars | **192 chars** | — |
| `publishedAt` present | 851 (43%) | **157 (14%)** | 1,008 (32%) |
| `canonicalTitle` NULL | 1,920 (96%) | 1,055 (94%) | **2,975 (95%)** |

Ligature mojibake (`Ʃ`/`Ɵ`/`ﬁ`): **113 chunks across 7 docs** (osu-owri 110, ifv-france 3).
Far smaller than the initial estimate of 1,813 — deprioritized accordingly.

### Root cause

`chunk.ts:36-90` `parseSegments` builds the breadcrumb from a markdown heading stack:
`[rootTitle, ...headingStack].join(" > ")`. `chunk.ts:130` then prepends that breadcrumb
into `text` — the field that is embedded AND that backs the GENERATED `search_vector`.

`extract/pdf.ts:35-40` returns `markdown: clean`, which is unpdf's linearized text with
**no markdown headings**. So `isHeading()` (`chunk.ts:32`) never matches, the stack stays
empty, and every segment's breadcrumb is just `rootTitle`. When PDF metadata carries no
Title, `rootTitle = firstNonEmptyLine(clean)` — `extract/pdf.ts:23-29`, capped at 200 chars.

Net effect for 893 documents: a ~192-char slab of page-one text is prepended to every chunk,
embedded, and tsvector-indexed. A query matching that slab matches **every chunk of the
document equally**, on the prefix alone, regardless of body content.

This single defect explains: the newsletter masthead at rank 1, the four OWRI reports whose
prefix mentions nitrogen, and the "duplicate" ranks 5/8 (different chunks sharing an
identical 192-char prefix).

### MMR is NOT a bug

`mmr.ts:27-49` is a textbook correct implementation, λ=0.7. The apparent duplicate was the
shared-prefix artifact above. No work item; recorded so nobody re-investigates.

### Why the good case is good

AWRI's VA page is HTML with real headings, producing
`"Measurement of volatile acidity (VA) in wine > Steam distillation/titration"` —
a genuine breadcrumb at 96 chars. Retrieval there returns enzymatic / steam-distillation
(Cash still) / HPLC as separate comparable passages. That is the target behaviour, and it
is already achieved wherever structure survives extraction.

### Prior learnings

- **Plan 088:** the assistant LLM eval produced 9–12 failures across runs on IDENTICAL code;
  a single run of 6 was misread as improvement. **Compare failure SETS, not counts.** This is
  why the primary signal here stays deterministic.
- **Plan 084:** `sectionFilter: "anchor-heading"` (`src/lib/knowledge/sections/`) already
  exists for stripping non-technical sections within one URL. Extend it; do not reinvent.
- **Plan 084 date trap:** `new Date("Issue 2019")` → 2019-01-01. Never let a body-scan date
  become metadata. `extract/published-date.ts` already encodes this.
- Verify scripts need the MAIN checkout (`.claude/worktrees/*` has no `.env`).
- `verify-knowledge-base.ts:236-243` documents why null dates persist: `indexDocument`
  early-returns on unchanged content, so pre-084 documents keep null title/date until a
  forced re-index. This is why one re-index pass fixes structure, titles, and dates together.

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|---|---|---|---|
| Fix order | Instrument first, then mechanism | Fix chunking first, measure after | Without a baseline snapshot there is no way to prove the change helped. Non-negotiable. |
| PDF structure | Infer headings from PDF.js text-item font size / position | Keep linearized text; add a separate `contextHeader` column | The breadcrumb machinery already works — it is starved of input, not broken. Feeding it real headings fixes 42% of the corpus with no schema change. |
| Breadcrumb in `text` | Keep it in `text` for now | Move to separate column, embed `header + text`, keep tsvector on `text` alone | Once breadcrumbs are short and real (96 chars, like HTML), tsvector pollution is minor. Revisit if the snapshot diff shows lexical-arm regression. Recorded so this is a decision, not an oversight. |
| Tier weighting in scoring | **Deferred** | Add tier as an RRF weight now | The PDF fix may remove the need. Changing scoring at the same time as ingest makes the snapshot diff uninterpretable. One variable at a time. |
| AI summary chunks | **Rejected** | Generate practical takeaways as extra chunks | `topK=6` is a fixed slot budget, so "in addition to" is false in retrieval — a synthetic chunk that wins a slot displaced a verbatim one. Also breaks the citation contract: user clicks through, sentence is not in the source. |
| AJEV import | **Deferred** until this lands | Import alongside | Adding ~4,000 chunks to a corpus with a 42% structural defect compounds it. |
| LLM judge | Stays opt-in + secondary | Make it the primary signal | Plan 088: 9–12 noise on identical code. |

## Implementation Units

### Unit 1: Ranked-snapshot eval artifact

**Goal:** Make the full ranked result set visible and diffable, so any change produces exact
before/after evidence.
**Files:** `scripts/verify-knowledge-base.ts`, new `scripts/kb-snapshot.ts`,
new `docs/kb-eval/snapshot.json` (committed)
**Approach:** For every eval query, record ordered `{rank, publisher, tier, canonicalUrl,
sectionPath, publishedAt, dateSource, textHash}`. Write to a stable-sorted JSON committed to
the repo. Add a `--diff` mode that compares current retrieval against the committed snapshot
and prints per-query rank movements. Do NOT gate CI on the diff yet — it is an evidence artifact
this round.

⚠️ **CORRECTED DURING EXECUTION.** This unit originally asserted "retrieval is deterministic
(pgvector cosine + `ts_rank`), so a diff is signal, not noise." **That was measured and found
false.** Two causes were investigated:

1. **FIXED — neither arm had a total `ORDER BY`.** `ts_rank` produces coarse, heavily-tied scores
   (measured: 2 tied rows inside the top 40 for the leafroll/mealybug query), and there is no ANN
   index on `embedding`, so the dense arm is a sequential scan. With `LIMIT candidateK`, a tie
   straddling the cut changed which candidate survived, and that propagated through RRF and MMR.
   Both arms now carry a `, c."id"` tiebreaker. This only decides among rows that already scored
   equal, so it changes no ranking that was actually determined.
2. **NOT FIXED — residual, unidentified.** ~1 query in 18 still varies between runs. Ruled out by
   direct experiment: the embedding API returns bit-identical vectors (cosine 1.000000000000
   across calls); both SQL arms return identical chunk-id lists across 4 in-process executions;
   the corpus had no write in 2 days. Cause unknown. See Unit 1b.
**Tests:** Unit-test the diff formatter (pure): identical input → empty diff; a swapped pair →
two movements; a new URL → an insertion.
**Depends on:** none
**Execution note:** test-first
**Patterns to follow:** `scripts/verify-knowledge-base.ts:100-106` assert helper.
**Verification:** `npm run verify:knowledge-base` still passes; `kb-snapshot.ts` run twice
back to back yields an empty diff.

### Unit 1b: Make the instrument noise-tolerant  (ADDED DURING EXECUTION)

**Goal:** Stop an unexplained wobble from being readable as a regression.
**Files:** `scripts/kb-snapshot.ts`, `scripts/kb-snapshot-diff.ts`, `test/knowledge-snapshot-diff.test.ts`
**Approach:** Capture each query `--repeat N` times (default 3) and trust it only when all repeats
agree on the DOCUMENT PROFILE — `profileKey`, keyed on exactly what the diff compares (url,
bestRank, count) and nothing else. Judging stability on raw row equality would flag harmless
`sectionPath`/`textHash` churn and throw away usable queries. An unstable query is KEPT in the
artifact with its first observation and flagged `unstable: true`; `diffSnapshots` refuses to
compare it and `formatDiff` names it. Never silently dropped — a query vanishing from the artifact
would read as "unchanged".
**Tests:** `profileKey` equality/inequality across order, rank, count and identity changes;
`diffSnapshots` refuses comparison when EITHER side is unstable; stable queries still compare
normally alongside unstable ones; `formatDiff` excludes unstable from the moved count.
**Depends on:** Unit 1
**Verification:** ✅ DONE. Baseline captured at `--repeat 3`: **16 stable, 2 unstable** (the
yeast-strain and tirage queries — both have unusually broad valid-source sets, i.e. many near-tied
candidates). Two consecutive `--diff` runs both report "no change" across all 16 stable queries and
name the same 2 unstable ones.

⚠️ **Consequence for Unit 10:** the two unstable queries cannot testify about the re-index either
way. If the residual cause is found later, re-baseline and they rejoin. Until then, treat 16/18
coverage as the honest figure rather than claiming 18.

### Unit 2: Lock in what already works + close the named coverage gaps

**Goal:** Regression-guard the good behaviour before touching chunking, and add the two cases
the user named.
**Files:** `scripts/verify-knowledge-base.ts`
**Approach:** Add a VA case (`expectPaths: ["/va/"]`, `expectFact: ["distillation", "Cash"]`)
— currently absent, and retrieval there is excellent, so it is pure downside protection.
Promote the hardcoded diversity check (`verify-knowledge-base.ts:219-232`) into a reusable
case type with `expectPublishers: string[]` + `minPublishers`. Add the nutrient case
(`"what are the best nutrients to add to Pinot noir fermentation"`) expecting AWRI **and**
OWRI/OSU. **Expect the nutrient case to FAIL initially** — that is the point; it encodes the
target state.
**Tests:** The suite is the test. Mark the nutrient case as a known-failing baseline in the
snapshot so it does not read as a regression.
**Depends on:** Unit 1
**Verification:** VA case passes; nutrient case fails with a legible diagnostic.

### Unit 3: Capture and commit the baseline

**Goal:** A committed pre-change snapshot, so every later unit is measurable.
**Files:** `docs/kb-eval/snapshot.json`
**Approach:** Run the harness against the live corpus from the MAIN checkout. Commit
verbatim. No code changes in this unit.
**Tests:** none (artifact capture)
**Depends on:** Units 1, 2
**Verification:** Snapshot committed; re-run produces an empty diff.

### Unit 4: Real PDF titles + bounded breadcrumbs

**Goal:** Stop a 192-char slab of page-one text from becoming the document title.
**Files:** `src/lib/knowledge/extract/pdf.ts`, `src/lib/knowledge/chunk.ts`
**Approach:** Replace `firstNonEmptyLine`'s 200-char cap with a real title heuristic —
prefer PDF metadata Title (already read at `pdf.ts:51`), else the first line that looks like
a title (bounded length, not a sentence, not a date line). Add a hard breadcrumb length cap
in `chunk.ts` so no future extractor can reintroduce this. Cap should be near the HTML
average (96 chars), not the PDF max (192).
**Tests:** Pure unit tests on the title heuristic: metadata title wins; a long first
paragraph does NOT become a title; a bare date line is skipped; breadcrumb cap is enforced.
**Depends on:** Unit 3
**Execution note:** test-first
**Patterns to follow:** `extract/published-date.ts` `cleanPdfTitle` already does related work.
**Verification:** `npm test` green; re-extract one OWRI PDF and inspect the title.

### Unit 5: Infer heading structure from PDF text items

**Goal:** Give `chunkMarkdown` real segments for the 893 single-section PDF documents.
**Files:** `src/lib/knowledge/extract/pdf.ts`
**Approach:** `unpdf`'s `extractText` linearizes and discards layout. Use `getDocumentProxy`
+ per-page `getTextContent()` to access text items with their transform matrices and font
refs, then classify a line as a heading when its font size exceeds the page's body-text mode
by a margin (and/or it is short, bold, and followed by body text). Emit markdown `#`/`##`
so the existing `chunk.ts` pipeline consumes it unchanged. Fail SOFT: if heading inference
finds nothing, fall back to today's linearized text — a PDF that resists structure must still
yield its text.
**Tests:** Fixture-based. Commit 3–4 small representative PDFs (one OWRI report, one AWRI
fact sheet, one scanned/low-confidence) and assert segment counts and breadcrumb shapes.
Assert the soft-fallback path on a headingless fixture.
**Depends on:** Unit 4
**Execution note:** characterization-first — capture today's output for the fixtures before
changing behaviour.
**Verification:** Re-extract the fixtures; the OWRI report yields >1 distinct `sectionPath`.

### Unit 6: Boilerplate section suppression

**Goal:** Stop reference lists, acknowledgments, copyright pages, and mastheads from winning
top-k slots.
**Files:** `src/lib/knowledge/sections/classify-section.ts`, `sections/index.ts`,
`src/lib/knowledge/config.ts`
**Approach:** Extend the plan-084 section classifier with a heading-text denylist
(References / Bibliography / Further reading / Acknowledg\* / Literature cited / Copyright /
About this newsletter / Upcoming events, plus non-English equivalents for the FR/ES/DE
sources). Applies generically once Unit 5 gives PDFs real headings. Drop the section rather
than downweight it — there is no downweight mechanism in `retrieve.ts` and adding one is
out of scope this round.
**Tests:** Pure classifier tests, including the multilingual cases and a
false-positive guard (a section legitimately titled "Further reading" that contains dosing
guidance must not silently vanish — assert the classifier keys on heading AND section shape).
**Depends on:** Unit 5
**Execution note:** test-first
**Patterns to follow:** `sections/classify-section.ts` existing anchor-heading classifier.
**Verification:** The AWRI VA document no longer emits a `References and further reading` chunk.

### Unit 7: Ligature normalization

**Goal:** Fix `NewsleƩer` / `informaƟon`. Small but free once the extractor is open.
**Files:** `src/lib/knowledge/extract/pdf.ts`
**Approach:** Normalize the known ligature set on extraction output. Explicit map, not blanket
NFKC — NFKC also rewrites characters that matter in chemical and unit notation.
**Tests:** Pure: `Ʃ`→`tt`, `Ɵ`→`ti`, `ﬁ`→`fi`, and an assertion that superscripts / degree
signs / µ are untouched.
**Depends on:** Unit 4
**Execution note:** test-first
**Verification:** 113 affected chunks re-index clean; corpus query for `[ƩƟﬀﬁﬂﬃﬄ]` returns 0.

### Unit 8: Title + date backfill on re-index

**Goal:** Populate `canonicalTitle` (2,975 docs) and `publishedAt` (2,112 docs).
**Files:** `src/lib/knowledge/index-documents.ts`
**Approach:** No new extraction logic — plan-084 already writes both. The gap is that
`indexDocument` early-returns on unchanged content, so pre-084 documents never re-ran. Add a
force path that re-extracts metadata even when the content hash is unchanged. Honour the
fabricated-date rule: a body-scan date must never be promoted to metadata.
**Tests:** A doc with an unchanged hash but null title gets a title on forced re-index; a doc
whose only date is a body-scan year stays null.
**Depends on:** Units 4, 5, 7
**Verification:** `canonicalTitle` NULL count drops well below 2,975; spot-check 10 citations
render a document name rather than a bare publisher.

### Unit 9: Corpus re-index execution

**Goal:** Apply Units 4–8 to the live corpus safely.
**Files:** `scripts/reindex-knowledge-corpus.ts` (new)
**Approach:** Batched, resumable, source-scoped (`KB_SOURCES=` like the existing crawl
scripts). Bump `revision` per document and set `activeRevision` only after every chunk of that
document has embedded successfully — `retrieve.ts:96-97` filters on `activeRevision`, so a
half-written revision is invisible rather than corrupting. That property makes this rollback-safe
by construction; verify it explicitly. Re-embedding ~26k chunks at ~512 tokens is roughly
13M tokens — order $1–3, so cost is not a constraint; wall-clock and rate limits are.
Run PDF-heavy sources first (osu-owri, wbi, lvwo) since they carry the defect.
**Tests:** Dry-run mode reporting affected doc/chunk counts without writing. Assert an aborted
run leaves `activeRevision` untouched.
**Depends on:** Unit 8
**Verification:** Post-run SQL — docs with exactly one distinct `sectionPath` drops sharply
from 893; avg max `sectionPath` length for PDFs approaches the HTML 96.

### Unit 10: Post-change snapshot diff and human accept

**Goal:** Prove the change helped, per query, with evidence.
**Files:** `docs/kb-eval/snapshot.json`, `docs/kb-eval/DIFF-090.md` (new)
**Approach:** Re-run the harness, diff against the Unit 3 baseline, write the diff up per
query with a verdict. **A displacement is not automatically a regression** — the existing
precedent is `verify-knowledge-base.ts:61-66` (UC IPM outranking MAPA/PNW was retrieval
getting better) and the pre-written note at `:76-80`. Each movement needs a human call.
Commit the new snapshot only once accepted.
**Tests:** none (analysis artifact)
**Depends on:** Unit 9
**Verification:** The nutrient case from Unit 2 now passes; the VA case still passes; every
other movement has a written verdict.

### Unit 11: Decide on the deferred items

**Goal:** Close the loop on what was deliberately parked, with data now in hand.
**Files:** `docs/architecture/decisions/` (ADR if warranted), `NOW.md`, `TODOS.md`
**Approach:** With the snapshot diff in hand, decide: (a) does `retrieve.ts` still need tier
weighting; (b) should the breadcrumb move out of `text` (only if the diff shows lexical-arm
regression); (c) is the AJEV import now safe to plan. Record as an ADR if any answer changes
architecture.
**Depends on:** Unit 10
**Verification:** Each deferred item has a written decision, not a silent drop.

## Test Strategy

**Unit tests:** `test/` alongside existing `voice-*` / `kb-*` patterns. Everything pure gets
covered: title heuristic, breadcrumb cap, heading inference classifier, ligature map, section
denylist, snapshot diff formatter.

**Fixture tests:** 3–4 committed representative PDFs for heading inference. Characterization
first — capture current output before changing it.

**Integration:** `npm run verify:knowledge-base` (existing gate) plus the new ranked-snapshot
diff (evidence artifact, not a gate this round).

**Manual verification:** run the three probe queries from this investigation (nutrients, VA,
YAN control) and read the top-8 by eye. The nutrient query is the acceptance case: AWRI
present, no masthead, dates visible.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Heading inference is unreliable across heterogeneous PDFs | HIGH | MED | Fail soft to today's behaviour; fixture tests across 3 shapes; a PDF that resists structure is no worse than today |
| Re-index makes some queries worse | MED | MED | That is what the snapshot diff is for. `activeRevision` gating makes rollback per-document |
| Section denylist deletes real content | MED | HIGH | Classifier keys on heading AND section shape, not heading alone; explicit false-positive test |
| Breadcrumb removal from tsvector changes lexical behaviour unexpectedly | MED | MED | Deliberately NOT doing it this round; revisit only if the diff shows regression |
| Doing 5 things at once makes the diff uninterpretable | MED | HIGH | Units are individually verifiable; snapshot can be re-captured between units if a movement is confusing |
| **Residual retrieval nondeterminism (~1 query in 18), cause unidentified** | **CONFIRMED** | MED | Unit 1b: repeat-and-consensus capture; unstable queries flagged and excluded from diffs rather than silently compared. Coverage is honestly 16/18, not 18/18 |
| Scope creep into AJEV | LOW | MED | Explicitly out of scope; research preserved above so it costs nothing to resume |

## Success Criteria

- [ ] Ranked-snapshot artifact committed; two consecutive runs diff empty
- [ ] VA case passes before AND after (no regression on the known-good path)
- [ ] Nutrient case passes: AWRI present alongside OWRI/OSU, no masthead in top-8
- [ ] Docs with exactly one distinct `sectionPath` drops well below 893
- [ ] Avg max `sectionPath` length for PDFs approaches the HTML 96 chars
- [ ] `canonicalTitle` NULL count drops well below 2,975 — citations name a document
- [ ] Corpus query for `[ƩƟﬀﬁﬂﬃﬄ]` returns 0 chunks
- [ ] Every snapshot movement has a written better/worse verdict
- [ ] `npm run verify:knowledge-base` green
- [ ] Deferred items (tier weighting, breadcrumb column, AJEV) each have a written decision

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Root cause traced to specific lines and confirmed by SQL across the whole corpus |
| Scope Boundaries | HIGH | AJEV explicitly deferred with research preserved |
| Implementation Units | MEDIUM | Unit 5 (PDF heading inference) is the unknown — unpdf's text-item API surface has not been verified hands-on, only reasoned about |
| Test Strategy | HIGH | Everything material is pure and unit-testable; fixtures cover the rest |
| Risk Assessment | MEDIUM | The "did retrieval get better" judgment stays human, by design |

**What would raise Unit 5 confidence:** a 20-minute spike against one OWRI PDF confirming
`getTextContent()` exposes usable font-size data through unpdf's re-export. If it does not,
the fallback is heading inference from text-shape heuristics alone (short line, title case,
followed by a paragraph), which is weaker but still far better than a single 192-char blob.
