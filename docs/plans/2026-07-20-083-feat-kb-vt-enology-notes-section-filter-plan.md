---
title: VT Enology Notes knowledge source + section-level technical filter
type: feat
status: draft
date: 2026-07-20
branch: claude/kb-vt-enology-notes
depth: standard
units: 7
---

## Overview

Add Virginia Tech's *Enology Notes* (`enology.fst.vt.edu`, notes #1–170, 2000–2013, by Dr. Bruce
Zoecklein) to the assistant's knowledge corpus, and give the crawl pipeline its first
**section-level** content filter so the ~38% of the archive that is travel ads, staff
announcements, and newsletter housekeeping never reaches an embedding.

This is not a config edit. Every existing filter in the pipeline is URL-path-based, and VT mixes
technical and non-technical content *inside a single URL* — `166.html` carries rot-metabolite
chemistry and a $3,200 Burgundy tour on the same page. Separating them requires a new layer.

## Problem Frame

**The problem:** the assistant should cite winemaking science. Without a section filter it would
also cite a 2013 obituary, a conference registration deadline, and "Winery Planning and Design CD,
Edition 14 Available" — all embedded as if they were technical guidance.

**Why "crawl it all and let vector similarity sort it out" fails:** retrieval operates on chunks,
and chunks inherit their document. Because the pipeline is strictly one-document-per-URL (see Key
Decisions), the obituary and the rot chemistry land in the *same* document. There is no similarity
threshold that separates them after the fact. The filter has to run before extraction or not at all.

**What happens if we do nothing:** we skip a genuinely good tier-1 extension corpus — 14 years of
Zoecklein on stuck fermentation, volatile sulfur, Brett, phenolics — because ~38% of it is noise.
That's the wrong trade. The corpus is worth having; the noise is a solvable engineering problem.

**Product pressure test note:** the section filter is deliberately built as a reusable, per-source
opt-in rather than a VT-specific hack. Several already-configured sources (`wsu` in particular,
which allows `/` and then denies ~35 non-technical path prefixes) are solving a coarser version of
this same problem at the URL layer. This gives the pipeline a finer instrument. But we are NOT
retrofitting it onto other sources in this plan.

## Requirements

- **MUST** ingest VT Enology Notes #1–166 (HTML) and #167–170 (PDF-only).
- **MUST** drop non-technical sections at the section level, not the page level.
- **MUST** keep the source on the existing monthly sweep (`.github/workflows/knowledge-recrawl.yml`,
  cron `0 9 1 * *`) — i.e. `autoCrawl` must NOT be `false`, since that flag excludes a source from
  the sweep entirely.
- **MUST** honor robots.txt via the existing path. The host returns 404 for `/robots.txt`, which the
  crawler already treats as permissive. **Do not set `ignoreRobots`.** Nothing needs bypassing.
- **MUST** set a cite-only `license` string reflecting VT's all-rights-reserved footer, so provenance
  is stored per document and retrieval always links back.
- **MUST** make the filter version participate in re-index idempotency (see Risk R1) — otherwise
  tuning the patterns is a silent no-op on every subsequent crawl.
- **MUST** express the drop rules as a pure, unit-tested function with no I/O.
- **SHOULD** survive both site templates (2013-era and 2006-era) — they differ materially.
- **NICE:** per-chunk anchor deep-linking (`166.html#1`). Explicitly out of scope, see below.

## Scope Boundaries

**In scope:**
- A reusable pure section splitter + classifier under `src/lib/knowledge/sections/`.
- An optional `sectionFilter` field on `KnowledgeSourceConfig`, opt-in per source.
- `sourceKey` plumbed into `indexDocument` (optional field; four call sites pass it).
- The VT source config, `TRUSTED_DOMAINS` entries, and seed.
- A golden-case test suite built from real VT headings across four eras.

**Out of scope and why:**
- **Per-anchor documents** (`166.html#1` as its own row). Blocked at three independent points; see
  Key Decisions. Would touch the dedup invariant the whole corpus rests on.
- **Per-chunk anchor deep-linking.** Additive and cheaper than per-anchor documents (an `anchor`
  column on `KnowledgeChunk` plus plumbing through `chunk.ts`, the raw INSERT, `retrieve.ts`, and
  `search-knowledge-base.ts`), but it is a retrieval-UX improvement orthogonal to this plan.
  Document-level citation is what every other source does today.
- **Retrofitting the filter to existing sources.** New instrument, one consumer, prove it first.
- **Backfilling `KnowledgeBlob.blobUrl`.** Discovered during research: `persistDocument` never
  populates it, so raw bytes are not retrievable at index time and re-extraction always means a
  re-fetch. Real gap, logged separately, not this plan's job.

## Research Summary

### Codebase patterns

**The seam.** `indexDocument` (`src/lib/knowledge/index-documents.ts:30`) receives `bytes: Buffer`
and calls `extractDocument(input.bytes, input.contentType, input.url)` at line 80. The raw HTML is
fully in scope there — no plumbing change needed to filter before extraction.

**One document per URL, enforced three times.** This is the decisive structural fact:
1. `normalizeCrawlUrl` (`crawl/crawler.ts:24`) opens with `raw.split("#")[0]` — the fragment is
   destroyed before the URL is parsed.
2. `extractLinks` (`crawl/link-gate.ts:15`) drops any `href` starting with `#`.
3. Alias-dedup (`index-documents.ts:59-78`) keys on `indexedContentHash`, the hash of the **raw
   fetched bytes**. Two fragments of one page share a hash, so the second document row is
   hard-deleted (`db.knowledgeDocument.delete`, line 75) and returns `skipped: "duplicate"`.

**No per-source hook exists anywhere in extract or index.** `extractDocument` switches on
`contentType` only. `chunkMarkdown(markdown, title)` is pure and source-blind. Notably
`indexDocument`'s input type omits `sourceKey` even though all four call sites
(`crawl-source.ts:37`, `recrawl-knowledge.ts:54`, `crawl-curated.ts:96`, and the `CrawledDoc` type
at `crawler.ts:38`) have it in hand and drop it on the floor. Adding it back is the minimal change.

**Config-only fields are an established convention.** `seed-knowledge-sources.ts:16-26` persists a
fixed subset of fields; `sitemapUrls` and `autoCrawl` already live in code only. A new
`sectionFilter` field therefore needs **no migration and no seed change**.

**No `maxDepth` in the crawl BFS.** `crawler.ts:311-367` is an unbounded queue walk capped only by
`maxDocs` (default 3000) and the allow/deny prefix gate. A `2013.html → 2005.html → 112.html` hop
would traverse fine.

**PDF routing is by Content-Type with a magic-byte fallback** (`crawl/fetcher.ts:26-34`), never by
extension. `EnologyNotes167.pdf` returns `200`, `application/pdf`, 351,265 bytes, magic `%PDF-1.5` —
it will route to `extract/pdf.ts` automatically provided `/downloads/` is in `allowPrefixes`.

### External research (empirical, run against the live site)

**Defuddle destroys the anchors.** Verified by running the repo's exact extraction call
(`Defuddle(html, url, { markdown: true })`, defuddle 0.19.1) against real `166.html`:

| signal | count in extracted markdown |
|---|---|
| `<a name` | 0 |
| `](#` | 0 |
| `name="` | 0 |

Raw HTML contains 12 `<a name=...>` elements. All are empty (`<a name="3" id="3"></a>`) and Defuddle
prunes empty inline nodes. **Post-extraction anchor splitting is impossible.** Headings do survive,
as bold-on-own-line with an escaped period: `**3\. The Technical Study Tour: Alsace, Burgundy and
Champagne.**`. The top-of-page `<ol>` table of contents is dropped entirely.

**Two templates, and a markdown regex cannot span them.**

| | 2013-era (`166.html`) | 2006-era (`112.html`) |
|---|---|---|
| anchor | `<a name="3" id="3">` | `<a name="1">` — **no `id`** |
| heading | bold, own line, arabic | bold, **inline with body text**, Roman numerals |
| TOC | `<ol>`, dropped by Defuddle | `<p>`, survives |
| nav chrome | stripped correctly | **Defuddle fails**, ~60 lines of link soup leak in |

A line-anchored markdown regex tuned on `166.html` finds **zero** sections in `112.html`. Raw-HTML
anchor splitting is the only approach that works on both — and it has a useful side effect: slicing
on anchors discards the pre-first-anchor region, which is exactly where the 2006-era nav soup lives.

Anchor nesting also varies: `name="2"` sits *outside* its `<strong>` while `name="3"` sits *inside*.
The splitter must key on `<a name="..."` itself, never on a `<p><strong><a` composite.

**`res.title` is unreliable** — on `166.html` it returns the site-wide "Enology Notes | Wine /
Enology Grape Chemistry Group". The issue number lives in an `<h1>` that Defuddle drops. Derive it
from the URL.

### Pattern research (four year-indexes: 2002, 2005, 2008, 2011; 125 titles harvested)

**Four patterns are traps and must never be used:**

| Rejected pattern | Why |
|---|---|
| `/technical/i` | **Semantically inverted in this archive.** "Volatile Sulfur Compound Technical Roundtable" and "Technical Study Tour" are events; zero genuinely technical titles contain the word. |
| `/review/i` | "Brettanomyces Review", "Herbaceous Character in Red Wines – A Review" are literature reviews. |
| `/sustainab(le\|ility)/i` | "Sustainable Winery Expansion – Energy and Water Use Audit" is substantive engineering. |
| bare `/available/i` | "available nitrogen" / YAN is core vocabulary; 2008 #141–143 are entirely about assimilable nitrogen. |

Also rejected: bare `/new/i` ("New Analytical Technologies" is technical), bare
`/winery planning and design/i` (ad, event, *and* technical depending on suffix), `/norton/i`
(a grape variety).

**Drop ratio: 47 of 125 titles (37.6%)** across 2005/2008/2011 — but the range is **5% to 64%** by
issue, driven by issue length rather than year. 2011 #159 is a 29-section deep dive on stuck
fermentation with zero announcements; 2005 #97–#103 are near-pure event calendars. Any per-issue
"~30%" expectation will be wrong in both directions.

**Year indexes are not uniformly section-level.** 2008/2011 list numbered sections; 2005 and 2002
list comma-joined *issue summaries*. Running a title matcher against 2002/2005 index lines would be
destructive (2002 #45: `Gelatin Fining, Virginia Wine Guide, Student Award Winner` — an `/award/i`
hit drops gelatin-fining chemistry). **The rule runs on per-issue page headings only, never on index
lines.** This also means the index pages are navigation, not content.

### Prior learnings

`rstack-learnings` is empty for this project (0 entries). Relevant memory:
- Worktrees lack `.env`; DB-touching verification runs from the MAIN checkout.
- `npm run` up-resolves, so worktree scripts can silently execute against MAIN.
- New `*-core.ts` files fail `verify:ai-native` until wired — not applicable here (no core/tool).

## Key Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Where to split | **Raw HTML, pre-Defuddle**, on `<a name="...">` | Post-extraction markdown regex | Anchors are provably destroyed by Defuddle (0 survivors). Markdown regex tuned on 2013 finds 0 sections in 2006. |
| Document granularity | **One document per URL**, bad sections stripped from the HTML before extraction | One document per anchor | Blocked at 3 points (`normalizeCrawlUrl`, `extractLinks`, alias-dedup on raw-byte hash). Per-anchor rows would need all three changed — that's the dedup invariant the corpus rests on. |
| Filter shape | Heading-pattern match, **fail-open** | LLM classification per section | ~900 sections × an LLM call is slow, costly, and non-deterministic. Headings recur near-verbatim for 14 years; patterns are testable and free. |
| Ambiguity default | **Keep** | Drop | False negatives (an ad leaks in) are annoying. False positives (dropping rot chemistry) are much worse. |
| Sweep participation | `autoCrawl: true` + **fully enumerated `seedRoots`** | Curated spec (`autoCrawl: false`) | `autoCrawl: false` excludes a source from the monthly sweep, violating a MUST. Enumeration also defeats the 304 problem (R2). |
| Admin-title sections | **Keep if a colon has surviving substance after it** | Drop all | USER RULING. Rescues "New On-Line Publications: Oxidation Sensory Screen…" and the winemaker HACCP plan. |
| Event/trip recaps | **Drop, same as ads** | Keep recaps | USER RULING. Simpler, higher precision. Accepted casualty noted below. |
| Lab-service notices | **Keep** | Drop | USER RULING. They typically define the assay and its interpretation. |
| PDF sections | Whole-document, unfiltered (Unit 5) | Markdown heading filter on PDFs | PDFs have no anchors. 4 documents; the noise is bounded and the fallback is low-confidence. Revisit if it shows up in retrieval. |

**Accepted false positive, recorded deliberately:** under the "drop both" recap ruling,
`Phenols and Mouthfeel, Wineries Unlimited 2011` (#157) is dropped. The topic is technical; the
trade-show suffix triggers the event rule; the separator is a comma so the colon rescue does not
apply. Bending the rule to save one title would require matching commas, which would break
`Wine Filtration Workshop, February 10`. One known casualty is the better trade.

## Risks

**R1 — Silent no-op on rule changes (MUST fix).** `index-documents.ts:46` short-circuits when
`doc.indexedContentHash === input.contentHash`, where `contentHash` is the hash of the **raw fetched
bytes**. Tuning a drop pattern does not change the bytes, so every subsequent crawl returns
`skipped: "unchanged"` and the new rules never take effect. The filter's version identifier must
participate in the stored hash basis. Unit 3 owns this.

**R2 — 304 kills link discovery.** `crawler.ts:346-351` `continue`s on `notModified` with the
comment "we don't have the body; rely on the sitemap seed." For a sitemap-less source, an unchanged
index page means its children are never re-enqueued that run. Mitigated by enumerating every issue
URL directly in `seedRoots` — seeds are enqueued unconditionally.

**R3 — RETIRED by spike (2026-07-20).** Slice → drop → reassemble → single Defuddle pass is viable.
Measured across 14 issues spanning 2000–2013:
- **Prose fidelity 136/136** — every sampled 200-char normalized prose window from the original
  markdown appears verbatim in the reassembled markdown.
- **`lowConfidence` never trips** on a reassembled doc that had ≥1 anchor.
- **Worst length ratio 0.593 (#130)** is NOT readability rejection. A line-level diff of
  original-minus-reassembled returns 28 lines, 27 of them `[Links](…)`-style left-nav and one
  `###### Enology Service Lab`. **Zero prose lines.** Per-slice extraction tracks the single-pass
  length within ~1%, confirming Defuddle is not scoring the stripped document down.
- **Bonus:** anchor slicing discards the preamble, which is exactly where the T2-era nav soup lives.
  The filter fixes a pre-existing extraction-quality problem for free.
- The alternative (Defuddle each slice, join markdown) is equivalent on fidelity but loses
  intra-section bold (`**Vineyard.**` → `Vineyard.` on #159) and costs N Defuddle calls. Single pass wins.

**R4 — THREE templates, and the earliest one breaks anchor splitting (spike, 2026-07-20).**

| family | issues | anchors | headings | nav soup |
|---|---|---|---|---|
| **T1** | **#1–40** (2000–2002) | **NONE** | unnumbered inline bold, `<strong>` or `<b>` | none — Defuddle extracts cleanly |
| **T2** | #41–~145 | `<a name="1">`, **no `id=`** | Roman (#112) *or* arabic (#130), varies by issue not year | **leaks 2.0–2.4 KB** |
| **T3** | ~#150–166 | `<a name="1" id="1">` twins | arabic | stripped correctly |

`#141` is the transition — 3 anchors, only 1 carries `id=`. First anchor anywhere appears at **#41**;
anchorlessness confirmed at 5, 10, 15, 20, 25, 30, 35, 40.

**T1 is ~24% of the HTML corpus and would silently return `skipped: "empty"` under naive slicing.**
Unit 3 MUST branch on it. Decision: **T1 pages are ingested whole and unfiltered (fail-open)**,
consistent with this plan's default-to-keep principle. A "paragraph-leading bold run" fallback
splitter was prototyped during the spike and rejected: it is lossy on real content (missed
`Maximizing aroma/flavor.` on #25), and several T1 issues (#10, #30, #40) are single-topic memos
with no section heads at all. Accepted cost: ~40 short documents (1.5–4 KB markdown each) carry
unfiltered announcement text. Small volume, and losing real 2000–2002 chemistry to a lossy heuristic
is the worse error.

**R6 — Splitter edge cases found by spike (all MUST be handled in Unit 1).**
- **Anchor tags span newlines.** `#50` is `<a\nname="1">`. The `\s+` in the pattern is load-bearing;
  a line-based match finds zero.
- **Sub-anchors are multi-letter.** `#159` has `29bi` and `29bii`. Use `[0-9]+[a-z]*`, not
  `[0-9]+[a-z]?` — the correct pattern finds 33 anchors vs 31.
- **Some issues anchor only at sub-level.** `#155` starts at `1a`; there is no `name="1"`.
- **Numeric `name=` appears on non-`<a>` elements** (`<p id="1a" name="1a">` on #155), and `#92`
  has a `name="0"`. T3 chrome anchors (`skip-menu`, `MainContent`, `vtsearchform`) are correctly
  ignored by a numeric-only pattern.
- **Slice from the enclosing block tag, not the anchor.** Slicing exactly at `<a name` starts inside
  the `<p><strong>`, so that section's heading loses its bold. Backing the slice start up to the
  enclosing block tag (`<p|li|h[1-6]|div|blockquote`, only when no closing tag intervenes) restores
  it for +4 bytes. Verified on 6 issues.
- **The discarded preamble carries the issue date and `Subject:` line.** Capture the date before
  discarding it if citation metadata ever wants it (`res.title` is unusable — see Research).

**R5 — Copyright.** VT asserts "Unauthorized use is prohibited" with no license grant. User decision
is to proceed cite-only. The `license` field must say so explicitly, and the existing citation path
(`/kb/source/{documentId}` → 302 to `canonicalUrl`) already links every retrieval back to VT.

## Implementation Units

### Unit 1: Pure HTML section splitter

**Goal:** Split a raw VT HTML page into ordered sections keyed by their `<a name>` anchors.
**Files:** `src/lib/knowledge/sections/split-html-sections.ts`, `test/knowledge-sections-split.test.ts`
**Approach:** Pure function, no I/O, no DOM library beyond what the repo already has. Match
`<a\s+name="([0-9]+[a-z]*)"` case-insensitively and slice between match offsets. **Every detail here
was forced by the spike — see R6, and do not "simplify" any of them:** `\s+` (anchors span
newlines), `[a-z]*` not `[a-z]?` (multi-letter sub-anchors `29bi`/`29bii`), numeric-only capture
(ignores T3 chrome anchors like `skip-menu`), and slice-start backed up to the enclosing block tag
(`<p|li|h[1-6]|div|blockquote`, only when no closing tag intervenes) so the heading keeps its bold.
Key on the anchor tag itself, never on a `<p><strong><a` composite — nesting varies between
`name="2"` and `name="3"`. Return `{ anchor, headingText, html }[]` plus the discarded preamble.
Derive `headingText` from the text immediately following the anchor up to the closing
`</strong>`/`</p>`, tolerating both the arabic (`3. Title`) and Roman (`II. Title`) forms.
Sub-anchors are sections in their own right; preserve the raw anchor id so Unit 3 can decide nesting,
and do not assume a parent exists (`#155` starts at `1a` with no `name="1"`).
**Zero anchors is a valid, expected result** (all of T1, ~40 issues) — return an empty section list
and let Unit 3 branch, never throw.
**Tests:** fixture-based, using saved real HTML from **all three templates**: `166.html` (T3, 7
sections, `id=` twins), `112.html` (T2, 2 sections, no `id=`, inline Roman heading), and `5.html`
(T1, zero anchors). Assert: correct section count per template; correct heading extraction on both
arabic and Roman forms; preamble (nav soup) excluded; **T1 returns zero sections without throwing**.
Regression cases for each R6 edge: the newline-spanning anchor (`50.html`), the multi-letter
sub-anchor (`159.html` → 33 not 31), the sub-level-only start (`155.html` → `1a` first), and the
bold-preserving slice start.
**Depends on:** none
**Execution note:** test-first — the fixtures are the specification.
**Patterns to follow:** pure-logic + colocated unit test, as in `src/lib/voice/sentence-chunker.ts`
and `src/lib/vineyard/field-coercion.ts`.
**Verification:** `npx vitest run test/knowledge-sections-split.test.ts`

### Unit 2: Pure section classifier

**Goal:** Decide keep/drop for a section heading, with a reason string for auditability.
**Files:** `src/lib/knowledge/sections/classify-section.ts`, `test/knowledge-sections-classify.test.ts`
**Approach:** Pure `classifySection(headingText) => { keep: boolean; reason: string }`. Normalize
first: strip the leading section number (`/^\s*(\d+|[IVXLC]+)[.)]\s*/`), strip markdown emphasis,
normalize en-dash to hyphen, `On-Line`→`Online`, `Round Table`→`Roundtable`. Then apply the drop
patterns from the research table (events, personnel, admin housekeeping) — **excluding the four
rejected traps**, which must be called out in a code comment so nobody re-adds `/technical/i`.
Apply the three user rulings: colon-rescue (if a colon is present and the right-hand side survives
the drop patterns, keep), recaps dropped alongside ads, lab-service notices kept. Default is keep.
**Tests:** the golden case list. Negatives (must drop): `In Memory of Dr. Keith Patterson`,
`The Technical Study Tour: Alsace, Burgundy and Champagne`, `Our New Research Enologist`,
`Wine Filtration Workshop, February 10`, `Best Student Paper Award`,
`Winery Planning and Design CD, Edition 14 Available`, `New Web Site Domain Address`,
`Phenols and Mouthfeel, Wineries Unlimited 2011` (the accepted casualty — assert it drops, so the
trade-off is visible in the suite). Positives (must keep): `Wine Storage and Bottling Quality
Control`, `Microbial Ecology during Vinification`, `Production Considerations for Rot-Degraded
Fruit`, `A Review of Rot Metabolites`, `Brettanomyces Review`, `Sustainable Winery Expansion -
Conducting an Energy and Water Use Audit`, `New Analytical Technologies`, `New Virginia Tech Enology
Service Lab Offering: Sanitation Monitoring`, `New On-Line Publications: Oxidation Sensory Screen -
Hydrogen Sulfide/Mercaptan Sensory Screen`. Add explicit anti-regression cases asserting the four
rejected patterns are not in force.
**Depends on:** none (parallel with Unit 1)
**Execution note:** test-first.
**Verification:** `npx vitest run test/knowledge-sections-classify.test.ts`

### Unit 3: Wire the filter into the index path

**Goal:** Apply the section filter to configured sources before extraction, and make rule changes
actually take effect on re-crawl.
**Files:** `src/lib/knowledge/sections/index.ts`, `src/lib/knowledge/index-documents.ts`,
`src/lib/knowledge/config.ts` (interface only), `scripts/crawl-source.ts`,
`scripts/recrawl-knowledge.ts`, `scripts/crawl-curated.ts`, `test/knowledge-sections-filter.test.ts`
**Approach:** Add an optional `sectionFilter?: SectionFilterConfig` to `KnowledgeSourceConfig`,
following the `autoCrawl`/`sitemapUrls` precedent (config-only — no migration, no seed change). Add
optional `sourceKey?: string` to `indexDocument`'s input and pass `doc.sourceKey` at the four call
sites that already have it. Between `index-documents.ts:78` and the `extractDocument` call at line
80: when the source has a `sectionFilter` and `contentType === "html"`, split → classify → reassemble
the surviving sections into a minimal synthesized HTML body → pass those bytes to `extractDocument`.
No configured filter means the current path runs byte-identically.

**R1 fix (the important part):** derive the value stored in `indexedContentHash` from the raw content
hash **plus** a `SECTION_FILTER_VERSION` constant, so bumping the constant invalidates idempotency and
forces a genuine re-index. Leave `KnowledgeBlob.contentHash` (byte dedup) alone — only the *index*
idempotency basis changes. Document the constant with a comment saying it must be bumped whenever a
drop pattern changes.

**T1 branch (MUST — see R4).** If the splitter returns **zero** sections, the page is a T1-era
(#1–40) anchorless memo, not an empty page. Pass the **original bytes through unfiltered** rather
than returning `skipped: "empty"`. Getting this wrong silently drops ~24% of the corpus, and the
failure is invisible — the crawl reports success with a lower document count. Log the fail-open at
info level so Unit 6 can count it.

Guard the genuinely degenerate case separately: sections were found but *all* were dropped → return
`skipped: "empty"` rather than handing Defuddle an empty body.
**Tests:** a source with no `sectionFilter` produces byte-identical extraction input to today
(regression guard); a configured source drops the expected sections; **a zero-anchor T1 page
extracts whole and unfiltered, and does NOT return `skipped: "empty"`**; a page whose sections are
all dropped DOES return `skipped: "empty"`; bumping `SECTION_FILTER_VERSION` changes the stored hash
for identical bytes.
**Depends on:** Units 1, 2
**Patterns to follow:** the optional-config-field convention at `config.ts:17-21`; the existing
`skipped` union at `index-documents.ts:16`.
**Verification:** `npx vitest run test/knowledge-sections-filter.test.ts` plus a manual extraction
diff on real `166.html` and `112.html` confirming R3 (Defuddle handles the synthesized body, and the
surviving technical prose is intact).

### Unit 4: VT source configuration

**Goal:** Register the source so it crawls, appears in settings, and joins the monthly sweep.
**Files:** `src/lib/knowledge/config.ts`, `test/knowledge-config.test.ts`
**Approach:** Append a `KnowledgeSourceConfig` with `key: "vt-enology-notes"`, `publisher: "Virginia
Tech Enology"`, `homeDomain: "enology.fst.vt.edu"`, `tier: 1`, `crawlCadence: "monthly"`,
`defaultEnabled: true` (tier-1 extension, consistent with `awri`/`wsu`), and `autoCrawl` left
**unset** so it defaults true and the sweep picks it up.

`license`: an explicit cite-only string recording VT's all-rights-reserved footer — e.g. "© Virginia
Polytechnic Institute and State University. All rights reserved; no license granted. Retrieval with
citation and link-back only — do not reproduce at length."

`seedRoots`: **fully enumerated**, not link-discovery dependent (R2). Generate `/EN/{n}.html` for
n = 1..166 with an inline expression, plus `/EN/index.html` and the four
`/downloads/EnologyNotes{167..170}.pdf`. 404s on gaps are counted as errors and are harmless.
`allowPrefixes`: `["/EN/", "/downloads/"]` — `/downloads/` is required for the PDFs to pass
`pathAllowedFor`. `denyPrefixes`: the site-chrome paths (`/faculty/`, `/news/`, `/teaching/` and
similar), with a comment explaining that the *primary* filter is now section-level, and these
prefixes only keep the crawler off the department's non-newsletter pages.
Wire `sectionFilter` to the Unit 2 classifier.
Add `enology.fst.vt.edu` to `TRUSTED_DOMAINS` with `sourceKey: "vt-enology-notes"`. Check whether
`www.enology.fst.vt.edu` resolves; add it only if it does.
**Tests:** extend `test/knowledge-config.test.ts` — the source is present; its domain is in
`TRUSTED_DOMAIN_SET` (without it the crawler refuses the host outright); `autoCrawl !== false` so the
sweep includes it; `allowPrefixes` admits both a sample issue URL and a sample PDF URL; `seedRoots`
has the expected cardinality.
**Depends on:** Unit 2 (needs the classifier to reference)
**Patterns to follow:** the `wsu` entry (`config.ts:66-125`) for a commented deny list; `awri`
(`config.ts:27-53`) for the general shape.
**Verification:** `npx vitest run test/knowledge-config.test.ts`

### Unit 5: PDF-only notes #167–170

**Goal:** Ingest the four PDF-only issues.
**Files:** none expected beyond Unit 4's `seedRoots`/`allowPrefixes`; add a test if a gap appears.
**Approach:** Mostly a verification unit. The existing pipeline routes by Content-Type with a
magic-byte fallback (`fetcher.ts:26-34`), and `EnologyNotes167.pdf` is confirmed `200` /
`application/pdf` / 351 KB / `%PDF-1.5`. It should flow to `extract/pdf.ts` with no code change once
`/downloads/` is allowed. Confirm the 15 MB `MAX_BYTES` ceiling is not a factor (351 KB — fine).
These four are ingested **whole**, unfiltered: PDFs have no anchors, so the section splitter cannot
run. Note in the source config comment that four documents carry unfiltered announcement text, and
that this is a bounded, accepted exception.
**Tests:** assert the PDF URLs pass `pathAllowedFor` for this source's config.
**Depends on:** Unit 4
**Verification:** crawl one PDF URL and confirm a non-empty `KnowledgeDocument` with `kind: "pdf"`
and a plausible chunk count.

### Unit 6: End-to-end verification script

**Goal:** Prove the whole loop against the live archive and surface template drift (R4).
**Files:** `scripts/verify-vt-enology.ts`, `package.json` (a `verify:vt-enology` script)
**Approach:** Follow the existing `verify:*` convention. Crawl a bounded sample spanning **all three
templates** — at minimum 5 and 25 (T1, anchorless), 50, 112 and 130 (T2), 141 (the transition), 159
and 166 (T3) — and report per issue: template family, sections found, sections kept, sections
dropped **with the reason string**, T1-fail-open flag, and final chunk count. Report a corpus-wide
**T1 fail-open count**; if it materially exceeds ~40 that means anchorless pages are appearing
outside #1–40 and the template map is wrong. Assert the three user-named URLs' sections are absent
from the indexed text
(`In Memory of Dr. Keith Patterson`, the Alsace study tour, `Our New Research Enologist`) and that
named technical sections are present.
**Depends on:** Units 3, 4, 5
**Patterns to follow:** existing `verify:ttb` / `verify:excise` / `verify:commerce7` scripts.
**Verification:** `npm run verify:vt-enology` — **must be run from the MAIN checkout**, which has
`.env`; this worktree does not. Wrap any tenant-scoped read in `runAsTenant`; note the corpus itself
is GLOBAL (no `tenantId`) per ADR 0007.

### Unit 7: Documentation and registers

**Goal:** Keep the brain honest.
**Files:** `docs/AUTOMATION.md`, `docs/architecture/scale-register.md`, `NOW.md`,
`src/lib/knowledge/config.ts` (header comment)
**Approach:** Note the new source in the automation loop docs. Add a scale-register entry for the
section filter: what it is, why one-document-per-URL forced strip-in-place over per-anchor rows, and
the tripwire — *if a future source needs per-anchor citation granularity, revisit the three
fragment-stripping points rather than working around them*. Update `config.ts`'s header comment,
which still claims adding a source "is a config edit, not code" — true for most sources, now with a
documented exception. Update `NOW.md` per the repo convention.
**Depends on:** Units 1–6
**Verification:** `npm run verify:invariants` stays green; docs render in Obsidian.

## Test Strategy

Three layers:
1. **Pure unit tests** (Units 1, 2) — the splitter and classifier have zero I/O, so the golden
   heading corpus runs in milliseconds and is the real regression net. The four rejected patterns get
   explicit anti-regression cases; the accepted casualty gets an assertion so the trade-off is
   visible rather than folklore.
2. **Integration test** (Unit 3) — the no-filter path must remain byte-identical, proving zero blast
   radius on the 17 existing sources.
3. **Live end-to-end** (Unit 6) — the only layer that can catch template drift, and the only one that
   needs `.env` and the network.

## Confidence Check

| Section | Confidence | Notes |
|---|---|---|
| Problem Frame | HIGH | One-document-per-URL verified by reading the code, not inferred. |
| Scope Boundaries | HIGH | Per-anchor documents ruled out on three independent, quoted mechanisms. |
| Implementation Units | HIGH | The seam (`index-documents.ts:80`) was read directly and has raw bytes in scope. |
| Test Strategy | HIGH | Golden corpus drawn from 125 real harvested titles across four years. |
| Risk Assessment | **HIGH** (was MEDIUM) | Spike run 2026-07-20 against 22 live issues spanning 2000–2013. R3 retired empirically (136/136 prose fidelity, `lowConfidence` never trips, worst ratio explained as nav-soup removal). R4 resolved: three templates, boundaries located (#41 and ~#150), T1 anchorlessness confirmed at 8 sampled issues. Five splitter edge cases (R6) found and specified before any code was written. |

**Spike status: COMPLETE.** The pre-`/work` spike that this section originally recommended has been
run. Its findings are folded into R3, R4, R6, Unit 1, and Unit 3. Residual unknown: the T2/T3
boundary is approximate (`~#150`) and heading style varies by issue rather than by year within T2 —
which is fine, because the splitter keys on anchors, not on heading style. Unit 6's per-issue
reporting remains the guard against anything the 22-issue sample missed.
