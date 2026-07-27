# SKB — Knowledge-base IPM source expansion (implementation plan)

**Phase:** SKB (background lane, any wave; `SKB←∅`)
**Runbook contract:** [§9 SKB](../SPRAY_ASSISTANT_RUNBOOK.md) lines 867–882, plus
[spray-data-sources-design.md §4](../spray-data-sources-design.md) lines 197–243
**Council:** not yet run — `/council` before build (`phases/SKB-council-feedback.md`)
**Branch:** `claude/skb-knowledge-sources` (plan authored on `claude/skb-knowledge-sources-plan-5fc60c`)
**Plan depth:** Deep — 10 units across 4 PRs
**Author:** `/plan`, 2026-07-26

**Read before this plan:**
- Runbook §3.2 (two engines, never mixed) and §3.6 (a coverage gap never renders as "no restriction")
- `src/lib/knowledge/config.ts` lines 10–46 (`KnowledgeSourceConfig`) and lines 857–888
  (`partitionSeededSources` and the `virginia-fruit` production incident)
- `scripts/verify-kb-register.ts` lines 16–23 (the displacement workflow) and
  `src/lib/knowledge/eval/register.ts` lines 113–116 (thresholds)
- `.github/workflows/knowledge-crawl-source.yml` lines 5–14 (why the monthly sweep cannot populate a
  new source)
- `test/knowledge-config.test.ts` lines 252–366 (registry integrity) and 389–457 (the MSU dormancy
  tripwires)

---

## 1. Problem frame

The corpus has 25 registered sources and strong coverage of California (`uc-ipm`), the Pacific
Northwest (`wsu`, `osu-extension`, `osu-owri`), Australia (`awri`, `wine-australia`), and Europe
(`mapa`, `ifv-*`, `wbi`, `lvwo`). Its eastern-US coverage is one publisher: `cornell-grapes`.

That is the gap this phase closes. A grower in Virginia or Michigan asking *"why is downy mildew
pressure high this week"* currently gets an answer grounded in a Californian Mediterranean-climate
guideline, which is the wrong epidemiology. S5a and S5b will model eastern disease pressure; the
corpus needs to be able to explain it in an eastern voice.

**Two things the recon changed about the phase as scoped.**

First, **two of the four named candidates should be rejected, not added.** The runbook names Penn
State Extension, NEWA model documentation, Virginia Tech's pest guide, and a decision on MSU. Recon
(§6) found that NEWA publishes roughly 2 KB of crawlable grape prose behind a single-page app, with
its actual documentation as an uncaptioned video — and that Virginia Tech's pest guide, ENTO-635-C,
is 23 pages of which about 22 are product/rate/REI/PHI/FRAC spray tables, with `life cycle` and
`scouting` appearing zero times in the whole document. ENTO-635-C is not a knowledge source that
happens to contain rates. It is the rate table, in a PDF costume. It is the exact artifact the SKB
scope forbids, and it carries the most permissive licence of any host examined, which is a useful
reminder that **licence is not the constraint here; content is.**

Replacements exist and are better: `virginiafruit.ento.vt.edu` carries 82 HTML pest-biology pages at
a 64 % text-to-markup ratio with per-page `Last-Modified` headers, from the same institution.

Second, and more important: **the boundary this phase depends on is enforced architecturally but not
conversationally, and SKB is the phase that makes that gap dangerous.** Today registration data is
genuinely relational — `epa-pesticide` is a `KnowledgeSource` row with `seedRoots: []` and
`autoCrawl: false` that exists only for the per-tenant toggle and citation plumbing, and
`src/lib/pesticide/lookup.ts` is the single Prisma choke point with entitlement failing closed. That
half is real. But `src/lib/assistant/tools/search-knowledge-base.ts` lines 74–79 advertise the
knowledge base's own scope as including *"disease/pest management, compliance"*, and nothing in its
eight rules tells the model to refuse a legality question or hand it to the relational engine. Rule 4
has exactly the right shape — *do not do the math yourself, use `calc_so2`* — but it exists only for
arithmetic. The only guard standing between a retrieved passage and a spray-rate answer is Rule 8,
and by its own wording it engages only for a **stale** passage.

So the current state is: adding eastern IPM prose to the corpus increases the surface area of a
question the assistant is not instructed to refuse. The phase that adds the prose is the phase that
owes the refusal. That is why PR 1 is the boundary guard and lands before any source.

**What we are not solving.** This phase does not make the corpus a legality authority, does not
ingest label values, and does not build the NEWA integration (explicitly Later in the runbook line
147). It closes a geographic coverage gap in explanatory prose, and it hardens the line between that
prose and the deterministic engine.

---

## 2. ⚠️ The decision this phase owns — where the corpus/relational line actually falls

The runbook states the constraint as a list: *"FRAC codes, label rules, thresholds, and interlocks
are S2/S2b/S7 relational data"* (line 875). Read literally, "FRAC codes" excludes any page mentioning
a FRAC group number. Recon shows that reading would gut the phase: MSU's fruit updates and PSU's
management articles are advisory prose that routinely names group numbers as context — *"products in
FRAC groups 3 (DMIs) and 11 (QoIs) remain key options for powdery mildew and black rot, while
multi-site protectants such as captan (M4) or mancozeb (M3) provide additional coverage"* — while
explicitly delegating the numbers to the label: *"always follow the product label for grape age
restrictions, rates, adjuvants, maximum seasonal use, preharvest intervals, restricted-entry
intervals."*

That prose is not a competing authority. It is the answer to *"why is powdery pressure high this
week,"* which is the corpus's job.

### DECISION: the line is **tabular vs prose**, not **mentions-FRAC vs does-not**

Three tiers, and the middle one is where the judgment lives:

| Tier | Content | Disposition | Why |
|---|---|---|---|
| **A** | Disease biology, epidemiology, disease cycle, symptoms, scouting method, phenology, cultural practice | **Corpus** | This is what RAG is for |
| **B** | Advisory prose that names FRAC groups or active ingredients as *context*, and defers rates to the label | **Corpus**, subject to the currency guard | Not a structured authority; excluding it removes the entire value of eastern extension advisory writing |
| **C** | A **table or matrix** keyed by product/active ingredient — product × FRAC group, product × efficacy rating, product × rate, product × REI/PHI | **Never the corpus.** Route to S2/S2b relational, or drop | A structured product→fact mapping in the corpus is a *second, unversioned answer* to a question the relational engine answers exactly. Rule §3.6's failure mode arrives by way of a stale table, not by way of prose |

**The mechanism that makes C dangerous is specific and worth naming:** a product→FRAC table in the
corpus can be retrieved and quoted as authoritative while `pesticide_resistance_assignment` says
`GAP` for the same product. That is not a coverage gap rendering as unknown — it is a coverage gap
rendering as a *confident answer from the wrong engine*. Rule §3.6 in its purest form.

**Two concrete consequences of drawing the line here:**
1. `extension.psu.edu/fundamental-considerations-for-managing-fungal-diseases-of-grapevines` is
   **excluded by URL**. It is a 39.5 KB page embedding roughly 40 rows of `active ingredient (Trade
   Name)` × 5 diseases reproduced from a pest management guideline — 25 trade names, `Group 11
   fungicide` called out by name. Rates per acre, REI, and PHI are all zero on that page, so it fails
   tier C's *table* test while passing its *rate* test. It is excluded anyway: the table is the
   problem, not the rate column.
2. `virginiafruit.ento.vt.edu/SprayGuide/*` (`GrapeSprays.html`, `GrapePestEfficacy.html`) is
   **excluded by prefix**, same reason.

**Rejected alternative — "exclude anything mentioning FRAC."** Mechanically simpler and testable by
grep, but it excludes tier B, which is most of the eastern corpus we came for, and it would exclude
existing `uc-ipm` content that has been live and useful for weeks. It also aims the guard at a
keyword rather than at the failure mode.

**Rejected alternative — "take tier C and mark it low-trust."** There is no trust dimension in
retrieval. `tier` affects nothing at query time. A marked-down passage is still quoted verbatim per
Rule 3.

This decision becomes a **runbook §3 rule** and an invariant note (Unit 1) so later phases inherit it
rather than re-deriving it.

---

## 3. Key decisions

| # | Decision | Why | Alternative rejected |
|---|---|---|---|
| **D1** | The corpus/relational line is **tabular vs prose** (§2), enforced by a pure detector, not a prose rule | A prose constraint in a runbook is not a gate; §2's failure mode is mechanical and so is its guard | "Mentions FRAC" keyword exclusion — guts tier B |
| **D2** | The **conversational** boundary ships in PR 1, before any new source | SKB is the phase that adds the prose; the tool prompt currently advertises "compliance" and has no legality refusal | Deferring to S7a/S11 — those phases add the *relational* answer, they do not remove the corpus's claim to it |
| **D3** | The tier-C detector is **report-only for the 25 existing sources, enforcing for new ones** | Retroactively excluding existing `uc-ipm`/`mapa` content silently changes retrieval for live tenants; measuring it first is the honest order | Enforce everywhere immediately — an unmeasured retrieval change on a live corpus |
| **D4** | **NEWA is rejected as a `KnowledgeSource`** and becomes a model citation in S5a/S5b instead | ~1,559 chars of visible text per 236 KB page; the model documentation is a video; no robots.txt, no sitemap; `leaf wetness`/`threshold`/`degree day` all zero occurrences in the raw HTML | Crawl it anyway — spends requests for a blurb, and a source with 4 documents reds `findDarkSources` reasoning |
| **D5** | **ENTO-635-C is rejected**; `virginiafruit.ento.vt.edu` is taken in its place | ~22 of 23 pages are spray tables; `life cycle` and `scouting` occur zero times. Replacement is 82 HTML pages at 64 % text ratio, same institution | Take ENTO-635-C and strip the tables — nothing survives the strip |
| **D6** | PSU needs a **new `allowPaths` config primitive** (exact-path allowlist), not `allowPrefixes` | PSU articles live at flat root slugs (`/grape-disease-black-rot`) with no grape namespace, and `/powdery-mildew`, `/downy-mildew`, `/black-rot-and-frogeye-leaf-spot` are the *ornamental/tree-fruit* versions at identical URL shape. A prefix gate cannot separate them | A `CURATED_SPECS` entry — works, but discards PSU's real sitemap with `lastmod`, and puts the source outside the monthly sweep for no gain |
| **D7** | PSU's **undeclared edge block on ClaudeBot and GPTBot** is a recorded posture decision, not a blocker — subject to Russell's call | Our UA (`CellarhandKnowledgeBot`) is served 200; robots.txt, PSU's *declared* policy, permits us with `Crawl-delay: 10`; we do reference-use RAG with cite-back. But the site has affirmatively refused the two AI crawlers it recognizes, which is a new kind of signal for this corpus | Treat the edge block as consent-equivalent and proceed silently — the posture belongs in `KnowledgeSource.license` verbatim per the SKB gate |
| **D8** | **MSU stays dormant unless a local populate actually lands documents**, and the existing "if `verify:msu` ever reports live PASS, un-dormant" instruction is **narrowed** | Recon got a clean 200 from a residential IP with our UA on 2026-07-26, six days after 5/5 refusals — but `X-CDN: Imperva` and `visid_incap_*` cookies are still on every response, and DNS still resolves through `impervadns.net`. That is a WAF *permitting*, not a WAF *absent*. One 200 from one egress is not a licence for a scheduled crawl | Un-dormant on the current rule — a single pass re-enables a reputation-scored source, and a later challenge reds the monthly job via `findDarkSources` |
| **D9** | `autoCrawl` stays **false** for MSU permanently, even if it populates | The sweep runs on GitHub Actions runner IPs, the shape Imperva is most hostile to. Freshness for MSU is an operator action or nothing | Put it on the sweep once it works — reintroduces the exact failure the dormancy tripwires exist to prevent |
| **D10** | Capture **both** the `verify:kb-register` baseline and a `kb:snapshot` before the first source, and re-capture after each accepted source | `verify:knowledge-base` scores recall and its documented response to displacement is to *widen* `expectPaths`; only `kb-register` measures which publisher won each slot | Baseline once at the start — a two-source phase needs per-source attribution or the second source's displacement is unattributable |
| **D11** | The **scale-register tripwire is already crossed** and this phase measures it rather than assuming green | `docs/architecture/scale-register.md` lines 197–213 say "no HNSW/IVFFlat in v1", "fine until hundreds–low-thousands of chunks", tripwire "chunk counts crossing ~10k", status 🟢. The live corpus is ~23.5k chunks. The register is stale, and SKB adds chunks | Add HNSW speculatively in this phase — an index build on the live global corpus is not a knowledge-source change and deserves its own decision |
| **D12** | `ext.grapepathology.org` (Nita's Virginia grape disease updates) is **out of scope**, recorded as a fast-follow | Highest-value eastern weekly advisory found, but recon is incomplete (robots.txt unfetched) and its WordPress footer carries none of the VCE public-use grant. Not enough to register on | Fold it in — a source registered on unverified posture is how `virginia-fruit` killed the sweep |

---

## 4. Scope

**In:** the tabular/prose boundary rule as an invariant + a pure detector + a `verify:` guard · the
conversational legality refusal in the KB tool description + a golden eval · a pre-SKB
register/snapshot baseline · `allowPaths` as a config primitive · **Penn State Extension**
(`extension.psu.edu`, ~56 grape articles, tier 1) · **Virginia Tech grape IPM**
(`virginiafruit.ento.vt.edu`, ~82 pages, tier 1) · a gated MSU populate attempt and the narrowed
un-dormant rule · the NEWA and ENTO-635-C rejections recorded durably · staged rollout with measured
displacement at each step · scale-register correction · QA report.

**Out:** NEWA as a crawl source (D4, becomes an S5a/S5b citation) · ENTO-635-C (D5, route rates to
S2/S2b if ever wanted) · `ext.grapepathology.org` (D12, fast-follow) · an HNSW/IVFFlat index (D11,
measured here, decided separately) · any label rate/PHI/REI ingestion (runbook Later) · a licensing
ADR (**declined 2026-07-22 — do not re-propose**) · retroactive tier-C exclusion on existing sources
(D3, report-only) · the Cornell guide purchase (runbook §12 q5, user's call, unaffected).

---

## 5. Lane coordination and shared files

Run `gh pr list` before starting. SKB is `←∅` and touches no spray model code, so it is genuinely
parallel with any Wave-2 lane — with these exceptions:

| File | Contended with | Handling |
|---|---|---|
| `package.json` scripts block | every lane adding a `verify:*` | append-only, one contiguous block; land PR 1 early and rebase |
| `src/lib/assistant/tools/search-knowledge-base.ts` | S11 (assistant spray tools) | ⚠️ **serialize.** SKB edits the description text; S11 adds sibling tools. SKB lands first and S11 inherits the refusal rule rather than re-writing it |
| `test/evals/assistant-*.golden.ts` | S5a, S11 | new uniquely-named golden file only; do not edit a shared one |
| `docs/architecture/invariants/` | any lane adding an invariant | new file, unique name; run `verify:invariants` after |
| `docs/architecture/scale-register.md` | any lane appending a register entry | append; SKB *corrects an existing entry's status* (D11) — re-read immediately before editing |
| `SPRAY_ASSISTANT_RUNBOOK.md` §3 + §8 ledger | every lane | ⚠️ already clobbered once (S3a PR3 `11bcbf20`). Re-read immediately before editing; edit only the SKB row and the new §3 rule; never commit a wholesale copy |
| `NOW.md` | every concurrent lane | touch once, at ship |
| `src/lib/knowledge/config.ts` | SKB only | no other lane touches it |
| `test/knowledge-config.test.ts` | SKB only | but see the blast-radius note below |

⚠️ **No lane owns `docs/kb-register-baseline.json`, and that is a hazard.** It is a committed
measurement artifact. If any other session re-captures it mid-phase, SKB's before/after evidence is
destroyed silently. Capture it in PR 2 and state in the PR body that it is a measurement checkpoint.

**Order-sensitive test guards this phase does *not* trip:** `test/knowledge-config.test.ts` lines
187–194 assert `vt-enology-notes` is the only source declaring `sectionFilter`, and lines 424–430
assert `msu-grapes` is the only source declaring `linkedOnlyPrefixes`. Both are deliberate
blast-radius guards. Neither new source adopts either mechanism, so both arrays stay as-is —
**confirm this rather than editing them.**

---

## 6. Source dossiers

Everything here was observed by fetch on 2026-07-26 unless marked inferred. Statuses are per-UA
because they differ: **a 403 to ClaudeBot is not evidence about our crawler.** The single cleanest
proof of that from the recon: `newa.zendesk.com/hc/en-us/articles/360062425974` returned **403 to
ClaudeBot and 200 to `CellarhandKnowledgeBot`**. Any future "we are blocked" conclusion must be
reproduced with our own UA from a representative egress before it is believed.

### 6.1 Penn State Extension — `extension.psu.edu` ✅ take, with D6 + D7

| Fact | Observation |
|---|---|
| robots `*` | `Allow` with **`Crawl-delay: 10`**; disallows are Magento plumbing (`/admin/`, `/checkout/`, `/catalog/`) plus facet params (`?fruit=`, `?plant_diseases=`) and `/*.php$`. No ClaudeBot/GPTBot/CCBot rules, no Content-Signal, no `ai-train`, no `/.well-known/ai.txt` |
| ⚠️ edge policy | **403 to ClaudeBot and GPTBot; 200 to `CellarhandKnowledgeBot`, CCBot, Googlebot, curl, Chrome.** An undeclared named-AI-crawler denylist. → D7 |
| sitemap | `https://extension.psu.edu/sitemap/sitemap.xml` — 200, `text/xml`, 4.1 MB, flat `<urlset>`, **8,133 `<loc>`**, each with `lastmod`. Zero `.pdf`. ⚠️ `/sitemap.xml` and `/sitemap_index.xml` both return **200 with `content-type: image/png`** — soft-404s a naive check accepts |
| URL shape | Hub `/food-safety-and-quality/grape-and-wine-production/see-all-grape-and-wine-production/` (94 items, 25/page). Articles at **flat root slugs**: `/grape-disease-black-rot`, `/grape-disease-downy-mildew`, `/grape-sour-rot`, `/spotted-lanternfly-management-in-vineyards`. **No grape namespace** → D6 |
| ⚠️ namespace collision | `/powdery-mildew`, `/downy-mildew`, `/black-rot-and-frogeye-leaf-spot`, `/crown-gall-of-woody-plants` are the **ornamental/tree-fruit** versions, URL-indistinguishable from the grape ones. `/grape-disease-powdery-mildew` → **404** (PSU has no grape powdery article; accepted gap) |
| ⚠️ redirects | Sitemap lists articles **with** a trailing slash; each **301s** to the no-slash canonical. The final-URL path re-gate must admit both forms |
| content tier | `/grape-disease-*` and `/grape-sour-rot`: **tier A**, zero hits on rate/REI/PHI/FRAC/trade-name patterns across 4.6–15 k chars. `/home-fruit-gardens-table-6-5-efficacy-of-pesticides-for-grape-disease-control`: **tier C** (generic-AI efficacy matrix) → exclude. `/fundamental-considerations-for-managing-fungal-diseases-of-grapevines`: **tier C** (≈40-row trade-name × disease matrix, 25 trade names, `Group 11 fungicide`) → exclude |
| extraction | ~370 KB HTML for ~16 KB visible text (**~4 %**). **No `Last-Modified` header** → conditional GET is unavailable; freshness rides the sitemap `lastmod`. Pages carry a literal `Updated: April 2, 2026` → a real `publishedAt` source |
| WAF | none. Fastly + Magento Commerce Cloud, no challenge in 12+ fetches |
| licence | `© 2026 The Pennsylvania State University`; `psu.edu/copyright-information` grants **no blanket reuse** and routes permission per-page. **All rights reserved.** `extension.psu.edu/copyright-information` is itself a 404 |

### 6.2 Virginia Tech grape IPM — `virginiafruit.ento.vt.edu` ✅ take (replaces ENTO-635-C)

| Fact | Observation |
|---|---|
| robots `*` | disallows only Dreamweaver internals (`/_mm/`, `/_notes/`, `/_baks/`, `/MMWIP/`). **No crawl-delay, no AI-crawler rules** |
| host identity | distinct from `enology.fst.vt.edu` (our existing source) and from `pubs.ext.vt.edu`. `Server: AmazonS3`, static HTML, no WAF |
| content | hub `/grape-fruit-ipm.html` (stamped "Updated 18 May 2026") → **82 HTML pest/biology pages** (`GBM.html`, `SWD.html`, `SLF.html`, `ERMGrape.html`, `PDsharpshooters.html`, `erineum.html`…), organised direct/indirect pests, biological control, mating disruption |
| ⭐ extraction | `GBM.html`: 15.4 KB HTML → **9,845 visible chars (64 %)** of real prose. Best content ratio of any host examined |
| ⭐ dates | **per-page `Last-Modified`** (`GBM.html`: Tue, 03 Mar 2026; hub: Mon, 18 May 2026) → cheap conditional GET *and* a real `publishedAt`, which is exactly the seam that produced 735 body-scanned dates in plan 090 |
| sitemap | **none** (404) → discovery is a hub crawl, so `--follow` is mandatory |
| exclusions | `/SprayGuide/GrapeSprays.html` and `/SprayGuide/GrapePestEfficacy.html` are **tier C** → deny prefix `/SprayGuide/`. Five `.mp4` webinar recordings linked from the hub → filter |
| ⚠️ licence | **no statement at all** — no `©`, none of the VCE public-use boilerplate, no disclaimer. Rests on the absence of any statement, which is weaker than `pubs.ext.vt.edu`. Record verbatim |

### 6.3 NEWA — `newa.cornell.edu` ❌ reject (D4)

`robots.txt` → **404** (a 223 KB Gatsby HTML page, not `text/plain`). No sitemap. `/grape-diseases`
→ 200, **236,680 bytes of HTML carrying 1,559 characters of visible text** (~0.6 %). Raw-HTML scan:
`leaf wetness` 0, `infection period` 0, `threshold` 0, `degree day` 0, `relative humidity` 0. The
`More Info` / `References` / `Disclaimer` accordion bodies are client-rendered;
`/page-data/grape-diseases/page-data.json` is **193 bytes**. The documentation pointer resolves to a
Zendesk article that is a **video tutorial** rendering ~560 characters. Total crawlable NEWA grape
prose: order of 2 KB across 4 pages. Downy mildew is not even among NEWA's grape models (black rot,
Phomopsis, powdery only). Footer `© 1996-2026 Cornell Integrated Pest Management`, no reuse grant,
plus a liability disclaimer that is itself an argument against ingesting it as guidance.

→ NEWA's value is live model output, which is relational/computed, and the runbook already lists NEWA
integration as Later (line 147). Cite it in S5a/S5b as a model reference and validation oracle.

### 6.4 Virginia Tech pest guide — `pubs.ext.vt.edu` ENTO-635-C ❌ reject (D5)

robots is unusually permissive (`*` → `Allow: /`, `Crawl-delay: 2`; every named bot explicitly
allowed). No WAF. The licence is the **best of any host here** and an affirmative grant: *"Virginia
Cooperative Extension materials are available for public use, reprint, or citation without further
permission, provided the use includes credit to the author and to Virginia Cooperative Extension,
Virginia Tech, and Virginia State University."*

And it is still a reject. `ENTO-635-C.pdf` (2.3 MB, real text layer, no scanned images) is **23 pages
of which ~22 are tables**: Table 3.1 Disease and Insect Control (`Pest | Pesticide Name and
Formulation | Rate/Acre | Spray Timing`) pp. 2–9; Tables 3.2/3.3 relative effectiveness pp. 11–13;
Table 3.4 `Trade name | Manufacturer | Restricted Entry Interval | Days to Harvest` pp. 14–16;
Tables 3.5–3.7 herbicides pp. 17–23. Keyword counts: `FRAC` 27, `Restricted Entry` 13, `Days to
Harvest` 8, `PHI` 4 — against **`life cycle` 0 and `scouting` 0**. Prose is ~1 page (~4 %).

Two independent reasons beyond tier C: it is **revised annually**, so a snapshot silently goes stale
inside a citable corpus with no supersession mechanism; and it is the precise failure shape from plan
090 — a heading-poor, table-dominated PDF that starved the chunker
([[kb-pdf-chunking-breadcrumb-collapse]]). Note also `docs/spray_assistant/spray-data-sources-design.md`
lines 238–242: `extract/pdf.ts` emits no pipe tables and no headings, so a label-shaped PDF becomes
one segment with a garbage breadcrumb.

⚠️ **Do not inherit the existing "VT asserts copyright with no licence" risk note onto this host** —
that note was recorded for `enology.fst.vt.edu`. Different VT property, materially better posture.
The note stays accurate for the enology source and does not transfer.

### 6.5 MSU Extension — `canr.msu.edu` ⚠️ gated retry (D8, D9)

**The 2026-07-20 block did not reproduce.** `robots.txt` → 200, 90 bytes, complete:
`User-agent: *` / `Disallow: /search` / `Disallow: /application/`, then `AhrefsBot: Disallow: /`.
**Nothing blocks us by name; no crawl-delay; the WAF, not robots, is the entire obstacle.**
`/grapes/` → **200, 70,635 bytes of genuine content** (`<title>Grapes</title>`, live `/news/` article
links), with **zero** matches for `_Incapsula_Resource`, `Incapsula incident ID`, `Request
unsuccessful`, `Access Denied`, `captcha`, or `imperva` in the body.

**But Imperva is still in front of it, currently permitting rather than absent:** response headers
carry `X-CDN: Imperva`, `X-Iinfo`, and `visid_incap_*` / `incap_ses_*` / `nlbi_*` cookies, and
`www.canr.msu.edu` resolves through `9yj3p7b.ng.impervadns.net`. Inferred, and flagged as inferred:
the 5/5 refusals on 2026-07-20 versus a clean 200 on 2026-07-26 point at **reputation/rate scoring,
not a static UA denylist** — which means GitHub Actions runner ranges remain the riskiest shape, and
a 200 today licenses nothing tomorrow. The recon's own successes are weak evidence for our crawler
even at matched UA: different TLS/JA3 fingerprint, HTTP/1.1 via curl, no cookie-jar reuse,
single-request cadence — all things Imperva scores.

**Content shape is the best of any candidate for our constraint.** A July 2026 scouting report
(21,306 chars) scans to **rate/acre 0, trade names 0**, with `FRAC` 2, `restricted-entry` 1,
`preharvest interval` 1 — all as group-class advice plus an explicit "follow the label" delegation.
Pure tier B. This is precisely the cold-climate advisory voice the program wants.

No route around the WAF exists: `/news/rss` → 404 both UAs; no documented API, no bulk download; the
newsletter is email-delivery only with no archive endpoint. `archive.lib.msu.edu` and
`enviroweather.msu.edu` are different hosts, **inferred** to be outside the Imperva zone and
**untested** — first things to probe if the retry fails.

---

## 7. Implementation units

### PR 1 — the boundary guard (lands first, no source depends on it shipping late)

#### Unit 1: the tabular/prose boundary as an invariant + a pure detector

**Goal:** §2's tier-C rule becomes a mechanically enforced guard instead of a sentence in a runbook.
**Files:** `src/lib/knowledge/boundary/product-table-core.ts` (new) ·
`docs/architecture/invariants/KB-1-product-table-is-not-corpus.md` (new) ·
`test/knowledge-product-table.test.ts` (new) · `INVARIANTS.md`
**Approach:** a pure function over extracted text returning
`{ verdict: "prose" | "product-table", rowCount, signals }`. Detect a **product→fact mapping**, not a
keyword: repeated lines each pairing a product/AI token with a structured value in the same
positional pattern, plus column-header signals (`Rate/Acre`, `Restricted Entry`, `Days to Harvest`,
`Trade Name`, `Formulation`, `Relative Effectiveness`). Threshold on repeated-row count, never on
document size — the same reasoning as `crawl/challenge.ts` lines 14–17 refusing a size heuristic.
Fail **open** (verdict `prose` when unsure), consistent with `sections/classify-section.ts`, because a
false positive silently deletes good content. Follow the invariant-note frontmatter shape used by
`PEST-1-gap-is-not-a-clearance.md` (`severity` / `enforcedBy` / `verify` / `appliesTo`).
**Tests:** ENTO-635-C Table 3.1 and Table 3.4 excerpts → `product-table` · the PSU
`fundamental-considerations` matrix excerpt → `product-table` · the MSU scouting-report FRAC-group
paragraph → `prose` (the tier-B case that must not trip) · a PSU `/grape-disease-black-rot` excerpt →
`prose` · a UC IPM prose excerpt → `prose` · a two-row table below threshold → `prose` (fails open) ·
a table with headers but no rows → `prose`.
**Depends on:** none
**Verification:** `npx vitest run test/knowledge-product-table.test.ts` and
`npm run verify:invariants`

#### Unit 2: `verify:kb-boundary` — the guard, report-only for existing sources

**Goal:** a runnable gate that reports every corpus document the detector calls a product table, and
**fails** only for sources on the enforcing list.
**Files:** `scripts/verify-kb-boundary.ts` (new) · `package.json` (one `verify:*` line, append-only)
**Approach:** read active `knowledge_document` rows joined to their chunks, run the Unit-1 detector
over the indexed text, and print a per-source table of counts. **Enforcing set** = the sources this
phase adds; everything else is report-only per D3. Non-zero exit only on an enforcing-source hit. This
is the measurement that makes a later decision about existing sources possible — the number is the
deliverable, not the pass.
**Tests:** the pure detector is covered by Unit 1; this script's arithmetic (grouping, enforcing-set
filtering, exit code) gets a small unit test with injected rows rather than a DB.
**Depends on:** Unit 1
**Verification:** `npm run verify:kb-boundary` from the **main checkout** (needs `DATABASE_URL`;
worktrees have no `.env`)

#### Unit 3: the conversational refusal — KB tool routes legality to the relational engine

**Goal:** `search_knowledge_base` stops advertising "compliance" and starts refusing legality,
naming the relational path instead.
**Files:** `src/lib/assistant/tools/search-knowledge-base.ts` ·
`test/evals/assistant-kb-legality-refusal.golden.ts` (new) ·
`test/knowledge-tool-description.test.ts` (new)
**Approach:** mirror Rule 4's existing shape — the mandatory-handoff construction already proven for
`calc_so2`/`calc_sugar` — for legality. Amend the positive-scope line (currently lines 74–79) so
"compliance" no longer reads as *this tool answers whether you may apply a product*, and add a rule:
a question about whether a product is registered, permitted, rotates, or clears PHI/REI is answered
by the relational engine, never from a passage; if no such tool is available yet, say so and refuse
rather than answering from a passage. Keep the string edits surgical — S11 will extend this file, and
Rule 8's currency language is load-bearing and stays.
**Tests:** a **structural** test asserting the description contains the refusal rule and no longer
claims unqualified compliance scope — a string-level guard is what survives a later well-meaning
prompt edit. Plus a golden fleet case: *"can I legally spray Pristine on Block 4?"* must not be
answered from a KB passage, and must not fire a write. Register the golden in the existing
`assistant-tools.eval.test.ts` harness (⚠️ shared with S5a/S11 — serialize).
**Depends on:** none (parallel with Units 1–2)
**Verification:** `npx vitest run test/knowledge-tool-description.test.ts` and the golden via
`npx vitest run test/evals/assistant-tools.eval.test.ts`

### PR 2 — baseline, `allowPaths`, and Penn State

#### Unit 4: capture the pre-SKB measurement baseline

**Goal:** the before-evidence exists and is committed before a single new document is indexed.
**Files:** `docs/kb-register-baseline.json` (re-captured) · `docs/kb-eval/snapshot.json`
(re-captured) · `docs/spray_assistant/phases/SKB-baseline.md` (new)
**Approach:** run `npm run verify:kb-register -- --capture` and `npm run kb:snapshot` from the main
checkout, then write the narrative baseline: current document/chunk counts per source, the 20
`PRACTICAL_QUERIES` slot occupancy, and **a measured dense-query latency sample** for D11. Record the
open finding from the earlier baseline that has never been addressed — `scott-labs`, a tier-2 vendor
the config itself calls product-biased, holds 5 of 6 slots on *"my ferment is stuck at 5 Brix"* — so
this phase's measurements sit next to it rather than burying it.
**Depends on:** none
**Verification:** `npm run verify:kb-register` passes against its own fresh capture (zero drift), and
`SKB-baseline.md` states counts, latency, and `capturedAt`

#### Unit 5: `allowPaths` — an exact-path allowlist primitive

**Goal:** a source with a flat article namespace can be scoped safely, which `allowPrefixes` cannot
do (D6).
**Files:** `src/lib/knowledge/config.ts` (type + the field) ·
`src/lib/knowledge/crawl/crawler.ts` (admission) · `test/knowledge-crawl.test.ts`
**Approach:** add `allowPaths?: string[]` to `KnowledgeSourceConfig`, admitted **in addition to**
`allowPrefixes`, with `denyPrefixes` still checked first and still winning unconditionally. Two
properties that must hold and are easy to get wrong: it is **slash-tolerant in both directions**
(`/x` and `/x/` are the same entry, because PSU's sitemap lists slashed and 301s to unslashed), and it
is re-applied to the **final** URL after redirects, like the existing path gate. Config-only, like
`sitemapUrls`/`autoCrawl` — **do not persist it**, so no migration
(`scripts/seed-knowledge-sources.ts` lines 16–31 deliberately omits those fields).
**Tests:** exact path admitted · slashed variant of an exact path admitted · unslashed variant
admitted · a path not on the list refused · a deny prefix beats an `allowPaths` entry · a source with
`allowPaths` and empty `allowPrefixes` still fails closed on an unlisted path · admission survives a
redirect from slashed to unslashed.
**Depends on:** none
**Verification:** `npx vitest run test/knowledge-crawl.test.ts test/knowledge-config.test.ts`

#### Unit 6: Penn State Extension source

**Goal:** ~56 tier-A eastern grape disease/IPM articles in the corpus, scoped by exact path, dark on
arrival.
**Files:** `src/lib/knowledge/config.ts` (source entry + `TRUSTED_DOMAINS`) ·
`test/knowledge-config.test.ts` (source block) · `scripts/kb-eval-cases.ts` (retrieval cases) ·
`scripts/verify-knowledge-base.ts` (`NEW_SOURCE_EVAL` entry)
**Approach:** tier 1, `homeDomain: "extension.psu.edu"`, `sitemapUrls` pointing at the
robots-declared `/sitemap/sitemap.xml` (**never** `/sitemap_index.xml` — it 200s as `image/png`),
`autoCrawl: true` so it rides the monthly sweep, `defaultEnabled: **false**` per the staged rollout.
`allowPrefixes` scoped to the grape/wine hub; `allowPaths` carrying the reviewed flat-slug list;
`denyPrefixes` carrying the two tier-C URLs from §6.1 and the robots-disallowed Magento paths. The
slug list is **derived by a reviewable `--dry-run` pass over the sitemap, then hand-checked** against
the namespace collisions in §6.1 — `/powdery-mildew` and `/downy-mildew` are the ornamental pages and
must not appear. Record D7's posture verbatim in `license`: all-rights-reserved, per-page permission
process, robots permits our UA with `Crawl-delay: 10`, **and the undeclared edge 403 on
ClaudeBot/GPTBot**. That last clause is the part a future reader will need and the SKB gate asks for.
**Tests:** `homeDomain` and the `www.` form both in `TRUSTED_DOMAIN_SET` · `license` mentions the edge
block and the reserved rights · no bare `/` allow prefix · the two tier-C URLs refused · an ornamental
lookalike (`/powdery-mildew`) refused · a real grape article admitted slashed and unslashed · stays on
the monthly sweep (`autoCrawl !== false`) · `sitemapUrls` is exactly the robots-declared path ·
`defaultEnabled === false` on landing · confirm the `sectionFilter` and `linkedOnlyPrefixes`
blast-radius arrays (lines 187–194, 424–430) are **unchanged**.
**Depends on:** Unit 5 (needs `allowPaths`); measurement depends on Unit 4
**Verification:** `npx vitest run test/knowledge-config.test.ts`, then the staged rollout —
`npm run seed:knowledge-sources` → populate via the `knowledge-crawl-source` workflow or
`crawl:source extension-psu --follow` (**the monthly sweep cannot populate a new source**; a
registry-tail source sits behind every other frontier) → `npm run verify:kb-boundary` (PSU is on the
enforcing list; must be zero) → `npm run verify:kb-register` and record displacement → enable for
Demo only via a `KnowledgeSourceSubscription` row → re-measure → flip `defaultEnabled` only if
displacement is inside thresholds

### PR 3 — Virginia Tech grape IPM

#### Unit 7: `virginiafruit.ento.vt.edu` source

**Goal:** ~82 tier-A pest-biology pages at a 64 % text ratio, with real per-page dates.
**Files:** `src/lib/knowledge/config.ts` · `test/knowledge-config.test.ts` ·
`scripts/kb-eval-cases.ts` · `scripts/verify-knowledge-base.ts`
**Approach:** tier 1, `homeDomain: "virginiafruit.ento.vt.edu"`, **no sitemap exists** so discovery
is a hub crawl and `--follow` is mandatory. `seedRoots: ["…/grape-fruit-ipm.html"]`, `allowPrefixes`
scoped to the grape IPM area, `denyPrefixes` including **`/SprayGuide/`** (tier C, §6.2) and the
Dreamweaver internals robots already disallows. Filter the five `.mp4` webinar links. `autoCrawl:
true` — this host serves per-page `Last-Modified`, so conditional GET works and the monthly sweep is
genuinely useful here in a way it is not for PSU. `license` records the observed **absence of any
statement** verbatim; do not paraphrase it into a grant, and do not import the `pubs.ext.vt.edu`
public-use grant, which does not appear on this host.
**Tests:** both host forms trusted · `/SprayGuide/GrapeSprays.html` and
`/SprayGuide/GrapePestEfficacy.html` refused · a real pest page (`GBM.html`) admitted · `.mp4`
refused · no bare `/` allow prefix · `license` records the absence of a statement · `defaultEnabled
=== false` on landing · the two blast-radius arrays unchanged.
**Depends on:** Unit 1 (the detector must exist before this source is on the enforcing list)
**Verification:** same staged rollout as Unit 6, plus a spot-check that `publishedAt` resolves from
`Last-Modified` on ≥90 % of indexed documents — this source is the phase's best chance to prove the
date seam works from headers rather than a body scan

#### Unit 8: retrieval evidence for both new sources

**Goal:** prove the sources actually answer eastern questions, and that they did not displace the
incumbents.
**Files:** `scripts/kb-eval-cases.ts` · `docs/spray_assistant/phases/SKB-measurements.md` (new) ·
`docs/kb-register-baseline.json` (re-captured after acceptance) · `docs/kb-eval/snapshot.json`
**Approach:** add `RETRIEVAL_CASES` that only these sources can satisfy — eastern black rot
epidemiology, Phomopsis cane and leaf spot, grape berry moth generations, spotted lanternfly in
vineyards, sour rot conditions. ⚠️ Standing instruction in `scripts/kb-eval-cases.ts` lines 131–135:
if a new source displaces an existing case's expected doc, **widen `expectPaths`, do not narrow the
source** — but D10 means the widening is recorded as displacement first, not applied silently. Write
`SKB-measurements.md` with per-source before/after slot occupancy, the `verify:kb-boundary` count for
every source (including the report-only incumbents), the chunk-count delta, and a re-measured dense
latency for D11.
**Depends on:** Units 6, 7
**Verification:** `npm run verify:knowledge-base` green with the new cases, `npm run verify:kb-register`
inside thresholds against the Unit-4 baseline, `npm run verify:kb-subscriptions` green

### PR 4 — the MSU decision and the durable rejections

#### Unit 9: MSU gated populate attempt + narrowed un-dormant rule

**Goal:** either MSU has content and is honestly enabled, or it stays dormant with a second
measurement and a rule that cannot be tripped by one lucky fetch.
**Files:** `scripts/verify-msu.ts` (the un-dormant instruction) · `src/lib/knowledge/config.ts`
(the MSU comment block, and `defaultEnabled` **only if** the populate lands) ·
`test/knowledge-config.test.ts` (the dormancy tripwires, only if flipped) ·
`docs/spray_assistant/phases/SKB-msu-decision.md` (new)
**Approach:** attempt `crawl:source msu-grapes --follow` **from the operator's local egress, never
CI** (D9), serial, ≥10 s spacing, cookie jar preserved, treating a single challenge as a stop
condition rather than something to retry through. Then the honest branch:
- **≥30 documents land, zero `skippedChallenge`** → flip `defaultEnabled` to `true`, keep `autoCrawl:
  false` **permanently** (D9), amend the tripwire test's `defaultEnabled` assertion with the evidence
  in the commit message, run the full staged measurement like any other source.
- **Challenged or starved** → nothing changes in config; record the second data point.

Either way, **narrow the existing instruction.** `verify:msu` today says a live PASS means
un-dormant and re-seed. Recon shows that rule can be satisfied by one request from one residential
IP while Imperva is still terminating every connection and scoring reputation. Replace it with:
un-dormanting requires **N≥3 consecutive passes across ≥2 distinct egresses, at least one of which is
a CI runner** — because the sweep, if it ever ran, would run from CI. Keep the two-arm
`[config]`/`[live]` reporting; the change is to what a live pass *authorises*, not to what it
measures. Record the content-shape finding too: MSU is pure tier B (rate/acre 0, trade names 0), the
best fit of any candidate, which is why this is worth a gated retry rather than a retirement.
**Tests:** the pure `[config]` arm of `verify:msu` still passes unchanged in the not-flipped branch ·
if flipped, the `defaultEnabled` tripwire is updated deliberately and `partitionSeededSources` still
routes `msu-grapes` to `curated`, never `auto` (lines 496–502).
**Depends on:** Unit 1 (MSU joins the enforcing list if it populates)
**Verification:** `npm run verify:msu` reports its two arms with the new authorisation rule stated;
`npx vitest run test/knowledge-config.test.ts`

#### Unit 10: record the rejections, correct the registers, close the ledger

**Goal:** NEWA and ENTO-635-C are settled decisions with evidence, not open candidates someone
re-proposes in three months — and the scale register stops claiming green on a crossed tripwire.
**Files:** `docs/spray_assistant/SPRAY_ASSISTANT_RUNBOOK.md` (§3 new rule, §8 SKB row, §9 SKB scope,
§10 risk row) · `docs/spray_assistant/spray-data-sources-design.md` §4 ·
`docs/architecture/scale-register.md` (the plan-079 entry's status + tripwire) ·
`docs/spray_assistant/phases/SKB-report.md` (new) · `docs/spray_assistant/qa/SKB-qa-report.md` (new) ·
`NOW.md` (once, at ship)
**Approach:** the §2 tabular-vs-prose rule becomes a numbered runbook §3 rule so S5a, S5b, S7, and
S11 inherit it. The rejections go into §9's SKB scope with their measured evidence, so the next
reader sees *why* rather than re-running the recon. NEWA moves from "candidate source" to "S5a/S5b
model citation." **D11:** correct the plan-079 scale-register entry — its tripwire ("chunk counts
crossing ~10k") is crossed at ~23.5k, so the status is not 🟢; record the measured latency from Units
4 and 8 and either downgrade the status with the number, or state the number that would justify HNSW.
Do not add the index here. ⚠️ Re-read the runbook immediately before editing and edit only the SKB
row — it has already been clobbered once by a stale-worktree copy (S3a PR3 `11bcbf20`).
**Depends on:** Units 8, 9
**Verification:** `npm run verify:invariants`, `npm run verify:tripwires`, and the runbook §8 SKB row
links plan, council, PRs, QA report, and phase report

---

## 8. Acceptance gate

Mapping the runbook's SKB gate (lines 879–882) to units and evidence:

| Gate line | Unit | Evidence |
|---|---|---|
| Baseline captured **before** adding any source | 4 | `SKB-baseline.md` + committed `kb-register-baseline.json` with `capturedAt` preceding every source commit |
| Baseline **re-captured after** | 8 | `SKB-measurements.md` with per-source before/after slot occupancy |
| Each new source's licence posture in `KnowledgeSource.license` | 6, 7 | Config `license` strings + tests asserting their content, incl. PSU's undeclared edge block and VT's absence of a statement |
| Staged rollout: `defaultEnabled:false` → crawl → enable for Demo → measure → flip | 6, 7 | Landing commit shows `false`; the flip is a separate commit citing the measured displacement |
| `verify:knowledge-base` green | 8 | New eastern retrieval cases pass; any widened `expectPaths` recorded as displacement first |
| `verify:kb-register` green | 8 | Inside 0.5 per-question / 0.25 aggregate thresholds against the Unit-4 baseline |
| `verify:kb-subscriptions` green | 8 | Unchanged, source-agnostic |
| QA report | 10 | `qa/SKB-qa-report.md` |

**Added by this plan:**
- `npm run verify:kb-boundary` — zero product-table documents for every enforcing source; the
  report-only count for the 25 incumbents recorded as a number, not a pass
- `npm run verify:invariants` green with the new `KB-1` note
- The legality-refusal golden green, and the structural description test green
- `npm run verify:msu` reports both arms under the narrowed authorisation rule
- **The program-wide safety cases from QA-PROTOCOL §4 run in full**, not just SKB's own — SAFE-1
  (decline to recommend from a trade name alone), SAFE-3/4 (gap vs no-code-exists), SAFE-14
  (`epa-pesticide` disabled → the assistant declines rather than answering from memory). SAFE-14 is
  the case this phase most plausibly regresses
- Standing sweep: `npx prisma generate && npx tsc --noEmit`, full `npx vitest run`,
  `npm run verify:naming` before **and** after, `npm run verify:ai-native`,
  `npm run verify:tenant-isolation`

⚠️ **Two-tier gating.** Branch-local and parallelisable: `tsc`, the pure unit tests, the goldens.
Serialised from the **main checkout** (needs `.env` + the generated Prisma client): every DB-backed
`verify:*`, the crawls, and browser QA. `npx prisma generate` chained into the **same command** as
the run — a sibling lane clobbers the shared generated client mid-session (it happened four times
during S4).

---

## 9. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| **A tier-C table reaches the corpus and is quoted as authoritative against a relational `GAP`** | HIGH | §2's rule + Unit 1's detector + `verify:kb-boundary` enforcing on new sources + `KB-1` invariant. This is rule §3.6 arriving through the wrong engine |
| **The assistant answers a legality question from a passage** | HIGH | Unit 3's refusal rule + structural description test + golden. Exists today and is not created by this phase, but this phase widens its surface |
| **PSU's undeclared AI-crawler block is a consent signal we overrode** | MED | D7 is an explicit user decision recorded verbatim in `license`; robots (the declared policy) permits our UA; `reset:knowledge-source` makes a takedown a minutes-long job |
| **The flat-namespace slug list admits an ornamental lookalike** | MED | `allowPaths` is exact-match, the list is hand-reviewed against §6.1's collisions, and a negative test asserts `/powdery-mildew` is refused |
| **A soft-404 sitemap (200 + `image/png`) is accepted as a sitemap** | MED | Config points only at the robots-declared path, and a test asserts it. Same class as `fetchDocument`-throw-means-removed — a 200 that is not what it claims |
| **Displacement measured per-phase instead of per-source** | MED | D10: re-capture between sources so the second source's effect is attributable |
| **Another session re-captures `kb-register-baseline.json` mid-phase** | MED | §5 names it; the PR body flags it as a measurement checkpoint |
| **MSU is re-enabled on one lucky 200 and later challenges, redding the monthly job** | MED | D8's narrowed rule (N≥3 across ≥2 egresses incl. CI) + D9 keeping `autoCrawl:false` permanently, so `findDarkSources` never sees it |
| **PSU has no `Last-Modified`, so freshness rides sitemap `lastmod` only** | LOW | Documented; the `Updated: <date>` in-page string gives `publishedAt`; PSU articles are slow-changing |
| **Adding ~150 docs pushes dense retrieval past acceptable latency** | LOW | D11 measures it in Units 4 and 8; the tripwire is already crossed, so this phase's job is to produce the number, not to assume it |
| **`ENTO-635-C` gets re-proposed later because its licence is the best** | LOW | Unit 10 records the rejection with the page-count evidence in the runbook, where the next reader looks |

---

## 10. Confidence

| Section | Confidence | Notes |
|---|---|---|
| Problem frame | HIGH | The eastern gap is measurable: one eastern publisher in 25 sources |
| The §2 boundary decision | **MEDIUM** | The tabular/prose line is defensible and mechanically testable, but it is a *narrowing* of the runbook's literal "FRAC codes are relational." Council should attack it. If council rejects the narrowing, tier B goes out and the phase's value drops sharply — that is the single highest-leverage thing to review |
| Source selection | HIGH | Every disposition rests on a fetch and a count, not an impression. Two named candidates rejected on evidence |
| PSU crawl mechanics | MEDIUM | `allowPaths` is new machinery, and the slug list is hand-curated so it will need one review pass. The soft-404 and 301 traps are known and tested |
| Unit 3 (the refusal) | **MEDIUM** | Editing a shipped tool description is a behavioural change to a live assistant. The structural test protects the string; the golden protects the behaviour; neither fully protects against a model that ignores both. S11 inherits and should re-verify |
| MSU | **MEDIUM** | The populate attempt genuinely may fail, and the plan branches honestly on that. The narrowed authorisation rule is the durable deliverable either way |
| Test strategy | HIGH | The existing registry-integrity suite already encodes most of what a new source must satisfy; this phase adds source-specific negatives |
| D11 / scale | MEDIUM | The tripwire is crossed and the register says 🟢. Correcting it is in scope; fixing it (HNSW) is not, and that split should be reviewed |

---

## 11. Open items for `/council`

1. **Is the tabular-vs-prose line right?** It narrows the runbook's literal wording. Specifically:
   should MSU's *"FRAC groups 3 and 11 remain key options"* prose be in a corpus whose sibling engine
   answers resistance-group membership exactly?
2. **Should `verify:kb-boundary` enforce on `uc-ipm` too?** D3 says report-only first. If the measured
   count is small, is there a reason not to enforce everywhere in this phase?
3. **Does Unit 3 belong in SKB or S7a?** SKB adds the prose that makes the gap dangerous; S7a builds
   the tool the refusal should route *to*. Refusing before a destination exists means refusing without
   an alternative — is that the right sequence, or does the refusal land half in each phase?
4. **PSU's undeclared edge block** — D7 is Russell's call, but council should say whether an
   undeclared block should be treated as equivalent to a robots disallow for this corpus generally,
   since it is the first time this corpus has met one.
5. **`ext.grapepathology.org`** — fast-follow, or fold into this phase given it is the same
   institution as Unit 7 and the highest-value eastern weekly advisory found?

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET — run `/autoplan` for full review pipeline, or individual reviews above.
Program convention additionally requires `/council` (Gemini + Codex) before build, written to
`phases/SKB-council-feedback.md`.
