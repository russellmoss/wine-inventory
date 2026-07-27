---
title: KB text integrity (silent chunker text loss) + PNW Handbooks grape ingestion
type: fix
status: draft
date: 2026-07-26
branch: claude/kb-text-integrity-and-pnw-handbooks
depth: deep
units: 12
---

## Overview

Russell asked for two extension sources in the knowledge base: OSU's EM 8413 pest management guide
and the grape/insect/weed/pesticide-safety pages of the PNW Pest Management Handbooks, crawled
continually. Recon found EM 8413 is **already** indexed, and finding out *why it looked wrong*
uncovered a silent text-loss bug in our own chunker that affects every source in the corpus.

So this plan is three things in dependency order: fix the chunker (a live correctness bug),
repair what it damaged, then add PNW Handbooks behind the KB-1 boundary gate.

## Problem Frame

**Who has the problem:** any user who asks the assistant a spray, rate, or dosing question and gets
a cited passage back. Citations make corrupted text *more* dangerous, not less, because the citation
is the thing that makes it look trustworthy.

**The actual problem, in three layers:**

1. `splitBySentences()` in `src/lib/knowledge/chunk.ts:115` **silently deletes text**. Its regex
   `/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g` cannot match a `.` that is not followed by whitespace, and
   `String.prototype.match(/…/g)` *skips* unmatched spans rather than failing. So a decimal sitting
   after the last sentence boundary falls into a dead zone and vanishes:
   `"abc. 0.5 def".match(...)` → `["abc. ", "5 def"]`. The `0.` is gone, with no error and no marker.
   `tailForOverlap()` at line 131 uses the **same regex**, so overlap tails carry the same loss.
   This fires only on blocks over `MAX_TOKENS` (700) that take the force-split path, which is why it
   went unnoticed. In `osu-extension`'s EM 8413 it produced `5–1 lb ai` from `0.5–1 lb ai`,
   `5 lb ai` from `0.5 lb ai`, and `5 inch of water` from `0.5 inch of water`. **A tenfold dose
   error, citable, live.** It is not decimal-specific: the repro shows it can swallow ordinary prose
   too (`"before text 0.5 inch"` lost the whole `"before text 0."` prefix).

2. EM 8413 is indexed as the OSU **catalog page**, not the guide. Its three real rate tables are
   Airtable `<iframe>` embeds, so only the bare tag was indexed. Two `<table>` blocks leaked into
   chunk text as raw `<td headers="table-cell-413816-…">` markup. `publishedAt` says 2014-12-18 while
   the page links the **2026** edition, so freshness scoring treats an annually-revised safety
   document as twelve years stale.

3. PNW Handbooks is not in the registry at all, and adding it collides with the KB-1 tier-C rule in
   a way the recon did not anticipate (see Key Decisions).

**What happens if we do nothing:** the corpus keeps serving silently-truncated numbers from a
pesticide guide, and the two sources Russell asked for stay absent. The chunker bug also means
*every future ingest* keeps corrupting long blocks.

**Product pressure test.** The request was "ingest these two sources." The more valuable problem
turned out to be "our chunker eats text and nobody would ever have noticed." That reframing is
deliberate and is why the chunker fix is Unit 1 rather than a footnote. Flagging it here rather than
silently substituting scope: if Russell wants the sources first and the integrity fix later, the
units are ordered so PR A can be skipped, but it should not be.

## Requirements

- **MUST** stop `splitBySentences`/`tailForOverlap` from dropping input characters. Text loss must
  become structurally impossible, not merely unlikely, and must be proven by a property test.
- **MUST** re-index every document whose chunks could have been damaged, and prove the damage is gone.
- **MUST NOT** ingest tier-C product→fact tables into the corpus (invariant KB-1). The PNW disease
  and insect pages' `Chemical control` sections are tier C and must not be retrievable.
- **MUST** keep the KB-1 gate's pre-idempotency property (a source promoted to enforcing must not
  keep already-indexed tier-C chunks live forever).
- **MUST** ship `pnw-handbooks` with `defaultEnabled: false` and only flip it after a
  `verify:kb-register` displacement measurement against a baseline captured *before* the source exists.
- **MUST** exclude the 4 `oregon-grape-berberis-aquifolium-*` pages (*Mahonia*, an ornamental shrub)
  and the other 23 naive-regex false positives, by exact path prefix.
- **SHOULD** repair EM 8413 to point at the 2026 PDF rather than the catalog page.
- **SHOULD** give the pipeline a supported way to withdraw or re-index a **single** document. Today
  the only tool is `reset:knowledge-source`, which nukes an entire source.
- **SHOULD** correct `publishedAt` for annually-revised documents so freshness scoring is not lying.
- **NICE:** fix the raw-HTML table leak (925 chunks / 476 documents corpus-wide, dominated by
  `ifv-france`). Sized as its own plan, not this one.
- **NICE:** charset sniffing in `extract/index.ts` (latent, not currently triggered).

## Scope Boundaries

**In scope:**
- The `chunk.ts` text-loss fix and a corpus-wide re-index of affected documents.
- A single-document re-index / withdraw operator tool.
- EM 8413 repair (PDF discovery, withdrawal of the corrupted catalog-page chunks, date correction).
- A new `body-heading` section-filter strategy.
- Reordering the section filter to run **before** the KB-1 boundary gate.
- The `pnw-handbooks` source: config, crawl, seed, verify, staged enablement.

**Out of scope, and why:**
- **The raw-HTML table leak.** Defuddle abandons markdown conversion for any table containing
  `colspan`, leaving raw `<table>` HTML. That is 925 chunks across 476 documents, 753 of them in
  `ifv-france` alone (~55% of that source). Real, but it is an upstream-library problem with a much
  larger blast radius and it deserves its own plan. Filed to TODOS in Unit 12.
- **Ingesting the EM 8413 rate tables properly.** They are tier C. The correct outcome is to *not*
  have them, not to have them well.
- **The `virginia-fruit` orphan** (69 docs / 260 chunks / `defaultEnabled: true` / no config entry,
  retrievable today). It belongs to SKB Unit 7 and blocks the SKB merge, not this plan. Called out
  as a prerequisite risk.
- **A region dimension in retrieval.** The corpus has none, and `retrieve.ts` runs
  `mmrSelect(..., 0.7)` so 30% of selection weight is *dissimilarity*. Adding a Pacific-Northwest
  source can therefore make regional correctness worse. This plan **measures** the effect and gates
  on it (Unit 11); building the filter is SKB Unit 9's job.
- **Any change to the relational `pesticide_*` tables.** Product/rate/REI data lives there, and this
  plan does not add to it.

## Research Summary

### Codebase patterns

**Ingest order today** (`src/lib/knowledge/index-documents.ts`, on the SKB branch):
findUnique → **boundary gate (raw whole-page bytes, line 106-130)** → `deriveIndexHash` (148) →
**idempotency short-circuit** (151) → alias dedup (182) → **section filter** (190) →
`extractDocument` (239) → `chunkMarkdown` → embed → atomic revision flip.

**The section-filter seam** (`src/lib/knowledge/sections/`): `shouldApplySectionFilter` is a single
hardcoded string comparison, `findSourceConfig(sourceKey)?.sectionFilter === "anchor-heading"`
(`sections/index.ts:62`). `applySectionFilter` unconditionally calls `splitHtmlSections` at line 66
with no branching. There is no strategy map to extend — adding a second strategy means introducing
the dispatch. `deriveIndexHash` (`sections/index.ts:102-113`) folds `SECTION_FILTER_VERSION`
(currently `"4"`) into the stored hash, so enabling a filter on a source forces a re-index. Fail-open
on zero anchors; fail-closed (explicit `skipped: "empty"`, chunks cleared) when every section is dropped.

**The KB-1 gate** (`src/lib/knowledge/boundary/`, SKB branch): `assessProductTable(input)` returns
`{ verdict: "prose" | "product-table" | "uncertain", rowCount, signals, structured }` and **never
throws** (a throw in the fetch path is read by the recrawl tombstone pass as "page removed", which
would mass-tombstone a source). Two arms, not three: a structured `<table>` arm and a flat
"markup-lost" run arm. Thresholds `MIN_TABLE_ROWS = 4`, `MIN_FLAT_RUN = 4` → `uncertain`,
`STRONG_FLAT_RUN = 12` + a document header signal → `product-table`. `boundaryModeFor(key)` returns
`"enforce"` for **any key not in the 26-entry report-only census** — so a new source enforces on arrival.

**Withdrawal:** there is no supported single-document tool. `status`/`withdrawnAt` are written only
by the automatic tombstone pass in `recrawl-knowledge.ts:143`, and only on a confirmed 404/410.
`reset:knowledge-source` hard-deletes an entire source. `reindex:knowledge` operates on a
`--sources=` list with `--limit=N`, with no single-URL filter.

**Crawl entrypoints:** `crawlSource` is sitemap+seeds with no link following; `crawlWithFollowing`
follows links and understands `linkedOnlyPrefixes`; `crawlUrls` takes an explicit list and bypasses
`allowPrefixes` entirely. A new `autoCrawl: true` source with a declared sitemap needs one operator
`crawl:source <key>` run to populate, then the monthly sweep picks it up automatically via
`partitionSeededSources`.

**Seeding:** `scripts/seed-knowledge-sources.ts` persists only `publisher`, `homeDomain`, `tier`,
`license`, `seedRoots`, `allowPrefixes`, `denyPrefixes`, `crawlCadence`, `defaultEnabled`, `active`.
`sitemapUrls`, `autoCrawl`, `sectionFilter`, `linkedOnlyPrefixes`, `allowPaths` are **code-only** —
no migration needed for any of them.

### Measured facts from recon (2026-07-26, commit `a28704ea`)

| Slice | Pages | Product-signal line density | Disposition |
|---|---|---|---|
| `/pesticide-safety` | 16 | 0% | Ingest whole, no filter |
| `/insect/small-fruit/grape` | 17 | 22% | Section-filter, prose only |
| `/plantdisease/…/grape-vitis-spp-` | 27 (+1 cultivar table) | 30% | Section-filter, prose only |
| `/weed/…/vineyard-grape` children | 7 | 46%, effectively 100% tier C | **Do not crawl** |

robots for `pnwhandbooks.org`: `User-agent: *` → `Allow: /`, `Crawl-delay: 10`, Content-Signal
`search=yes, ai-train=no, use=reference`. `CellarhandKnowledgeBot` is **not** on the named blocklist
(`ClaudeBot`, `GPTBot`, `CCBot`, `Google-Extended`, `Bytespider`, `Amazonbot`, `Applebot-Extended`,
`meta-externalagent` are). This is the same posture already recorded for `osu-extension`; OSU hosts both.
One flat sitemap, 4,999 locs, well-formed. Per-page `Last-Modified` exists but is Varnish-generated
(all "today"), so it is useless for change detection — content hash is the seam. Defuddle extraction
is clean (3,836 words on powdery mildew, zero `<table>` elements on these pages).

### Prior learnings

`rstack-learnings-search` is not installed in this environment (see memory
`rstack-tooling-gaps-this-install`), so this section draws on the auto-memory index instead:

- `kb-new-source-needs-manual-crawl` — the monthly sweep **cannot** populate a new source. One
  operator crawl is mandatory.
- `kb-section-filter-and-seed-gotchas` — `seed:knowledge-sources` is **required** or the sweep
  ignores the source entirely.
- `kb-source-licensing-and-displacement-gate` — capture the `verify:kb-register` baseline **before**
  adding the source.
- `kb-seed-after-deploy-ordering` — seeding an unmerged source killed recrawl for **all** sources.
  Seed only after the config is on main.
- `kb-crawler-fetch-integrity-gotchas` — a `fetchDocument` **throw** is read as "removed" and
  mass-tombstones. Any new gate must return a typed non-throw.
- `kb-publication-date-seam` — `new Date("Issue 2019")` → 2019-01-01; 735 corpus dates came from the
  body-scan arm, so the metadata-only path is not sufficient.
- `vercelignore-scripts-test-build-break` — `scripts/*.ts` importing `test/` breaks the Vercel build
  (not CI). Keep repro scripts out of `scripts/`.
- `main-repo-has-env-verify-runs` / `build-in-main-checkout-not-worktrees` — this worktree has no
  `.env` and no `node_modules`. All DB and `verify:*` work runs from `C:\Users\russe\Documents\Wine-inventory`.
- `prisma-neon-migrations-windows` — not expected to apply (no schema change in this plan), but if
  one appears: `migrate diff` is unsafe here, hand-author the SQL.

### External research

None needed. No new dependency, no unfamiliar framework. Defuddle behavior was characterized
empirically during recon rather than from docs.

## Key Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| **Section filter vs KB-1 gate ordering** | Move section filtering to run **before** the boundary gate, for sources that declare a filter | (a) leave the order alone; (b) make the gate section-aware internally; (c) grandfather `pnw-handbooks` onto the report-only census | **This is the crux of the plan.** Today the gate reads the whole raw page at `index-documents.ts:106`, and the section filter does not run until line 190. A PNW disease page contains a long bulleted product run in `Chemical control`, so an enforcing gate would verdict `product-table` and drop **the entire document** — biology and all — before the filter ever gets to strip the offending section. Option (c) defeats the purpose (the census is meant to shrink to zero as D3 closes, not grow). Option (b) hides the ordering inside the detector. Filtering first makes the gate's question the right one: *"does the content we would actually index look like a product table?"* The filter becomes the mechanism for satisfying KB-1, and the gate keeps final say over what survives it. Both functions are pure over raw HTML, so the gate keeps its pre-idempotency position. |
| **The open scope call: prose-only or tier-B admission?** | **Prose-only.** Strip `Chemical control` / `Management-chemical control` from disease and insect pages | Admit the product sections as tier B, relying on the SKB legality-verdict refusal as the guardrail | Per the SKB council correction, tier B is admitted **for its value, not because it is safe** — the two-engine collision (corpus prose naming a product synthesizing into a clearance that overrides a relational `GAP`) is a property of *any* corpus content naming a product; tier C merely makes it dense. The biology sections are the entire reason to want this source, and they survive intact. The legality refusal is a hard precondition for admitting *anything* here, not a licence to admit more. |
| **The 7 `/vineyard-grape/` product children** | Do not crawl them at all | Crawl and let the filter/gate drop them | At ~100% tier C, a filter would strip everything and produce `skipped: "empty"` documents — pure noise in the crawl report, and 7 pointless fetches a month against a `Crawl-delay: 10` host. Keep the `vineyard-grape` hub and `weed-vegetation-management` (prose overviews) so the weed topic is not silently absent. |
| **`/pesticide-safety`** | Ingest whole, no section filter | Filter it like the rest | Measured 0% product-signal density. It is WPS, PPE, spill response, container disposal, pollinator protection and buffer zones — genuinely useful, and there is no boundary question. Also the lowest-risk slice, so it doubles as the canary. |
| **Path scoping** | Exact prefixes in `allowPrefixes`, plus `denyPrefixes` for the product children | A `grape`/`vine` keyword filter like `crawl-osu-extension.ts` uses | A naive regex takes 27 false positives, including four *Mahonia* pages that are not grapevines at all. The paths are cleanly namespaced, so prefixes are both simpler and safer. This is a normal `autoCrawl: true` source, not an operator script. |
| **`defaultEnabled`** | `false` at merge; flip only after measurement | `true` on arrival | Two reasons. The displacement gate (`verify:kb-register`) needs a before/after. And the region risk is real: a Pacific-Northwest source in a corpus with no region dimension and MMR diversity at 0.7 can pull a PNW chunk into a Bhutan answer. Stage it exactly as `ives-technical-reviews` was staged. |
| **EM 8413 repair shape** | Withdraw the corrupted catalog-page chunks, ingest the 2026 PDF, keep the prose | Repair the tables; or just delete the document | The prose is worth having (resistance strategy, `RULES` stewardship, sprayer calibration, safe use, certification bodies). The tables are tier C and must not come back. The PDF is where the prose actually lives in full. |
| **Chunker fix shape** | Replace the lossy `match()` with a scanner that provably partitions the input | Patch the regex to also match `\d+\.\d+` | A patched regex is still a regex that *might* not cover some input. The invariant we want is `parts.join("") === input`, which is a property, not a pattern. Assert it in code and in a property test. |

## Implementation Units

Grouped into four PRs. PR boundaries matter here because PR A is a live correctness fix that should
land on its own, fast, without waiting for the source work.

---

### PR 0 — prerequisite (not a unit of this plan)

`claude/skb-knowledge-sources-plan-bd36b7` must merge first. It carries the KB-1 detector, the
inline gate, `boundary/enforcing.ts`, `crawl/path-match.ts`, `verify:kb-boundary`, and the
`search_knowledge_base` legality-verdict refusal. As of 2026-07-26 it is **13 commits, no PR opened**,
its own QA report claims a green full suite (396 files / 4,733 tests), and `git merge-tree` shows one
conflict, in `NOW.md` only — no source or test file overlaps.

Two items on that branch are flagged by its own QA report as unresolved and should be settled as part
of merging it, not silently inherited:
- `virginia-fruit` is a DB-only source (69 documents, 260 chunks, `defaultEnabled: true`, retrievable
  today) with no `KNOWLEDGE_SOURCES` entry. SKB Unit 7 planned to "add" that host as new; it is
  actually a reconciliation.
- The enforcing branch's chunk-clearing delete transaction has **never executed against real data**.
  Exercise it on a disposable Neon branch before any source enforces for the first time.

---

### Unit 1: Make chunk splitting lossless

**Goal:** `splitBySentences` and `tailForOverlap` can no longer drop input characters.
**Files:** `src/lib/knowledge/chunk.ts`, `test/knowledge-chunk.test.ts` (extend; create if absent)
**Approach:** Replace the `String.match(/…/g)` sentence scan with an explicit scanner that walks the
string and emits every character exactly once, so the concatenation of the parts equals the input.
Keep the existing sentence-boundary *semantics* (split after `.`/`!`/`?` followed by whitespace or
end-of-input) — the goal is identical boundaries with total coverage, not better sentence detection.
Both `splitBySentences` (line 115) and `tailForOverlap` (line 131) use the same regex today; give
them one shared, tested helper rather than two copies. Add a cheap internal assertion so a future
regression fails loudly instead of silently.
**Tests:**
- Property test: for a generated corpus of strings (including decimals, ellipses, abbreviations,
  URLs, no-terminal-punctuation, empty, whitespace-only, and CJK), `parts.join("") === input`.
- Regression: `"abc. 0.5 def"` yields parts that rejoin to the original and no part begins `5 def`.
- Regression from real data: the EM 8413 phrases `0.5–1 lb ai`, `0.25–0.5 lb ai (1-2 pts product)`,
  `0.5 inch of water`, `Gallery 0.5 TG` survive a forced split intact.
- Boundary-parity: on a set of ordinary prose fixtures, the new splitter produces the **same** chunk
  boundaries as the old one, so this is a pure integrity fix and not a silent re-chunking of the corpus.
- Force-split path: a >700-token block with a decimal after the last sentence boundary.
**Depends on:** none
**Execution note:** test-first. Write the failing property test before touching `chunk.ts`.
**Patterns to follow:** existing pure-logic unit tests under `test/` run at `environment: "node"`.
**Verification:** `npx vitest run test/knowledge-chunk.test.ts`, then the full suite.

### Unit 2: Bump the chunker version and force re-index of damaged documents

**Goal:** Every document whose chunks could carry dropped text gets re-chunked, and we can prove it.
**Files:** `src/lib/knowledge/sections/index.ts` (or wherever the index-hash version constants live),
`src/lib/knowledge/index-documents.ts`, `scripts/reindex-knowledge-corpus.ts`
**Approach:** The idempotency short-circuit means a fixed chunker does nothing on its own — stored
hashes still match. Introduce a chunker-version component folded into `deriveIndexHash` alongside
`SECTION_FILTER_VERSION`, so bumping it invalidates every stored `indexedContentHash` and forces
re-chunking on next ingest. Confirm `reindex:knowledge` with `ignoreValidators: true` re-fetches and
re-indexes rather than 304-ing. Scope the re-index to the ~64 candidate documents identified by the
blast-radius query rather than all 3,299, then widen if spot checks disagree.
**Tests:** unit test that `deriveIndexHash` changes when the chunker version changes and is stable
when it does not.
**Depends on:** Unit 1
**Verification:** re-run the blast-radius SQL from Unit 3 and confirm the confirmed-corruption count
goes to zero. Spot-check 10 re-indexed chunks against a live re-fetch of their source pages.

### Unit 3: Quantify the damage honestly, before and after

**Goal:** A defensible number for how much of the corpus was affected, not a heuristic guess.
**Files:** `docs/plans/2026-07-26-099-…-plan.md` (this file, results appended); no source changes
**Approach:** The line-start-unit heuristic returns 74–79 chunks across ~64 documents and 14 sources,
but spot-checking showed roughly 40–50% false positives (`243 kg Nitrat-N/ha` is a real number, not a
truncation), and it structurally cannot catch cases where the drop leaves a plausible integer
(`1.10` → `10`) or swallows prose. So do not report the heuristic as a count. Instead: for each
candidate document, re-fetch the live source, re-run the **fixed** chunker, and diff against the
stored chunk text. A byte diff is ground truth; the heuristic is only the candidate generator. Report
confirmed / refuted / unreachable, broken down by source key. Also report the recall floor honestly —
documents whose source page is gone cannot be adjudicated.
**Tests:** none (measurement).
**Depends on:** Unit 1
**Verification:** the report distinguishes confirmed corruption from heuristic noise, and states its
own recall limits.

> **PR A ends here.** Units 1-3 are a self-contained live-correctness fix with no dependency on the
> SKB merge. Land it first and separately.

---

### Unit 4: Single-document re-index and withdraw tool

**Goal:** An operator can repair or retire **one** document without nuking its whole source.
**Files:** `scripts/` (new operator script), `package.json`
**Approach:** Today the only levers are `reset:knowledge-source` (deletes an entire source) and
`reindex:knowledge --sources=<key>`. Add a URL- or documentId-scoped path: re-fetch, re-index through
the normal `indexDocument` seam so the atomic revision flip and all gates still apply, or set
`status: "withdrawn"` + `withdrawnAt` for a document that should stop being retrievable. Withdrawal
must go through the same locking discipline the tombstone pass uses. Do not add a new write path that
bypasses `indexDocument`. Keep it out of any import graph reachable from the app build, and do not
import from `test/` (Vercel build hazard).
**Tests:** unit tests for argument parsing and the withdraw/reindex decision; the DB write path is
exercised by Unit 6's live run rather than mocked.
**Depends on:** none (parallel with Units 1-3)
**Verification:** `--dry-run` prints the intended action for a known document without writing.

### Unit 5: Discover and ingest the EM 8413 PDF

**Goal:** The guide's actual prose enters the corpus from the 2026 PDF, not the catalog shell.
**Files:** `scripts/crawl-osu-extension.ts`
**Approach:** `discover()` reads links only from the two wine hubs and the sitemap, never from a
`/catalog/` page body, which is why the linked PDF was never found. Extend discovery to follow
`/sites/**.pdf` links found on already-admitted `/catalog/` pages — that path shape already passes
`isContentPath`, so this is a discovery gap, not a gating one. Keep the existing POS/NEG keyword
filter. Respect the existing 3s self-throttle.
**Tests:** unit-test the link-extraction predicate against a saved fixture of the EM 8413 catalog
page, asserting the 2026 PDF URL is discovered and that no non-wine `/sites/` PDF is.
**Depends on:** PR 0 (the gate must exist, since the PDF is largely tables and should be assessed)
**Verification:** `npm run crawl:osu-extension -- --dry-run` lists the 2026 PDF in KEEP.

### Unit 6: Repair the EM 8413 corpus document

**Goal:** No corrupted, no raw-markup, and no tier-C chunks remain retrievable for EM 8413.
**Files:** none (operator run)
**Approach:** Using Unit 4's tool: withdraw or re-index the catalog-page document so the raw
`<td headers=…>` chunks and the empty-`<iframe>` chunks stop being retrievable, and let Unit 5's PDF
carry the content. Expect the gate to assess the PDF; if it verdicts `product-table` the document is
refused wholesale, which is the correct KB-1 outcome but means the prose is lost too — if that
happens, note it and hand the prose recovery to the section-filter work rather than weakening the gate.
Correct `publishedAt` so it reflects the 2026 edition rather than 2014-12-18.
**Tests:** none (operator run); assertions live in Unit 10's verify script.
**Depends on:** Units 4, 5
**Verification:** query the corpus for `em-8413` chunks and confirm zero contain `<td`, `<iframe`, or
a truncated rate; confirm `publishedAt` is the 2026 edition date.

> **PR B ends here** (Units 4-6). Depends on PR 0 for the gate.

---

### Unit 7: `body-heading` section-filter strategy

**Goal:** A second section-filter strategy that splits on body headings instead of `<a name>` anchors.
**Files:** `src/lib/knowledge/sections/` (new splitter + dispatch), `src/lib/knowledge/config.ts`,
`test/` (new)
**Approach:** `sections/index.ts:62` is a single hardcoded `=== "anchor-heading"` comparison and
`applySectionFilter` calls `splitHtmlSections` unconditionally at line 66. Introduce a strategy
dispatch: widen the config type to a union, have `shouldApplySectionFilter` resolve *which* strategy
applies rather than a boolean, and route `applySectionFilter` accordingly. Write the new splitter to
segment on heading elements in the body, reusing `classifySection`'s normalize-then-match shape.
Preserve the existing fail-open (no sections found → ingest whole) and fail-closed (all sections
dropped → explicit `skipped: "empty"`, chunks cleared) semantics exactly. Version the strategies
independently in `deriveIndexHash` — today it folds one `SECTION_FILTER_VERSION`, which cannot express
two strategies evolving separately.
**Tests:**
- The new splitter against saved PNW fixtures (a disease page, an insect page, a pesticide-safety
  page), asserting `Cause` / `Symptoms` / `Cultural control` / `Biology and life history` are kept and
  `Chemical control` / `Management-chemical control` are dropped.
- Fail-open on a page with no headings.
- Fail-closed when every section classifies as drop.
- `anchor-heading` behavior is byte-identical to today (regression guard for `vt-enology-notes`).
- `deriveIndexHash` differs between the two strategies at the same version number.
**Depends on:** PR 0
**Execution note:** characterization-first. Pin current `anchor-heading` output on VT fixtures before
refactoring the dispatch, so the regression guard is real.
**Verification:** `npm run verify:vt-enology` still passes unchanged.

### Unit 8: Run section filtering before the KB-1 boundary gate

**Goal:** The gate assesses what we would actually index, so a filtered page is not dropped for
content the filter removes.
**Files:** `src/lib/knowledge/index-documents.ts`, `test/knowledge-boundary-gate.test.ts` (extend)
**Approach:** Today: gate (line 106) → hash (148) → idempotency (151) → filter (190). Move filtering
above the gate for sources that declare one, so the gate reads filtered HTML. The gate **must stay
above the idempotency short-circuit** — that ordering is load-bearing and the SKB code comments say so
explicitly. Sources with no `sectionFilter` must be entirely unaffected. Watch the interaction with
the all-dropped branch, which currently clears chunks and returns `skipped: "empty"`: decide and test
what happens when filtering empties a page that the gate would also have rejected, so the two
early-exit paths cannot race or double-clear.
**Tests:**
- A fixture page whose `Chemical control` section alone would verdict `product-table`: assert it is
  **admitted** with the section stripped, not refused wholesale.
- A page that is tier C *throughout*: assert it is still refused, filter or no filter.
- A source with no `sectionFilter`: assert byte-identical behavior to before.
- The gate still runs before idempotency (assert a source flipped to enforcing has its existing
  chunks cleared on the next ingest even when the content hash is unchanged).
**Depends on:** Unit 7
**Verification:** `npx vitest run test/knowledge-boundary-gate.test.ts` plus `npm run verify:kb-boundary`.

### Unit 9: Register the `pnw-handbooks` source

**Goal:** The source exists in config with correct scoping, licence and cadence.
**Files:** `src/lib/knowledge/config.ts`
**Approach:** Add a `KNOWLEDGE_SOURCES` entry plus `TRUSTED_DOMAINS` entries for
`pnwhandbooks.org` (and `www.` if it resolves). `tier: 1`. `autoCrawl: true` with the declared
sitemap. `sectionFilter: "body-heading"`. `defaultEnabled: false`. Record the robots posture verbatim
in `license`, mirroring how `osu-extension` records the same OSU signals (`use=reference`,
`ai-train=no`, `Crawl-delay: 10`, and the named-bot blocklist that does not include our UA).
`allowPrefixes` covers the four in-scope prefixes; `denyPrefixes` excludes the 7 `/vineyard-grape/`
product children. Comment *why* the `grape-vitis-spp-` prefix must be exact, naming the *Mahonia*
trap, so a future edit does not loosen it.
**Tests:** extend the existing config test to assert the false-positive paths are refused and the 71
in-scope paths are admitted, driven from a committed fixture of the sitemap path list.
**Depends on:** Unit 7 (the strategy must exist before a source references it)
**Verification:** the config module loads (any `allowPaths` validation throws at import), and the path
assertions pass.

### Unit 10: Crawl, seed, and verify

**Goal:** The source is populated and has a standing proof.
**Files:** `scripts/verify-pnw-handbooks.ts` (new), `package.json`
**Approach:** Order matters and has bitten this repo before. Capture the `verify:kb-register` baseline
**before** the source exists. Merge the config to main **first**, then `seed:knowledge-sources`, then
one operator `crawl:source pnw-handbooks` — seeding an unmerged source previously killed recrawl for
every source. Write a DB-free verify script in the shape of `verify-vt-enology.ts`: fetch a live
sample spanning a disease page, an insect page, a weed hub and a pesticide-safety page, and assert the
chemical sections are dropped, the biology survives, and no template silently regresses to
zero-sections-found. Also assert the *Mahonia* pages are refused by path.
**Tests:** the verify script is the test.
**Depends on:** Units 8, 9
**Verification:** `npm run verify:pnw-handbooks` green; crawl reports ~71 documents with no
`skippedChallenge`; `verify:kb-boundary` reports zero enforcing-source flags.

### Unit 11: Measure displacement and cross-region contamination before enabling

**Goal:** Prove the source helps before every tenant sees it. This is the gate on `defaultEnabled`.
**Files:** none (measurement), results appended to this plan
**Approach:** Two measurements, both required.
*Displacement:* diff `verify:kb-register` against the pre-PNW baseline. Report how many top-k slots
changed hands and on which questions, the way the IVES enablement was reported (4 of 120 slots, 3%).
*Region:* the corpus has no region dimension and `retrieve.ts` runs `mmrSelect(..., 0.7)`, so 30% of
selection weight is dissimilarity from what is already chosen — a diversification objective that can
actively pull a Pacific-Northwest chunk into a Bhutan or Australian answer. Enable `pnw-handbooks`
for the **Demo Winery sandbox only**, then run regionally-specific questions and check whether PNW
passages surface where they do not belong. **A reproduction of cross-region contamination blocks the
`defaultEnabled` flip** and hands the problem to SKB Unit 9, which is where the regional filter belongs.
**Tests:** none (measurement).
**Depends on:** Unit 10
**Verification:** a written verdict with numbers. Flip `defaultEnabled` only on a clean result.

> **PR C ends here** (Units 7-11).

---

### Unit 12: Record what we are deliberately not fixing

**Goal:** The known-broken things that are out of scope do not evaporate.
**Files:** `TODOS.md`, `docs/architecture/` registers as appropriate, `NOW.md`
**Approach:** File the raw-HTML table leak with its measured numbers (925 chunks / 476 documents;
`ifv-france` 753 chunks ≈55% of the source; trigger is any `<table>` containing `colspan`, which makes
Defuddle abandon markdown conversion). File the `extract/index.ts:61` charset gap (unconditional
`bytes.toString("utf8")`, no HTTP charset or `<meta charset>` sniffing — latent, not currently
triggered; the one `osu-extension` mojibake is upstream in OSU's own bytes, and the one `awri` case is
a separate PDF font-encoding failure in `extract/pdf.ts`). If the chunker bug turns out to have
touched governed or safety-relevant content, add an entry to the relevant architecture register with
a tripwire, per the standing brain-maintenance rule.
**Depends on:** Unit 3
**Verification:** entries exist and carry the numbers, not just the description.

## Test Strategy

**Unit tests:** `test/`, `environment: "node"`, pure-logic only — the chunk scanner, the section
splitter and its dispatch, the config path assertions, the EM 8413 link predicate. The chunker fix
gets a **property test** (`parts.join("") === input`), because the invariant is total coverage and a
handful of examples cannot express that.

**Characterization tests:** pin current `anchor-heading` behavior on VT fixtures *before* Unit 7
refactors the dispatch. Pin current chunk boundaries on prose fixtures *before* Unit 1, so we can
show the fix changes nothing except the dropped characters.

**Integration / live proof:** `verify:kb-boundary` (no enforcing-source flags), `verify:vt-enology`
(unchanged), `verify:pnw-handbooks` (new), `verify:knowledge-base` (20/20 retrieval), and
`verify:kb-register` (displacement diff). All run from the main checkout — the worktree has no `.env`.

**Manual verification:** ask the assistant a PNW-region powdery mildew question and confirm it returns
biology with a citation and **no** product/rate/REI text; ask a legality-shaped question and confirm
the non-certification preamble fires; confirm a Bhutan-context question does not surface a PNW passage.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The chunker fix silently re-chunks the whole corpus, changing retrieval quality | MED | HIGH | Boundary-parity tests in Unit 1; scope the re-index to confirmed-damaged documents (Unit 2), not all 3,299; re-run `verify:knowledge-base` and `verify:kb-register` after |
| The KB-1 gate refuses PNW disease pages wholesale despite the filter | MED | HIGH | Unit 8 exists specifically for this, and its first test is that exact case. If the reorder proves unsafe, fall back to a section-aware gate rather than grandfathering the source |
| Blast-radius numbers are wrong (heuristic has ~40-50% false positives and unknown recall) | HIGH | MED | Unit 3 adjudicates by re-fetch + byte diff rather than trusting the heuristic, and reports its own recall limits |
| SKB branch does not merge, blocking PRs B and C | MED | HIGH | PR A is deliberately independent. PR 0's two open items (`virginia-fruit`, the unexercised delete path) are named so they are settled rather than inherited |
| Enforcing-mode chunk deletion runs for the first time ever against real data | MED | HIGH | Exercise it on a disposable Neon branch first (PR 0). `pnw-handbooks` will be the first enforcing source in existence |
| PNW passages contaminate non-PNW answers via MMR diversity | MED | MED | `defaultEnabled: false`; Unit 11 measures on the Demo sandbox and **blocks** the flip on a reproduction |
| Crawling 71 pages at `Crawl-delay: 10` is slow and may look like pressure | LOW | LOW | ~12 minutes serial. Honor the declared delay; monthly cadence |
| `publishedAt` stays wrong because PNW metadata dates are Drupal node-create dates | MED | MED | Check whether `resolvePublishedDate`'s body-scan arm catches the on-page revision line; if not, this is a known gap to file, not a blocker |
| Seeding before the config is on main breaks the monthly sweep for **all** sources | LOW | HIGH | Explicit ordering in Unit 10, and it has happened before (`virginia-fruit`) |

## Success Criteria

- [ ] `splitBySentences` and `tailForOverlap` provably cannot drop input; property test passes
- [ ] Chunk boundaries on ordinary prose are unchanged by the fix (parity test)
- [ ] Every confirmed-corrupted document is re-indexed and re-verified by byte diff against live source
- [ ] A defensible corruption count is reported, separating confirmed from heuristic noise
- [ ] An operator can re-index or withdraw a single document without touching its source
- [ ] No `em-8413` chunk contains `<td`, `<iframe`, or a truncated rate; `publishedAt` reflects 2026
- [ ] `body-heading` strategy ships; `anchor-heading` behavior byte-identical (`verify:vt-enology` green)
- [ ] A page whose `Chemical control` alone is tier C is admitted with that section stripped
- [ ] A page that is tier C throughout is still refused
- [ ] The KB-1 gate still runs before the idempotency short-circuit
- [ ] `pnw-handbooks` populated with ~71 documents; the 4 *Mahonia* pages and 7 weed product children absent
- [ ] `verify:pnw-handbooks` and `verify:kb-boundary` green; `verify:knowledge-base` 20/20
- [ ] Displacement measured against a pre-PNW baseline and reported with numbers
- [ ] Cross-region contamination tested on Demo Winery; `defaultEnabled` flipped only on a clean result
- [ ] Out-of-scope defects filed with their measured numbers
- [ ] Full suite green, `tsc --noEmit` clean, `npm run lint` no new warnings

## Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | Root cause reproduced from first principles; minimal repro isolates `chunk.ts:116` |
| Scope Boundaries | HIGH | Slices measured, not estimated. The out-of-scope items have hard numbers |
| Implementation Units 1-6 | HIGH | Bug localized; the pipeline seams are read and cited |
| Implementation Unit 7 | MEDIUM | The dispatch refactor is clear, but PNW heading markup has only been characterized on 4 sample pages. Fixtures across all four slices before building would raise this |
| Implementation Unit 8 | MEDIUM | The reorder is the right call but it moves a safety-critical gate. The all-dropped/refused interaction is the part most likely to surprise |
| Implementation Units 9-11 | HIGH | Follows the IVES staged-enablement precedent exactly |
| Test Strategy | HIGH | Property test for the integrity invariant; characterization tests to bound the refactors |
| Risk Assessment | MEDIUM | The largest unknown is whether the corpus-wide re-index shifts retrieval quality. Unit 3's adjudication and the parity tests are the controls, but it is measured after the fact, not before |
