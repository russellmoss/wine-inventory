---
title: MSU Extension Grapes/Viticulture knowledge source + WAF-challenge guard + link-provenance crawl gate
type: feat
status: units-1-7-complete-unit-8-blocked
date: 2026-07-20
branch: claude/msu-viticulture-source-e7e94c
depth: standard
units: 8
---

## ⚠️ BUILD OUTCOME — read before running anything (2026-07-20)

**Units 1-7 are complete, tested and committed. Unit 8 is deliberately NOT finished.** Two findings
from the build change the deploy order; neither was visible at planning time.

### 1. SEED AFTER DEPLOY, NEVER BEFORE. Seeding early breaks the monthly sweep for ALL sources.

`npm run seed:knowledge-sources` writes `msu-grapes` into the GLOBAL `knowledge_source` table, and
this repo's `.env` points at PRODUCTION. If that row exists while the deployed code does not yet
know the key:

1. `scripts/recrawl-knowledge.ts:39` filters with `findSourceConfig(s.key)?.autoCrawl !== false`.
   For an unknown key that is `undefined !== false` → **true**, so `msu-grapes` is INCLUDED.
2. `crawlWithFollowing` then does `const cfg = findSourceConfig(key); if (!cfg) throw`.
3. That throw happens before any crawling, and `main().catch` exits 1 — so the **entire monthly
   refresh dies for all 21 sources**, not just MSU.

So the order is: **merge + deploy → seed → crawl.** Not the order this plan originally listed.
(The `defaultEnabled: true` entry would also surface a working toggle in prod Settings for a source
with zero documents, which is merely sloppy — the sweep crash is the actual hazard.)

### 2. MSU's bot wall escalates with volume, and it shut this network out completely.

Reconnaissance started with intermittent challenges. After roughly 15 requests the residential IP
went to **5/5 refused**, and it is still refused: `npm run verify:msu` reports
`BLOCKED — imperva (959B)` on the `/grapes/` hub. Each challenge body is a slightly different size,
confirming the unique-`incident_id` behaviour that defeats the content-hash dedup.

This raises the probability of the plan's headline risk materially. A GitHub Actions runner makes
far more requests than 15, from a datacenter IP range. **Treat "MSU works from a laptop" as no
evidence at all about CI.**

The machinery to find out is in place and was proven end to end by the block itself: the detector
fired, the crawl loops would skip, and `findDarkSources` fails the job loudly instead of letting
the source rot silently.

### What remains (all of Unit 8's live half)

- [ ] Merge + deploy, THEN `npm run seed:knowledge-sources` from the MAIN checkout.
- [ ] `npm run verify:msu` from a network MSU is not currently refusing (proves the rule against
      MSU's real page structure — the pure half already passes).
- [ ] `npm run crawl:source msu-grapes -- --follow --max 5` (smoke), then the full crawl.
- [ ] Confirm documents landed WITH `publishedAt`; `npm run backfill:published-dates --source
      msu-grapes --dry` first if many are undated.
- [ ] `npm run verify:knowledge-base` — a new source shifts rankings; WIDEN `expectPaths`, never
      repoint.
- [ ] Audit the ingested `/news/` URL list for non-grape leakage; tighten `linkedFrom` or add
      `denyPrefixes` if junk appears.

## Overview

Add MSU Extension's Grapes/Viticulture program (`canr.msu.edu/grapes/`) as a monthly-CRON
knowledge source, toggleable per tenant in Settings, with document publication dates so the
existing stale-guidance warning works on it.

Normally that is a config edit and a seed run. MSU is not normal. Three verified blockers stand
in the way, and two of them are **pre-existing latent bugs in the crawler** that MSU merely
exposes. Fixing them is most of this plan; the source entry itself is Unit 6.

## Problem Frame

**The user job:** a Michigan/cold-climate winegrower asks the assistant about winter injury,
cold hardiness, or spring frost protection. Today the corpus answers from AWRI (Australia),
Wine Australia, WSU and OSU. None of them are cold-climate specialists. MSU's viticulture
program is, and their cold-hardiness work (Sabbatini et al.) is the best public material on it.

**If we do nothing:** the assistant keeps answering cold-climate questions from warm-climate
sources, which is subtly wrong in a way the user cannot see.

**Product pressure test — one finding worth flagging.** The request reads as "add a source,"
but two of the three blockers are corpus-integrity bugs that already affect all 20 sources:

1. Any source that ever gets fronted by a WAF silently ingests challenge pages as real
   documents, and re-embeds them every month forever (unique `incident_id` per challenge
   defeats the content-hash dedup).
2. The tombstone pass reads *any* fetch failure as "the page was removed."

So the honest framing is: this is a crawler-hardening change with a new source riding on top.
That is a better deal than it sounds, not a worse one, but it should be understood that way
when reviewing the diff size.

## Requirements

- MUST: MSU appears in Settings > Assistant knowledge sources, toggleable per tenant.
- MUST: MSU rides the existing monthly CRON with no workflow edit (`autoCrawl: true`).
- MUST: MSU documents land **with** `publishedAt` populated, not undated.
- MUST: WAF challenge pages are never indexed, never embedded, and never counted as content.
- MUST: A WAF challenge can never cause a document to be tombstoned as `withdrawn`.
- MUST: `/news/` articles are admitted only via a link from an admitted `/grapes/` page; the
  broader MSU Extension corpus (dairy, field crops, 4-H, forestry) never enters.
- MUST: The new crawl capability is opt-in and provably inert for the other 20 sources.
- MUST: `npm run verify:knowledge-base` stays green.
- SHOULD: A source going dark behind a WAF fails the monthly job loudly rather than silently.
- SHOULD: `npm run crawl:source` can exercise MSU manually despite the missing sitemap.
- NICE: A `verify:msu` script proving the feature DB-free, mirroring `verify:vt-enology`.

## Scope Boundaries

**In scope:**
- Challenge-page detection in the fetch path, wired into all three crawl loops + the tombstone pass.
- A `linkedOnlyPrefixes` config capability with link provenance in `crawlWithFollowing`'s queue.
- A conservative metadata-date normalizer for non-ISO `datePublished` strings.
- The MSU source entry, trusted domains, config tests, seed, crawl, and verification.

**Out of scope:**
- **Loosening the label anchor in `parsePublishedDate`.** The MSU byline
  (`... Horticulture - April 11, 2024`) has no label word. Matching a bare `Month D, YYYY`
  after a dash would admit event dates and prose dates across all 20 sources. The JSON-LD
  normalizer solves MSU without touching that posture. Deliberately not doing it.
- **Solving the WAF, or evading it.** We detect and report. No UA rotation, no proxying, no
  challenge-solving. If MSU blocks GitHub's IP ranges outright, the contingency is documented
  in Risks, not engineered around here.
- **A second `sectionFilter` source.** MSU pages do not mix technical and non-technical
  content within one URL the way VT Enology Notes did.
- Retrieval/ranking changes, chunker changes, embedding-model changes.

## Research Summary

### Codebase Patterns

**Adding a source is normally config-only.** `KNOWLEDGE_SOURCES` in
`src/lib/knowledge/config.ts:36-496`; UC IPM at `:449-495` is the template. `TRUSTED_DOMAINS`
at `:500-533`. The Settings toggle, monthly CRON, chunk/embed and date capture all key off
those two entries. `scripts/recrawl-knowledge.ts:38` selects sources dynamically via
`findSourceConfig(s.key)?.autoCrawl !== false`, so no workflow edit is ever needed.

**The fetch path has zero body validation.** `src/lib/knowledge/crawl/fetcher.ts` inspects
`bytes` only via `classifyContentType(rawContentType, head)` (`:26-34`), a 512-byte sniff where
the `Content-Type` header wins over magic bytes. A WAF challenge served as `text/html` with
HTTP 200 classifies as `"html"` and flows straight through `persistDocument` → `extractHtml` →
chunk → embed. Insertion point for a detector is exactly `fetcher.ts:112-113`, between
`readCapped` and the success `return`, where `bytes`, `rawContentType` and `current` are all
in scope.

**`classifyContentType` is the precedent for a testable pure fetch-path helper** — exported
from `fetcher.ts`, tested in `test/knowledge-crawl.test.ts` with no network. `fetchDocument`
itself is untested and awkward to test (`readCapped` needs a real `ReadableStream` body;
`assertPublicHost` does real DNS). So the detector must be a pure exported function.

**Provenance is already ambient at the enqueue site.** `crawler.ts:385-386` calls
`gateLinks(extractLinks(...), res.finalUrl)` then `enqueue(link)` — `res.finalUrl` and the loop
variable `url` are both in scope, so provenance needs no plumbing through `link-gate.ts`. What
is missing is *depth*, because the queue is a plain `string[]` (`crawler.ts:291`). Note
`crawlSource` already uses an object queue (`crawler.ts:110`:
`{ url: string; lastmod?: string }[]`) — the shape precedent exists in the same file.

**`crawl.summaries` is computed and thrown away.** `crawlWithFollowing` returns a full
per-source `CrawlSummary` record, but `scripts/recrawl-knowledge.ts` reads only `crawl.hitCap`
(`:76`) and `crawl.candidateDomains` (`:121`). Per-source error visibility is already lost
today; this plan starts using it.

**The tombstone pass is the dangerous interaction.** `recrawl-knowledge.ts:90-109`:
`try { await fetchDocument(...) } catch { gone = true; }` → `status: "withdrawn"`. A throw here
means "removed." There is already a precedent for distrusting an incomplete crawl — `:87`
prints `tombstone pass SKIPPED — crawl was capped/incomplete (not a trustworthy removal
signal)`. A WAF challenge is the same class of untrustworthy signal and should extend that
guard.

**The blast-radius guard pattern.** `test/knowledge-config.test.ts:77-84` asserts
`vt-enology-notes` is the ONLY source declaring `sectionFilter`, with a comment naming the
concrete cost (a full re-embed of a ~1,449-doc corpus) and why nothing else in CI catches it.
Exact-array-equality, order-sensitive, so adding a second source forces a deliberate test edit.
A new optional capability warrants the same treatment.

**The whole-registry invariant.** `test/knowledge-config.test.ts:35-39` asserts every source's
`homeDomain` is in `TRUSTED_DOMAIN_SET`. Miss it and `fetchDocument` throws
`host X is not allowlisted` (`fetcher.ts:78`) on every URL of the new source.

**`verify-vt-enology.ts` is the DB-free verify template** (`package.json:37` — note the
deliberate absence of `--env-file`/`--conditions`, explained at the script's `:12-13`). Shape:
config preconditions → declarative sample table → `MUST_BE_PRESENT`/`MUST_BE_ABSENT` oracles →
live fetch → accumulated `failures: string[]` → `process.exit(1)`. Caveat: it uses bare `fetch`,
not `fetchDocument`, so it bypasses the allowlist/SSRF/robots stack.

### Prior Learnings

`rstack-learnings` is empty for this project (0 entries). Relevant items from durable memory:

- **`main-repo-has-env-verify-runs`** — `.claude/worktrees/*` has no `.env`. Every DB-touching
  step (seed, crawl, `verify:knowledge-base`) must run from the MAIN checkout. `npm run`
  up-resolves, so a worktree invocation silently runs against main's scripts.
- **`plan079-knowledge-base-rag-shipped`** — CI Postgres must be `pgvector/pgvector:pg16`.
- **`build-in-main-checkout-not-worktrees`** — build in the main repo dir, branch + PR to main.
- **`shared-git-index-multi-agent-collision`** — always `git commit --only <paths>`.

### External Research (live reconnaissance, verified by execution)

- **robots.txt**: `User-agent: *` disallows only `/search` and `/application/`. AhrefsBot fully
  disallowed (irrelevant to us). Permissive.
- **No sitemap.** `/sitemap.xml` and `/sitemap_index.xml` both return an HTML 404 page.
  Discovery is seed roots + link-following only.
- **Incapsula/Imperva challenge**, HTTP **200**, body ~950-965 bytes containing
  `Request unsuccessful. Incapsula incident ID` and `_Incapsula_Resource`. Intermittent and
  path-dependent from a residential IP: `/grapes/viticulture/` was challenged on every attempt;
  `/grapes/` (70,920 B) and `/news/<slug>` (58,398 B) returned real content.
- **JSON-LD dates are non-standard**: `"datePublished": "2024-4-11EDT12:00AM"`,
  `"dateModified": "2024-4-12EDT8:42AM"`. Verified: `new Date("2024-4-11EDT12:00AM")` →
  **Invalid Date**. `new Date("2024-4-11")` → valid.
- **Byline carries no label word**: `Paolo Sabbatini, Michigan State University Department of
  Horticulture - April 11, 2024`. Verified: the `LABEL`-anchored shape does not match → `null`.
- **Content location**: substantive articles are flat `/news/<slug>` (e.g.
  `/news/cold-hardiness-of-grapevines-...`, `/news/mechanization-and-precision-viticulture-...`),
  reachable from `/grapes/` listing pages. `/news/` itself is all of MSU Extension.
- **Site paths**: `/grapes/viticulture/`, `/grapes/integrated_pest_management/`,
  `/grapes/weather_climate/`, `/grapes/grape-facts`, `/grapes/education`, `/grapes/research`,
  `/grapes/experts`, `/grapes/wine_tourism/`, `/grapes/uploads/files/` (PDFs).

## Key Decisions

| Decision | Choice | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Challenge detection: signal shape | **Return an additive `challenge` field on `FetchResult`; never throw** | Throw from `fetchDocument` | Throwing is actively dangerous: `recrawl-knowledge.ts:93` catches a throw as `gone = true` and marks the doc `withdrawn`. A WAF blip would mass-tombstone a source's whole corpus slice. All three crawl loops also use bare `catch {}` that discards the message, so a throw could never reach the summary. |
| Detector location | **New pure module `src/lib/knowledge/crawl/challenge.ts`** | Co-locate in `fetcher.ts` beside `classifyContentType` | A separate module gives a clean test target and room for a growing vendor-signature table (Incapsula, Cloudflare, Akamai, DataDome, PerimeterX) without bloating the fetch path. `classifyContentType` is the precedent for *purity*, which is the part that matters. |
| Detector trigger | **Positive signature match only. No size threshold.** | Size floor (<2 KB), or size AND signature | A size floor produces false positives on legitimately short pages and false negatives on large interstitials. The signature strings (`_Incapsula_Resource`, `Incapsula incident ID`, `cf-browser-verification`, `Checking your browser before accessing`) never appear in viticulture content. Size is recorded as diagnostic detail, never as a trigger. |
| Detector scan window | **First 64 KB of the body** | Whole body; first 512 B | Challenge interstitials put markers in `<head>`. 64 KB bounds the cost on a 15 MB PDF while leaving generous headroom. 512 B (the `classifyContentType` window) is too tight for Cloudflare-style pages. |
| Date fix scope | **Normalize the metadata path only; leave `LABEL` untouched** | Add a byline/dash date shape to `SHAPES` | The module's stated posture is "a WRONG date is worse than no date." A bare `Month D, YYYY` after a dash would match event dates and prose dates across all 20 sources. The JSON-LD normalizer fixes MSU with zero blast radius. |
| Date normalizer ordering | **Try `new Date(meta)` first (unchanged); fall back to leading-`YYYY-M-D` extraction only if invalid** | Always run the normalizer first | Guarantees byte-identical behavior for every source that already works. The new path is reachable only where the old one returned Invalid Date. |
| Date precision | **Take Y-M-D only; discard the time and timezone** | Parse the `EDT12:00AM` tail | The tail is ambiguous and unparseable by spec. A date-only reading is off by at most one day, immaterial to a 5-year staleness bucket, and the existing `buildDate` range-check still applies. |
| `/news/` scoping | **New opt-in `linkedOnlyPrefixes` config capability** | Broad `/news/` allow; `/grapes/`-only; curated URL list | User-decided. Broad `/news/` ingests all of MSU Extension. `/grapes/`-only misses the technical articles that carry the value. A curated list is `autoCrawl: false`, so it would not ride the monthly CRON the user asked for. |
| `linkedOnlyPrefixes` semantics | **Admitted only with provenance matching `linkedFrom`; terminal (links not followed onward); never seedable** | Depth-limit only | MSU `/news/` articles cross-link heavily into non-grape Extension content. Terminal-ness is what actually contains the blast radius; a depth limit alone would still admit one hop of dairy articles. |
| Tombstone safety | **Exclude sources that recorded challenges from the stale set** | Skip the whole tombstone pass if any challenge | Extends the existing `capped` precedent (`recrawl-knowledge.ts:87`) at the right granularity. Skipping globally would let one flaky source suppress legitimate tombstoning across all 19 others. |
| CI failure rule | **Fail when a source records challenges AND indexed zero documents ("went dark")** | Fail on any challenge > 0 | Intermittent challenges are expected and transient; failing on any would make the monthly job cry wolf and train everyone to ignore it. "Went dark" is the condition that actually needs a human. |
| Manual crawl path for MSU | **Add `--follow` to `scripts/crawl-source.ts`, routing to `crawlWithFollowing([key])`** | Leave it; new bespoke script | `crawlSource` does no link-following and MSU has no sitemap, so `crawl:source msu-grapes` would fetch only the seed roots and look broken. A `--follow` flag is small, general, and gives the smoke-test path. |
| `verify:msu` | **Yes, DB-free, mirroring `verify:vt-enology`** | Rely on unit tests | Both MSU failure modes are invisible to a successful crawl: a challenge page ingests as a valid HTML document, and a provenance rule that stops admitting `/news/` shows up in `CrawlSummary` as nothing at all. Unit tests never touch the network and the crawl loops have no coverage. |

## Implementation Units

### Unit 1: Pure WAF-challenge detector

**Goal:** A pure, network-free function that recognizes a bot-wall interstitial from response bytes.
**Files:** `src/lib/knowledge/crawl/challenge.ts` (new), `test/knowledge-challenge.test.ts` (new)
**Approach:** Export `detectChallengePage(bytes: Buffer, rawContentType: string): ChallengeInfo | null`
returning `{ vendor, marker, byteSize }`. Scan the first 64 KB decoded as utf8 for a table of
vendor signature strings. Match on signature alone — no size heuristic (see Key Decisions). Only
consider HTML-ish or unknown content types; a `%PDF-` body can never be a challenge. Keep the
signature table a top-level `const` with a comment per vendor recording where the string comes
from. Follow the `classifyContentType` shape (`fetcher.ts:26-34`): pure, exported, no I/O.
**Tests:** Real Incapsula body (from reconnaissance) → detected, vendor `imperva`. A Cloudflare
interstitial fixture → detected. A real MSU article body → `null`. A short but legitimate HTML
page (~300 bytes) → `null` (guards against a size heuristic creeping back in). A PDF buffer →
`null`. Empty buffer → `null`.
**Depends on:** none
**Execution note:** test-first
**Patterns to follow:** `src/lib/knowledge/crawl/fetcher.ts:26-34`; `test/knowledge-crawl.test.ts`
**Verification:** `npx vitest run test/knowledge-challenge.test.ts`

### Unit 2: Wire the detector into the fetch path

**Goal:** `fetchDocument` reports a challenge without throwing.
**Files:** `src/lib/knowledge/crawl/fetcher.ts`, `test/knowledge-crawl.test.ts`
**Approach:** Add `challenge: ChallengeInfo | null` to `FetchResult` (`:10-19`). Call the
detector at `:112`, between `readCapped` and the success `return` at `:113`, and include the
result in the returned object. The 304 early-return (`:97-102`) sets `challenge: null` — a 304
has no body. Do **not** change any throw site. Do **not** change `classifyContentType`'s result
based on the challenge; callers decide what to do.
**Tests:** Extend the existing crawl test file with a fetch-path assertion only if it can stay
network-free; otherwise rely on Unit 1 plus the caller tests in Unit 3. Do not build a
`fetchDocument` integration test — `readCapped` needs a real `ReadableStream` and
`assertPublicHost` does live DNS.
**Depends on:** Unit 1
**Patterns to follow:** `src/lib/knowledge/crawl/fetcher.ts:111-118`
**Verification:** `npx tsc --noEmit` clean; existing crawl tests still pass.

### Unit 3: Honor challenges in all three crawl loops

**Goal:** A challenge page is skipped and counted, never persisted, extracted, or embedded.
**Files:** `src/lib/knowledge/crawl/crawler.ts`
**Approach:** Add `skippedChallenge: number` to `CrawlSummary` (`:45-57`) and initialize it in
**all four** construction sites (`:88-91`, `:264`, `:459-462`, and the `crawlUrls` literal) —
TypeScript will enforce this. Add a guard immediately beside each existing
`contentType === "other"` check — `:184` (`crawlSource`), `:366` (`crawlWithFollowing`), `:517`
(`crawlUrls`) — that increments `skippedChallenge`, logs the vendor and URL in the style of the
existing `! redirect out of scope` line (`:194`), and `continue`s **before** `persistDocument`.
Placement before `persistDocument` is the load-bearing detail: it is what keeps the unique-per-
challenge content hash out of `KnowledgeBlob` and off the embedding path.
**Tests:** A rule-pinning test in `test/knowledge-crawl.test.ts` mirroring the redirect-re-gate
precedent at `:82-112` — assert the ordering contract (challenge check precedes persist) so a
refactor that drops it deletes an assertion rather than silently regressing.
**Depends on:** Unit 2
**Patterns to follow:** `crawler.ts:184`, `crawler.ts:186-196`, `test/knowledge-crawl.test.ts:82-112`
**Verification:** `npx tsc --noEmit`; `npx vitest run test/knowledge-crawl.test.ts`

### Unit 4: Tombstone safety + summary surfacing + CI failure rule

**Goal:** A WAF challenge can never withdraw a document, and a source going dark is loud.
**Files:** `scripts/recrawl-knowledge.ts`, `.github/workflows/knowledge-recrawl.yml`
**Approach:** Three changes.
(a) **Tombstone safety** — start reading `crawl.summaries` (currently discarded). Build the set
of `sourceId`s whose `skippedChallenge > 0` and exclude them from the `stale` query's
`sourceId: { in: autoSourceIds }` filter (`:83`). Log the exclusion in the style of the existing
`tombstone pass SKIPPED` line (`:87`). Additionally, inside the tombstone loop (`:90-109`), a
fetch that returns a `challenge` must be treated as **not gone** — skip both the withdraw
(`:98-101`) and the `lastVerifiedAt` bump (`:103-106`), since neither liveness nor removal was
established.
(b) **Summary** — add a per-source `skippedChallenge` map and a `totalSkippedChallenge` scalar to
the `summary` literal (`:111-123`). Per-source, not just a total: a global count cannot say
*which* source went dark. No workflow edit is needed for these to reach the GitHub issue — the
workflow `cat`s `summary.json` wholesale into a fenced block (`:78-80`).
(c) **Failure rule** — after printing the `::KB_RECRAWL_SUMMARY::` line at `:124`, exit non-zero
if any source recorded `skippedChallenge > 0` **and** indexed zero documents. Exiting from the
script (rather than adding a `jq` gate to the workflow) is cleaner: the marker is already
printed, the `:66` fallback never triggers, `set -o pipefail` (`:62`) propagates the failure, and
`if: always()` (`:70`) still files the issue with full detail. Update the human-readable
"Review:" sentence at `:82` to mention the new field.
**Tests:** Script-level; covered by manual verification and Unit 8's live run. If the
went-dark predicate is extracted as a small pure function, unit-test it directly.
**Depends on:** Unit 3
**Patterns to follow:** `scripts/recrawl-knowledge.ts:76-87` (the `capped` precedent)
**Verification:** `npx tsc --noEmit`; `actionlint` if available; confirm the failure predicate
with a forced-value dry run.

### Unit 5: Conservative metadata-date normalizer

**Goal:** MSU's non-ISO `datePublished` yields a real `publishedAt`, with zero change for every
other source.
**Files:** `src/lib/knowledge/extract/published-date.ts`, `test/knowledge-published-date.test.ts`
**Approach:** In `resolvePublishedDate` (`:134-147`), keep `new Date(meta)` as the first attempt,
byte-for-byte unchanged. Only when it yields `NaN`, fall back to extracting a leading
`YYYY-M-D` (1-or-2-digit month and day) anchored at the **start** of the trimmed metadata
string, discarding any trailing time/timezone. Feed the parts through the existing `buildDate`
so the range checks, roll-over rejection, and future-date rejection all still apply. Return
`null` if the leading pattern does not match — never guess. Add a comment recording the exact
observed MSU shape and why the tail is discarded.
Also confirm during implementation which field Defuddle surfaces as `published` for MSU
(`datePublished` vs `dateModified`); the module's semantics are "when was this last revised,"
so `dateModified` is preferable where both exist. If Defuddle picks the wrong one, note it —
do not fix it here without evidence.
**Tests:** Add to the existing `it.each` table. `"2024-4-11EDT12:00AM"` → 2024-04-11.
`"2024-4-12EDT8:42AM"` → 2024-04-12. Regression cases proving unchanged behavior for a valid
ISO string, a valid RFC-2822 string, empty string, and garbage. Boundary cases: a future date
still rejected; a pre-1980 date still rejected; `"2024-13-45EDT"` rejected. Reuse the file's
fixed `NOW = new Date(Date.UTC(2026, 6, 20))` so cases never rot.
**Depends on:** none
**Execution note:** test-first
**Patterns to follow:** `published-date.ts:44-55` (`buildDate`); `test/knowledge-published-date.test.ts:24-35`
**Verification:** `npx vitest run test/knowledge-published-date.test.ts`

### Unit 6: `linkedOnlyPrefixes` capability + link provenance in the crawl queue

**Goal:** Admit `/news/` articles only when linked from an admitted `/grapes/` page, and never
follow onward from them.
**Files:** `src/lib/knowledge/config.ts` (interface only), `src/lib/knowledge/crawl/crawler.ts`,
`test/knowledge-crawl.test.ts`
**Approach:** Add an optional field to `KnowledgeSourceConfig` (`:10-34`):
`linkedOnlyPrefixes?: { prefix: string; linkedFrom: string[] }[]`, documented as "paths admitted
ONLY when discovered as a link from a page matching `linkedFrom`; never seeded, never followed
onward."

In `crawlWithFollowing`, convert the queue to an object queue carrying provenance and a terminal
flag — the shape precedent already exists in `crawlSource` (`:110`). Five edits:
- `:291` — queue becomes `{ url; fromUrl: string | null; terminal: boolean }[]`.
- `:292-299` — `enqueue` takes an optional `from` argument (defaulting to `null`, which keeps the
  seed-time calls at `:304` and `:314` compiling unchanged). Gate order stays deny → allow, then
  the new rule: a URL matching a `linkedOnlyPrefixes` entry is admitted **only** if `from` is
  non-null and `from`'s pathname starts with one of its `linkedFrom` values. Because seed-time
  `enqueue` passes `from === null`, a `/news/` URL can never be seeded. Mark such items `terminal`.
- `:319` — **this line breaks and is easy to miss**: `queue.filter((u) => resolveTarget(u)...)`
  passes queue items to a function expecting a string. Becomes `resolveTarget(q.url)`. TS catches it.
- `:327` — destructure the item; keep `url` as a local so the rest of the loop is untouched.
- `:386` — pass provenance: `enqueue(link, { url })`. Skip this whole loop when the current item
  is `terminal`, which is what stops `/news/` articles from dragging in the rest of MSU Extension.

Leave `pathAllowed`/`pathAllowedFor` duplication alone; collapsing it is unrelated cleanup.
`crawlSource` is untouched — it never follows links.
**Tests:** In `test/knowledge-crawl.test.ts`, following the local-helper precedent at `:82-112`,
pin the admission rule: a `/news/` URL with a `/grapes/` parent is admitted; the same URL with a
`/news/` parent is refused; the same URL with no parent (seed) is refused; a `/grapes/` URL is
admitted with or without a parent; `denyPrefixes` still wins over a satisfied `linkedFrom`. Plus a
blast-radius guard in `test/knowledge-config.test.ts` mirroring `:77-84`: exact-array-equality
that `msu-grapes` is the ONLY source declaring `linkedOnlyPrefixes`, with a comment naming the
cost of a second one.
**Depends on:** none (independent of Units 1-5)
**Patterns to follow:** `crawler.ts:110`, `crawler.ts:289-299`, `test/knowledge-config.test.ts:77-84`
**Verification:** `npx tsc --noEmit`; `npx vitest run test/knowledge-crawl.test.ts test/knowledge-config.test.ts`

### Unit 7: MSU source entry, trusted domains, and manual-crawl flag

**Goal:** MSU is declared, allowlisted, and manually crawlable.
**Files:** `src/lib/knowledge/config.ts`, `scripts/crawl-source.ts`, `test/knowledge-config.test.ts`
**Approach:** Append an MSU entry to `KNOWLEDGE_SOURCES` following the UC IPM shape (`:449-495`),
with the codebase's house convention that every entry carries a *why* comment — record the
robots.txt check, the missing sitemap, the Incapsula posture, and why `/news/` is
`linkedOnly`. Proposed shape:
- `key: "msu-grapes"`, `publisher: "MSU Extension (Michigan State University)"`,
  `homeDomain: "canr.msu.edu"`, `tier: 1`
- `license`: public land-grant extension resource, reference use with citation + link back —
  same posture and phrasing style as the WSU/OSU/UC IPM entries.
- `seedRoots: ["https://www.canr.msu.edu/grapes/"]` — note `/grapes/`, not `/grapes/viticulture/`.
  The viticulture page was challenged on every reconnaissance attempt and `/grapes/` is the
  parent that carries the news listing anyway.
- `allowPrefixes: ["/grapes/"]`
- `linkedOnlyPrefixes: [{ prefix: "/news/", linkedFrom: ["/grapes/"] }]`
- `denyPrefixes: ["/search", "/application/", "/grapes/wine_tourism/", "/grapes/experts"]` —
  the first two mirror robots.txt; the last two are non-technical (tourism directory, staff
  bios). **Do not** add anything that would shadow `/grapes/`: `denyPrefixes` are checked first
  and win unconditionally with no longest-match (`crawler.ts:77-78`). Keep `/grapes/education`
  for now; it may carry technical material. Revisit after the first crawl.
- `autoCrawl: true`, `crawlCadence: "monthly"`, `defaultEnabled: true`

Add **both** `canr.msu.edu` and `www.canr.msu.edu` to `TRUSTED_DOMAINS` (`:500-533`) — the site
serves at `www` and `crawlWithFollowing:266-268` registers `homeDomain`, `www.${homeDomain}`,
and every matching `TRUSTED_DOMAINS` entry.

Add a `--follow` flag to `scripts/crawl-source.ts` that routes to `crawlWithFollowing([key])`
instead of `crawlSource`, reusing the existing `onDocument` closure and output shape.
**Tests:** In `test/knowledge-config.test.ts`, an MSU `describe` mirroring the VT block
(`:50-138`): the source resolves; stays on the monthly sweep (`autoCrawl` not false,
`crawlCadence === "monthly"`); `defaultEnabled` is true; a local `allowed()` helper asserting
`/grapes/...` admitted, `/news/...` not admitted by prefix rules alone, `/grapes/wine_tourism/`
refused, `/search` refused. The whole-registry `homeDomain` invariant at `:35-39` must pass.
**Depends on:** Unit 6
**Patterns to follow:** `config.ts:449-495`; `test/knowledge-config.test.ts:50-138`
**Verification:** `npx vitest run test/knowledge-config.test.ts`; `npx tsc --noEmit`

### Unit 8: Seed, crawl, verify — and the live proof

**Goal:** MSU is in the corpus, dated, toggleable, and the goldens are green.
**Files:** `scripts/verify-msu.ts` (new), `package.json`, plus doc updates
**Approach:** **Run every DB-touching step from the MAIN checkout, not this worktree** (no `.env`
here; `npm run` up-resolves and will silently use main's scripts).

Order:
1. `npm run seed:knowledge-sources` (idempotent upsert by key).
2. Bounded smoke: `npm run crawl:source msu-grapes -- --follow --max 5`. Confirm real documents,
   not challenge pages, and inspect `skippedChallenge`.
3. Full crawl once the smoke is clean.
4. Confirm documents landed **with** `publishedAt` — this is the user's explicit requirement.
   If a meaningful share are undated, run `npm run backfill:published-dates -- --source
   msu-grapes --dry` first to see what would change before writing.
5. `npm run verify:knowledge-base`. A new source shifts retrieval rankings; if a golden breaks,
   the established fix is to **widen** `expectPaths`, never repoint them.

Write `scripts/verify-msu.ts` on the `verify-vt-enology.ts` template (`package.json:37` — DB-free,
no `--env-file`, no `--conditions`): config preconditions (source resolves, `autoCrawl` not false,
`linkedOnlyPrefixes` declared with the `/news/`-from-`/grapes/` rule), a small declarative sample
of MSU URLs, `MUST_BE_PRESENT`/`MUST_BE_ABSENT` oracles mapping onto "these `/news/` URLs must be
admissible from a `/grapes/` parent, these must not," accumulated `failures: string[]`, and
`process.exit(1)` on any failure. **Note the template's caveat:** it uses bare `fetch`, so it
bypasses `fetchDocument` and will not exercise the challenge detector — have it call
`detectChallengePage` on the fetched bytes directly so a challenged sample is reported as
`SKIPPED (challenged)` rather than silently passing or failing as a content mismatch.

Register `verify:msu` in `package.json`. Update `docs/AUTOMATION.md` (LOOP 5) with the new
summary fields, and append to `docs/architecture/security-register.md` the crawl-integrity
decision (challenge pages are detected and skipped, never indexed; a challenge never tombstones).
**Tests:** The full suite plus the new verify script.
**Depends on:** Units 1-7
**Verification:** `npm run verify:msu`; `npm run verify:knowledge-base`; full `npx vitest run`;
`npx tsc --noEmit`; `npm run lint`; Settings > Assistant knowledge sources shows MSU with a
working toggle.

## Test Strategy

**Unit tests (vitest, `test/*.test.ts`, node env):**
- `test/knowledge-challenge.test.ts` (new) — detector purity and false-positive resistance.
- `test/knowledge-published-date.test.ts` — MSU shapes plus regression cases for existing sources.
- `test/knowledge-crawl.test.ts` — `linkedOnlyPrefixes` admission rules and the challenge-before-
  persist ordering contract, using the existing local-helper rule-pinning precedent (`:82-112`).
- `test/knowledge-config.test.ts` — MSU describe block, the whole-registry `homeDomain` invariant,
  and the `linkedOnlyPrefixes` blast-radius guard.

**No network in unit tests.** `fetchDocument` stays untested by design (`readCapped` needs a real
`ReadableStream`; `assertPublicHost` does live DNS). That is precisely why the detector is a pure
function — the risky logic is testable even though its caller is not.

**Integration / live:** `scripts/verify-msu.ts` (DB-free, live fetch) and
`npm run verify:knowledge-base` (17 golden retrieval cases, DB-backed, main checkout only).

**Manual verification:** log into the app, open Settings > Assistant knowledge sources, confirm
MSU is listed and the toggle persists. Then ask the assistant a cold-hardiness question and
confirm the answer cites MSU **with a date**.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Incapsula blocks GitHub Actions' datacenter IPs wholesale**, so the monthly CRON never ingests MSU even though it works locally | MED | HIGH | This is the single biggest risk and cannot be fully tested before merge. Units 1-4 ensure the failure is loud (per-source `skippedChallenge`, went-dark job failure, GitHub issue) rather than silent corpus poisoning. **Contingency if it materializes:** flip MSU to `autoCrawl: false` and run a curated crawl from a residential IP, accepting manual refresh. Decide only with evidence from a real CI run. |
| Challenge detector false-positives on legitimate content | LOW | MED | Signature-only matching, no size heuristic; signatures are vendor-specific strings that cannot appear in viticulture prose. Explicit test for a short-but-legitimate page. |
| Challenge detector false-negatives (new WAF vendor or changed markup) | MED | MED | Bounded by design: a missed challenge is exactly today's behavior, so this is never a regression. `verify:msu` samples live pages and would surface a drift. |
| `linkedOnlyPrefixes` leaks non-grape `/news/` content because a `/grapes/` page links to unrelated Extension articles | MED | MED | Terminal-ness caps the blast radius at one hop. After the first full crawl, audit the ingested `/news/` URL list; tighten `linkedFrom` or add `denyPrefixes` if junk appears. Explicitly re-check at Unit 8 step 3. |
| Queue-shape change breaks `crawlWithFollowing` for the other 19 sources | LOW | HIGH | The change is mechanical and TypeScript-enforced (`:319` will fail to compile). `linkedOnlyPrefixes` is opt-in and absent on every other source, so the new gate is a no-op for them. Blast-radius guard test pins that. |
| A new source shifts golden retrieval rankings and reds `verify:knowledge-base` | MED | LOW | Known and precedented (happened when UC IPM landed). Established fix: widen `expectPaths`, never repoint. |
| MSU documents still land undated because Defuddle surfaces neither JSON-LD field | LOW | MED | Verified the JSON-LD is present in the raw HTML; Unit 5 confirms which field Defuddle exposes. Fallback is `backfill:published-dates`. If Defuddle exposes nothing, escalate rather than loosening the label anchor. |
| Tombstone changes accidentally suppress legitimate withdrawals | LOW | MED | Exclusion is per-source and only for sources that recorded challenges, mirroring the existing `capped` precedent. A clean run tombstones exactly as before. |

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | User goal explicit; blockers verified by execution, not inference. |
| Scope Boundaries | HIGH | Scope decision made by the user; the two deliberate exclusions (label anchor, WAF evasion) are reasoned. |
| Implementation Units | HIGH | Every insertion point named with file:line from direct reads. The one subtle break (`crawler.ts:319`) is called out. |
| Test Strategy | MED-HIGH | Strong for pure logic. `fetchDocument` and both crawl loops remain untested — a pre-existing gap this plan works around rather than closes. |
| Risk Assessment | MED | The GitHub-Actions-IP risk is genuinely unresolvable before a real CI run. Everything else is well understood. |

## Success Criteria

- [ ] MSU appears in Settings > Assistant knowledge sources; the per-tenant toggle persists.
- [ ] MSU rides the monthly CRON with no `.github/workflows/knowledge-recrawl.yml` schedule edit.
- [ ] MSU documents in the corpus have `publishedAt` populated (not `unknown`).
- [ ] The assistant answers a cold-hardiness question citing MSU **with a date**.
- [ ] Ingested `/news/` URLs are grape-related only; no dairy/4-H/field-crop documents present.
- [ ] A challenge page is never persisted: `skippedChallenge` counts it, `documents` does not.
- [ ] A challenge never marks a document `withdrawn`.
- [ ] `skippedChallenge` appears per-source in `::KB_RECRAWL_SUMMARY::` and the GitHub issue.
- [ ] A source that goes dark behind a WAF fails the monthly job.
- [ ] `linkedOnlyPrefixes` is declared by `msu-grapes` alone (blast-radius guard passes).
- [ ] `npm run verify:msu` passes.
- [ ] `npm run verify:knowledge-base` passes.
- [ ] Full `npx vitest run`, `npx tsc --noEmit`, and `npm run lint` are clean.
- [ ] No regressions in existing tests.
