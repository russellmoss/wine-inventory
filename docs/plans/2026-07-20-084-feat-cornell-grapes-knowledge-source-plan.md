---
title: Cornell Grapes IPM knowledge source + publication-date extraction
type: feat
status: completed
date: 2026-07-20
branch: claude/cornell-grapes-knowledge-source-808b00
depth: standard
units: 8
---

## Execution log (2026-07-20)

All 8 units implemented. vitest **2966 passed / 0 failed**, tsc clean, eslint 0 errors,
`verify:raw-sql` / `verify:invariants` / `verify:tripwires` / `verify:parity` / `verify:ai-native`
all green.

- [x] **U1** publication date + canonical title on the shared extract seam (`b2fd0c9c`)
- [x] **U2** PDF metadata dates + title quality gate (`5196b544`)
- [x] **U3** soft-404 guard at all three fetch sites (`b0124909`)
- [x] **U4** `cornell-grapes` source, multisite-scoped (`c376ecc6`)
- [x] **U5** `viticulture-extension-refs` curated spec + registry invariants (`8e86350c`)
- [x] **U6** passage age surfaced to the assistant (`e20d6c70`)
- [x] **U7** date-coverage gate + eval rejection-check fix (`59eca6fd`)
- [x] **U8** config-integrity tests — landed inside U5's commit rather than separately

### Deviations from the plan, and why

1. **Dropped filename-year inference and the whole "inferred date" concept** (U2, and it simplified
   U6). The plan called for inferring a year from PDF filenames, marked inferred. Measurement killed
   it: 12/12 sampled Cornell PDFs carry real `CreationDate` metadata, so inference bought ~nothing.
   And there is no column for the inferred/authoritative distinction while the plan also forbids a
   migration, so an inferred date would have been indistinguishable from a real one at read time —
   exactly the "launder a guess into a fact" failure the plan set out to prevent.

2. **`allowPrefixes` is `["/grapes/", "/newfruit/files/"]`, not `["/grapes/"]`** (U4). 35 of the 43
   live Cornell PDFs are stored in the sibling Cornell Fruit Resources blog's file store, not under
   `/grapes/`. They are unambiguously grape documents. Allowing only the FILE STORE picks them up via
   link-following (which is path-filtered per source) without crawling the tree-fruit blog — and keeps
   them on the monthly loop instead of in a hand-maintained list.

3. **9 third-party documents, not ~21** (U5). Of 55 distinct third-party links, only 9 are live and
   robots-clear. `extension.unh.edu` was excluded on robots grounds the plan did not anticipate: its
   linked URL 302s into `/sites/default/files/`, which UNH's robots.txt disallows, and robots is only
   evaluated against the *requested* URL — so the crawler would have fetched it without noticing.

4. **Fixed a latent false positive in the eval gate** (U7, not in the plan). The rejection cases
   matched off-topic terms as raw substrings. 4 of 8 sampled Cornell PDFs "contain ipa" via
   `principally`, `anticipated`, and `riparia` (*Vitis riparia*, a grape species), so a viticulture
   document would have failed the BEER rejection case. Now word-boundary matched.

5. **The "curated source is reachable" invariant caught a pre-existing condition** (U5): 4 of the 12
   curated sources are served by bespoke scripts rather than `CURATED_SPECS`, and nothing recorded
   which mechanism owns which. Now explicit, with a test that fails on a stale exemption.

### Not yet done — required before merge

- `npm run verify:knowledge-base` and `npm run verify:kb-subscriptions` have **NOT** been run. They
  need `.env`, network, a live DB and API keys; this worktree has none. Run from the main checkout.
- The **first Cornell crawl has not been run.** Do the capped smoke crawl and read the fetched URL
  list before the full crawl — the multisite scoping is the thing most likely to be wrong.
- Existing pre-084 documents will **not** backfill dates on a normal re-crawl (`indexDocument`
  early-returns on unchanged content). Backfilling the other 18 sources needs
  `reset:knowledge-source` and is an explicit operator decision, not part of this branch.

## Overview

Add Cornell's grape program (`blogs.cornell.edu/grapes/`, including its IPM section) as
knowledge source #19, on the existing monthly re-crawl loop and the existing per-tenant
on/off toggle. Along the way, fix a real gap the Cornell content exposes: the crawler has
**never** populated `KnowledgeDocument.publishedAt`, so every crawled passage reaches the
assistant dated `"unknown"`. Cornell IPM is year-stamped, annually-superseded spray and
pest guidance, so an undated 2019 recommendation sitting next to a 2025 one is a real
vineyard-decision hazard, not a cosmetic gap.

## Problem Frame

**Who has the problem:** a winemaker or vineyard manager asking the assistant a pest,
disease, or spray question. Today the corpus skews Australian (AWRI, Wine Australia) and
Pacific-Northwest (WSU, OSU). There is no cool-climate eastern-US IPM authority in it at
all, which is exactly the region Bhutan Wine Co. and most East Coast tenants operate in.

**What happens if we do nothing:** the assistant answers eastern-US disease-pressure
questions (downy mildew, sour rot, grape berry moth, spotted lanternfly, trunk disease)
from sources written for a different climate and a different pest complex, with no signal
that it is doing so.

**Product pressure test — the framing that survived:** the naive framing is "add a
source." The sharper one is "the corpus cannot tell the user how old its advice is."
Adding Cornell without fixing dates would make the corpus *worse* on this axis, because
Cornell contributes a large body of superseded annual guidance where AWRI contributes
mostly stable reference material. The date work is therefore not a nice-to-have bolted
onto the source addition; it is the precondition for the source addition being safe.

**A correction to an earlier assumption in this conversation.** It was suggested that the
curated-crawl path could ingest third-party PDFs *without* widening `TRUSTED_DOMAINS`.
That is wrong. `crawlUrls` gates every URL on `TRUSTED_DOMAIN_SET` at
`src/lib/knowledge/crawl/crawler.ts:449-452`, and `fetchDocument` re-gates on the initial
URL and every redirect hop at `src/lib/knowledge/crawl/fetcher.ts:77-80`. The curated path
bypasses only sitemap discovery and allow/deny path prefixes, never the host allowlist.
Ingesting off-Cornell PDFs **requires** adding those hosts to `TRUSTED_DOMAINS`, with the
link-following consequences that implies. Unit 5 addresses this head-on.

## Requirements

- MUST: Cornell grape content is retrievable by the assistant and cited with a working link.
- MUST: the source refreshes on the existing monthly cron, not a one-time static import.
- MUST: the source appears in the existing per-tenant Settings on/off toggle.
- MUST: crawled documents carry a real publication date where the source exposes one, and
  the assistant can state how old a passage is.
- MUST: where a date is *inferred* (e.g. a year parsed from a PDF filename) it is marked as
  inferred, never presented as authoritative.
- MUST: robots.txt continues to be honored. No bypass flag is introduced.
- MUST: soft-404 pages (a `.pdf` URL that returns HTML) are not indexed as documents.
- SHOULD: `canonicalTitle` gets populated on the crawl path (currently every crawled doc
  cites as the bare publisher name, `src/lib/knowledge/citation.ts:72`).
- SHOULD: date coverage is asserted by the verify gate, not just logged.
- NICE: known-dead links in the Cornell corpus are recorded so the monthly loop does not
  re-fetch them every run.

## Scope Boundaries

**In scope:**
- One auto-crawled source (`cornell-grapes`) scoped to `blogs.cornell.edu/grapes/`.
- One curated source (`cornell-grapes-refs`) for the off-site PDFs the Cornell pages link to.
- Publication-date extraction for HTML and PDF, applied to the shared extract seam so all
  19 sources benefit.
- Age surfacing in the assistant's knowledge-search tool output.
- Verify-gate and config-integrity test additions.

**Out of scope:**
- Any robots.txt bypass. Not needed: `blogs.cornell.edu/robots.txt` disallows only
  `/wp-admin/` for generic agents, and every third-party host checked permits the specific
  PDFs we want. Introducing a bypass we do not need is pure downside.
- Ingesting the wider `blogs.cornell.edu` multisite (thousands of unrelated Cornell blogs)
  or the wider `cals.cornell.edu` site.
- Recovering dead links from the Wayback Machine. Recorded as follow-up; see Risks.
- Age-based *filtering* or hard cutoffs in retrieval. We surface age; we do not silently
  drop old documents. A 2015 trunk-disease paper may still be the best answer.
- Any schema migration. `publishedAt` and `canonicalTitle` already exist and are nullable
  (`prisma/schema.prisma:3288-3294`).

## Research Summary

### Live-site reconnaissance (measured, not assumed)

| Fact | Value |
|---|---|
| `blogs.cornell.edu` robots.txt for `*` | `Disallow: /wp-admin/` only. No crawl-delay. |
| WordPress REST API | Live (HTTP 200). Exposes `date` + `modified` per document. |
| Sitemap | `blogs.cornell.edu/grapes/wp-sitemap.xml` (HTTP 200). |
| HTML pages in sitemap | ~20 pages + 7 posts |
| Unique PDF links found across the grape-site sections | 98 |
| **PDFs that actually resolve to `application/pdf`** | **54** |
| PDFs that soft-404 (HTTP 200 + `text/html`) | **36** |
| PDFs that hard-fail (404 / connection failure) | 8 |

**The single most important finding: `grapesandwine.cals.cornell.edu` is gone.** All 34 of
its PDF links return **HTTP 200 with `text/html`**, redirecting to the
`cals.cornell.edu/viticulture-enology` landing page. A naive crawl would ingest 34 copies
of the same navigation page as distinct Cornell research documents. `classifyContentType`
(`src/lib/knowledge/crawl/fetcher.ts:26`) keys off the response content-type header, so
these would be classified `html` and extracted as articles. Cross-URL alias dedup
(`src/lib/knowledge/index-documents.ts:55`) would collapse them to one document with 34
aliases, and `lowConfidence` might catch the thin result, but neither is a guarantee and
neither is the right layer. Unit 3 adds an explicit guard.

Live PDFs by host: `blogs.cornell.edu` 43, `nyshs.org` 4, `www.sare.org` 2, and one each
from `www.hort.cornell.edu`, `www.ars.usda.gov`, `publications.dyson.cornell.edu`,
`harvestny.cce.cornell.edu`, `extension.unh.edu`.

Third-party robots.txt was checked individually for all 13 off-Cornell hosts. All permit
the PDFs we want. `extension.unh.edu` disallows `/sites/default/files/*.pdf$`, but its PDF
lives under `/resources/files/`, so it is clear. **No host requires a bypass.**

### Codebase patterns

- **Source registry:** `src/lib/knowledge/config.ts`. `KnowledgeSourceConfig` interface at
  `:6-24`; `KNOWLEDGE_SOURCES` at `:26-390` (18 sources); `TRUSTED_DOMAINS` at `:394-424`.
  The file header at `:1-4` already names Cornell as a queued source.
- **Auto-crawl precedent:** `wsu` at `config.ts:66-125`. Same shape as Cornell: a WordPress
  university extension site with a non-standard `wp-sitemap.xml` path and a long
  `denyPrefixes` list for WP cruft, event calendars, and academic-program pages.
- **Curated precedent:** `ets` at `config.ts:371-389` — `autoCrawl: false`,
  `crawlCadence: "manual"`, plus a spec in `src/lib/knowledge/curated-specs.ts` driven by
  `scripts/crawl-curated.ts`.
- **Host allowlist is hard-enforced on every path:** `crawler.ts:449-452` (in `crawlUrls`,
  not overridable — the opts type at `:429` has no host option) and `fetcher.ts:77-80` (per
  redirect hop). See the correction in Problem Frame.
- **Robots on the curated path:** honored by default, `crawler.ts:453-463`. Fail-open on a
  robots *fetch error*. `ignoreRobots` exists per-spec but is used only by `wbi` and `lvwo`;
  Cornell will not set it.
- **Monthly cron already exists:** `.github/workflows/knowledge-recrawl.yml`, schedule
  `0 9 1 * *`, driver `scripts/recrawl-knowledge.ts`. A source joins it by leaving
  `autoCrawl` at its default `true`. Note `crawlCadence` is **dead metadata** — grepped
  across `src/`, `scripts/`, `test/`, it is only ever written, never read to schedule
  anything. Setting `"monthly"` is documentation-accurate but functionally inert.
- **Toggle already exists, end to end:** `src/app/(app)/settings/KnowledgeSourcesCard.tsx`,
  server action `setKnowledgeSourceEnabled` at `src/lib/knowledge/actions.ts:15-43`
  (admin-only, audited), resolution `override ?? defaultEnabled` at
  `src/lib/knowledge/subscriptions.ts:28-31`. Retrieval fail-closes when a tenant has zero
  enabled sources (`src/lib/knowledge/retrieve.ts:53-54`). **Cornell appears in this UI with
  zero UI work.**
- **The date gap:** `ExtractedHtml` (`extract/html.ts:6-10`) returns only
  `{title, markdown, wordCount}`. The Defuddle call at `:31-37` reads four fields off the
  result and discards the rest — including `published`, which Defuddle populates from
  JSON-LD `datePublished` and `<meta property="article:published_time">`. `extract/pdf.ts`
  imports only `extractText` and `getDocumentProxy` from `unpdf` at `:24`; PDF
  `CreationDate`/`ModDate`/`Title` are reachable via `getMeta` but never requested.
- **Where the date must land:** `persistDocument` (`crawler.ts:382-408`) is the only
  `KnowledgeDocument` write on the crawl path, and it runs *before* extraction and never
  sees parsed content — so it structurally cannot set `publishedAt`. The clean seam is the
  transaction in `indexDocument` at `index-documents.ts:117`, which already updates the doc
  row and sits downstream of `extractDocument` at `:80`. One edit there covers every
  ingestion path.
- **Consumers are already wired:** `retrieve.ts:111` does
  `publishedAt: r.publishedAt ?? r.sitemapLastmod`; the assistant tool renders
  `date: p.publishedAt ? ... : "unknown"` at
  `src/lib/assistant/tools/search-knowledge-base.ts:92`; the tool prompt at `:37-41` already
  instructs conflict-by-recency and forbids inventing dates.
- **The verify gate already computes what we want to assert:**
  `scripts/verify-knowledge-base.ts:186` computes a `dated` passage count and only
  `console.log`s it at `:188`. That is the natural place for a coverage assertion.

### Prior learnings

`rstack-learnings-search` returned 0 entries for this project. Relevant facts from the
project memory index instead:

- Plan 079 shipped this knowledge base (PR #285). **CI Postgres must be
  `pgvector/pgvector:pg16`** — a plain `postgres` image fails the KB suite.
- Worktrees lack `.env`. DB-touching verify scripts (`verify:knowledge-base`,
  `verify:kb-subscriptions`) must run from the main checkout.
- Worktrees share one `.git` index across parallel sessions — commit with explicit paths.

### External research

Two library details to confirm against installed typings before implementing, rather than
trusting this plan:

1. Defuddle's response field name for the publication date (expected `published`, a string)
   — verify in the installed `defuddle` `.d.ts`, since the extraction contract depends on it.
2. `unpdf`'s `getMeta(pdf)` return shape (expected `{ info, metadata }` with `info.CreationDate`
   / `info.ModDate` in PDF `D:YYYYMMDDHHmmSS` format).

## Key Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Date extraction scope | Fix the shared seam (`ExtractedDoc` → `indexDocument`) for all sources | Cornell-only bespoke script, following the `crawl-ets.ts` precedent | The bug is global: every one of 18 sources cites `"unknown"` today. A Cornell-only fix leaves the other 18 broken and adds a second code path. One edit at `index-documents.ts:117` covers every ingestion path. |
| Third-party PDFs | Ingest, via a **separate** curated source with its own `TRUSTED_DOMAINS` entries | (a) skip them; (b) fold them into the main Cornell source | User asked for them explicitly. A separate source keeps the publisher attribution honest — an MSU or SARE document must not be cited as "Cornell" — and keeps `autoCrawl: false` so the monthly loop does not crawl 13 extra domains. |
| Widening `TRUSTED_DOMAINS` | Accept it, narrowly, and document the consequence | Pretend the curated path avoids it | It does not (`crawler.ts:449`). Being explicit about the cost is the only honest option. |
| Dead `grapesandwine.cals.cornell.edu` links | Exclude by URL, and add a soft-404 content-type guard | Let dedup absorb them | 34 soft-404s is not an edge case, it is a third of the PDF corpus. Relying on dedup to hide a data-quality bug is how garbage gets indexed. |
| Inferred dates (PDF filename years) | Allow, but marked `inferred` and never rendered as an exact date | (a) no inference; (b) infer silently | Silent inference is the one outcome that is worse than `"unknown"` — it launders a guess into a fact the assistant will state confidently. |
| Age presentation | Surface age; do not filter | Hard cutoff on old documents | A 2015 trunk-disease paper can still be the best answer. Filtering makes the corpus lie by omission; surfacing lets the model and the user judge. |
| `crawlCadence` value | Set `"monthly"` for documentation accuracy, knowing it is inert | Omit it | The field is required by the interface. Note in a comment that scheduling comes from `autoCrawl`, so the next reader is not misled. |

## Implementation Units

### Unit 1: Publication date + canonical title on the shared extract seam

**Goal:** Crawled documents carry a real publication date and title instead of `"unknown"`
and a bare publisher name — for all sources, not just Cornell.
**Files:** `src/lib/knowledge/extract/index.ts`, `src/lib/knowledge/extract/html.ts`,
`src/lib/knowledge/index-documents.ts`, `test/knowledge-extract.test.ts`
**Approach:** Widen `ExtractedHtml` (`html.ts:6-10`) and `ExtractedDoc`
(`extract/index.ts:23-29`) with an optional publication date and a flag distinguishing an
authoritative date from an inferred one. Read Defuddle's `published` field at the existing
call site (`html.ts:31-37`) and normalize it to a `Date`, rejecting unparseable and
implausible values (future dates, pre-1970) rather than passing them through. Route it
through `extractDocument`'s html branch. Then widen the `data:` block of the existing
document update inside `indexDocument`'s transaction (`index-documents.ts:117`) to set
`publishedAt` and `canonicalTitle`. Only ever *fill* a null `publishedAt` or overwrite with
a higher-confidence value — never downgrade an authoritative date to an inferred one on a
later re-crawl. Any new string field must pass through `sanitizeText` (`extract/index.ts:14`)
for the Postgres NUL guard.
**Tests:** In `test/knowledge-extract.test.ts`, following the file's existing inline-HTML
pattern (warm the loader in `beforeAll`, pass the 30s timeout as the third `it()` arg):
JSON-LD `datePublished` is extracted; `<meta property="article:published_time">` is
extracted; a page with no date yields no date rather than a fabricated one; a malformed
date string is rejected; a future-dated page is rejected.
**Depends on:** none
**Execution note:** test-first. The date-validity rules are exactly the kind of logic that
looks obviously right and is quietly wrong.
**Patterns to follow:** `test/knowledge-extract.test.ts:16-19` (`beforeAll` warmup),
`:67` (`DEFUDDLE_TIMEOUT_MS`), `:73` (destructured result assertions).
**Verification:** `npm run test -- knowledge-extract`. Then a targeted re-index of one
known-dated existing document confirms a non-null `publishedAt` reaches the DB.

### Unit 2: PDF publication dates from metadata, with marked filename inference

**Goal:** PDFs carry a date, distinguishing metadata dates from filename-inferred years.
**Files:** `src/lib/knowledge/extract/pdf.ts`, `src/lib/knowledge/extract/index.ts`,
`test/knowledge-extract.test.ts`
**Approach:** Add `unpdf`'s `getMeta` alongside the existing `extractText` /
`getDocumentProxy` import (`pdf.ts:24`), reusing the document proxy already in hand. Parse
the PDF `D:YYYYMMDDHHmmSS` date format into a `Date`, preferring `CreationDate` over
`ModDate` (a re-save should not read as a new publication). Treat metadata dates as
authoritative. When metadata yields nothing, fall back to inferring a year from the
document title or filename — the Cornell corpus is full of `Research Focus 2018-2 May.pdf`
and `Grape Disease Control 2023` — and mark the result inferred. Prefer PDF metadata `Title`
over the current first-non-empty-line heuristic (`pdf.ts:14-20`) when metadata has one.
Guard the whole metadata read in a try/catch: a malformed date in a PDF must degrade to no
date, never fail the extraction.
**Tests:** A PDF with valid `CreationDate` yields an authoritative date; a PDF with no
metadata but a year in the filename yields an inferred date flagged as such; a PDF with a
malformed `D:` string yields no date and does not throw; `CreationDate` wins over `ModDate`.
Generate minimal PDF bytes inline — there is no test fixtures directory for extraction, and
the codebase prefers inline fixtures.
**Depends on:** Unit 1
**Execution note:** test-first.
**Verification:** `npm run test -- knowledge-extract`.

### Unit 3: Refuse soft-404s — a `.pdf` URL that returns HTML

**Goal:** The 36 dead PDF links do not get indexed as Cornell research documents.
**Files:** `src/lib/knowledge/crawl/crawler.ts`, `test/knowledge-crawl.test.ts`
**Approach:** In the crawl path, when a URL's path ends in `.pdf` but the fetched
content-type classifies as `html`, treat it as a dead link: skip it, count it in the crawl
summary under a distinct counter (alongside the existing `skippedRobots`), and do not
persist a document. This is deliberately narrow — a content-type mismatch on a `.pdf` URL
is unambiguous evidence of a redirect-to-landing-page, whereas the general case of "does
this HTML look like a nav page" is a judgment call that `lowConfidence` already handles.
Surface the counter in the recrawl summary so the monthly GitHub issue reports link rot
instead of hiding it.
**Tests:** A `.pdf` URL returning `text/html` is skipped and increments the counter; a
`.pdf` URL returning `application/pdf` is persisted normally; an `.html` URL returning HTML
is unaffected.
**Depends on:** none
**Verification:** `npm run test -- knowledge-crawl`.

### Unit 4: The `cornell-grapes` source — config + trusted domain

**Goal:** Cornell's grape site is registered, seeded, and on the monthly loop.
**Files:** `src/lib/knowledge/config.ts`
**Approach:** Add a `KNOWLEDGE_SOURCES` entry modeled on `wsu` (`config.ts:66-125`):
`tier: 1` (university extension), `homeDomain: "blogs.cornell.edu"`, seed root at the grape
site root, explicit `sitemapUrls` pointing at the WordPress-core `wp-sitemap.xml` path under
`/grapes/`, `crawlCadence: "monthly"`, `defaultEnabled: true`, and **no `autoCrawl` key** so
it defaults to `true` and joins the monthly loop.

The `allowPrefixes` decision is the load-bearing one and must be tightly anchored to the
grape site — `blogs.cornell.edu` is Cornell's entire university-wide WordPress multisite, so
a bare `"/"` allow (which is what `wsu` uses on its single-purpose host) would open the
crawler to thousands of unrelated Cornell blogs. `denyPrefixes` should cover the standard
WordPress cruft from the `wsu` list (wp-admin, wp-content, wp-json, feed, category, tag,
author, page, comments) plus, critically, any Cornell brewing/hops/coffee-adjacent
sub-blog — see the Risks table, this can fail the verify gate's rejection cases. Add a
`TRUSTED_DOMAINS` entry for `blogs.cornell.edu`; it is a subdomain host, so no `www` variant
is needed. Include a comment explaining the multisite hazard and that scheduling comes from
`autoCrawl`, not `crawlCadence`.
**Tests:** `test/knowledge-config.test.ts` already asserts every source's `homeDomain` is in
`TRUSTED_DOMAIN_SET` (`:35-39`) — this must stay green. Add a test that the Cornell source's
allow prefixes cannot match a non-grape path on the multisite.
**Depends on:** none
**Verification:** `npm run test -- knowledge-config`, then seed and run a capped smoke crawl
(`crawl:source` with a low `--max`) from the main checkout, inspecting which URLs were
fetched before running the full crawl.

### Unit 5: The `cornell-grapes-refs` curated source for off-site PDFs

**Goal:** The third-party PDFs Cornell links to are ingested, correctly attributed, and kept
out of the monthly link-following crawl.
**Files:** `src/lib/knowledge/config.ts`, `src/lib/knowledge/curated-specs.ts`
**Approach:** Add a second `KNOWLEDGE_SOURCES` entry modeled on `ets`
(`config.ts:371-389`): `autoCrawl: false`, `crawlCadence: "manual"`, `tier: 1`, and a
publisher name that does **not** claim Cornell authorship (these are MSU, SARE, USDA-ARS,
UNH, NYSHS, Dyson documents surfaced *via* Cornell). Add a `CURATED_SPECS` entry with the
explicit `directUrls` list — the measured-live third-party PDFs only, excluding the 8
hard-dead and 36 soft-404 URLs. Do **not** set `ignoreRobots`; robots is honored by default
on this path and every host was verified to permit these files.

Add `TRUSTED_DOMAINS` entries for each host in that list. This is the real cost of the
decision and it must be recorded in a comment: these hosts become link-followable by
`crawlWithFollowing` for *other* sources too, not just this one. Keep the list to hosts that
actually contribute a live document — do not pre-emptively trust hosts whose only linked
file is dead.
**Tests:** Add a config-integrity test asserting every `directUrls` host appears in
`TRUSTED_DOMAIN_SET` — without it, `crawler.ts:450` silently drops the URL as an error and
the corpus is quietly short. Assert the curated source is `autoCrawl: false` so it cannot
drift onto the monthly loop.
**Depends on:** Unit 4
**Verification:** `npm run crawl:curated` with the spec's dry-run flag first, confirming
every URL is allowlisted and none are dropped, before a live run.

### Unit 6: Surface document age to the assistant

**Goal:** The assistant can say how old a piece of guidance is, and flags inferred dates.
**Files:** `src/lib/knowledge/retrieve.ts`, `src/lib/assistant/tools/search-knowledge-base.ts`
**Approach:** Carry the date-confidence flag through the retrieval result alongside the
existing `publishedAt ?? sitemapLastmod` fallback (`retrieve.ts:111`). In the tool output
(`search-knowledge-base.ts:91-92`), keep the existing `"unknown"` sentinel for genuinely
undated passages, and add an explicit age signal — the document's age in years and, when the
date is inferred, a marker saying so. Extend the tool's existing conflict-by-recency prompt
block (`:37-41`) with a rule for age: when the best passage on a pest or disease question is
several seasons old, say so plainly rather than presenting it as current. Do not invent a
threshold in the prompt that the code does not enforce.
**Tests:** Existing assistant tool tests must stay green. Add coverage that an inferred date
renders with its marker and an authoritative one does not, and that an undated passage still
renders `"unknown"`.
**Depends on:** Units 1, 2
**Verification:** `npm run test`. Manual: ask the assistant a Cornell-answerable spray-timing
question and confirm the citation carries a year and an age.

### Unit 7: Gate date coverage and protect the verify rejection cases

**Goal:** The eval gate catches a regression in date coverage, and Cornell does not break the
existing 14 retrieval cases or 2 rejection cases.
**Files:** `scripts/verify-knowledge-base.ts`
**Approach:** `:186` already computes a `dated` passage count and only logs it at `:188`.
Turn that into a real assertion with a coverage floor. Check the two rejection cases
(`:74-77` — IPA/beer and espresso must surface nothing on-topic) against the Cornell corpus;
Cornell CALS runs hops and brewing extension programs, and the `wsu` config already carries a
deny prefix specifically because of this hazard (`config.ts:101`). Review the 14 retrieval
cases (`:41-62`) for displacement: Cornell authoritatively answers several of them (notably
the leafroll/mealybug case at `:53`), so a Cornell document outranking the expected OSU one
would fail a `canonicalUrl` substring match *even though retrieval improved*. Where that is
the case, widen `expectPaths` rather than suppressing Cornell.
**Tests:** This script is the test. It is a live-network, live-DB gate.
**Depends on:** Units 4, 5, 6
**Verification:** `npm run verify:knowledge-base` from the main checkout (worktrees lack
`.env`), and `npm run verify:kb-subscriptions` to confirm the toggle still isolates tenants.

### Unit 8: Config-integrity tests that stop future drift

**Goal:** The next person adding a source cannot make the mistakes this plan had to discover
by hand.
**Files:** `test/knowledge-config.test.ts`
**Approach:** Three generic assertions the suite lacks today: source `key` values are unique;
any source with `autoCrawl: false` has a corresponding `CURATED_SPECS` entry (otherwise it is
silently uncrawlable by any path); every `TRUSTED_DOMAINS` entry's `sourceKey`, where set,
resolves to a real source. These are cheap and they encode exactly the failure modes that
cost time here.
**Tests:** The unit is tests.
**Depends on:** Units 4, 5
**Verification:** `npm run test -- knowledge-config`.

## Test Strategy

**Unit tests:** vitest, colocated in `test/`. Extraction tests follow
`test/knowledge-extract.test.ts`'s inline-fixture pattern — no fixtures directory exists and
the file explicitly argues against shrinking fixtures. Defuddle-backed tests need the
`beforeAll` loader warmup and a per-test timeout.

**Integration:** `npm run verify:knowledge-base` (live network + live DB, 14 retrieval cases
+ 2 rejection cases + a date-coverage assertion after Unit 7) and
`npm run verify:kb-subscriptions` (toggle behavior + cross-tenant isolation). Both must run
from the **main checkout** — worktrees have no `.env`. CI Postgres must be the
`pgvector/pgvector:pg16` image.

**Manual verification:**
1. Seed sources, then run a **capped** Cornell crawl and read the fetched URL list before
   committing to a full crawl. The multisite scoping is the thing most likely to be wrong,
   and it is cheapest to catch here.
2. Confirm the crawl summary reports a nonzero soft-404 skip count (we know there are 36).
3. In Settings as a Demo Winery admin, confirm both Cornell sources appear in the knowledge
   sources card with sane doc counts, and that toggling one off removes its passages from
   assistant answers.
4. Ask the assistant an eastern-US disease question and confirm the citation resolves to a
   live Cornell URL and carries a date and age.

All fixture and QA work in the **Demo Winery** sandbox (`org_demo_winery`), never Bhutan.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `allowPrefixes` too loose → crawler walks the whole Cornell multisite | MED | HIGH | Anchor prefixes to the grape site; capped smoke crawl with URL inspection before the full run (Unit 4 verification). |
| Cornell hops/brewing content trips the verify gate's beer rejection case | MED | MED | Deny prefixes for brewing-adjacent paths; `wsu` set this precedent at `config.ts:101`. Explicitly checked in Unit 7. |
| Cornell displaces expected AWRI/OSU docs in the 14 retrieval cases | MED | MED | Widen `expectPaths` where Cornell is a legitimately better answer rather than suppressing the source (Unit 7). |
| `TRUSTED_DOMAINS` widening lets other sources' link-following reach 13 new hosts | HIGH | MED | Accepted cost, documented in a comment. Limited to hosts contributing a live document. Followed links still hit allow/deny prefix filtering per source. |
| Defuddle's date field name or `unpdf`'s `getMeta` shape differs from expected | MED | LOW | Both confirmed against installed typings as the first step of Units 1 and 2. Extraction degrades to no date, not a crash. |
| Dates never backfill for existing documents | HIGH | MED | `indexDocument`'s early returns (`:52`, `:77`, `:81`, `:84`) skip unchanged docs, so a normal re-crawl will not backfill the 18 existing sources. `reset:knowledge-source` forces a re-index; treat backfill as an explicit operator step, not an assumption. |
| Inferred filename years are wrong (e.g. a 2018 file about the 2017 season) | MED | LOW | Marked inferred, never rendered as an exact date. This is why the flag exists. |
| More links rot between now and the monthly run | HIGH | LOW | Unit 3's counter surfaces it in the monthly GitHub issue; the existing tombstone pass marks hard-404s `withdrawn` and serves a graceful stub for old citations. |

## Success Criteria

- [ ] Both Cornell sources appear in the Settings knowledge-sources card and toggle per tenant.
- [ ] `cornell-grapes` re-crawls on the existing monthly cron with no new workflow.
- [ ] The 36 soft-404 PDF URLs are skipped, counted, and reported — not indexed.
- [ ] A majority of newly indexed Cornell documents carry a non-null `publishedAt`.
- [ ] Inferred dates are visibly marked as inferred in assistant tool output.
- [ ] The assistant answers an eastern-US disease question citing a live Cornell URL with a date and age.
- [ ] `npm run verify:knowledge-base` passes, including the new date-coverage assertion.
- [ ] `npm run verify:kb-subscriptions` passes.
- [ ] No robots.txt bypass exists anywhere in the diff.
- [ ] All tests pass; no regressions in the existing 18 sources' retrieval cases.
