---
title: Winemaking Knowledge Base (RAG) — cited assistant winemaker over a global crawled corpus with per-tenant source subscriptions
type: feat
status: draft
date: 2026-07-18
branch: claude/winemaking-knowledge-base-rag
depth: deep
units: 12
council_review: incorporated (Codex gpt-5.4 + Gemini gemini-3.1-pro-preview, 2026-07-18) — see council-feedback.md
---

## Overview

Give the assistant a real winemaking/viticulture brain: a curated, cited knowledge base built from
trusted extension + peer-reviewed sources (AWRI first, Wine Australia second), retrieved at question
time via **hybrid search (pgvector dense + Postgres full-text)** and reasoned over by Claude with
clickable source citations. The corpus is crawled and maintained **once, globally** (dedup, one re-crawl
loop); each winery **subscribes** to the sources it wants active in its own assistant. No local model, no
fine-tuning — retrieval augments the existing assistant tool loop, and it **defers to the existing
calculators** (`calc_so2`, `calc_sugar`) for any math.

## Problem Frame

Today the assistant is a generalist: Claude + Tavily web search. It has no grounded, authoritative,
citable winemaking knowledge, and a winemaker can't trust an uncited answer about SO₂ targets or downy
mildew fungicides. The job to be done: **"answer my technical winemaking question with the authority of
AWRI/Wine Australia, show me the source, surface disagreement when experts disagree, and never hand me a
wrong number."** Doing nothing leaves the assistant a plausible-but-unciteable generalist. The moat is
curation + provenance + freshness, not a model.

Product pressure test: two risks. (1) Scope creep into "crawl the whole world" — mitigated by a curated
allowlist + a vertical slice on AWRI first. (2) **Confidently wrong numbers** — a winery acts on a
mis-parsed dose/threshold and ruins wine. This is the dominant real-world harm and it reshaped the plan:
hybrid retrieval so exact numbers/acronyms rank, tables preserved as markdown, an eval that checks the
*answer* not just retrieval, and a numeric-verbatim safety guardrail.

## Requirements

- MUST: RAG over pgvector on the existing Neon Postgres. No local model, no fine-tuning.
- MUST: **Hybrid retrieval** — dense (pgvector cosine) + lexical (Postgres `tsvector`) fused by Reciprocal
  Rank Fusion. Pure dense search under-ranks exact numbers/acronyms (`<2.0 NTU`, `group-11`, `70°C`). [C4]
- MUST: Corpus **content is global** (crawled/maintained once, deduped). Each **tenant subscribes** to
  which sources are active; retrieval filters to that tenant's enabled sources; empty set → no results
  (fail-closed, never "all"). [C2/SHOULD]
- MUST: **Document-identity model split** — byte/blob dedup ≠ logical document ≠ URL observation. [C3]
- MUST: Crawl from a human-curated trusted-domain allowlist (AWRI + Wine Australia v1). Sitemap-first;
  honor per-domain `robots.txt`; per-domain rate limiting; **SSRF controls** (redirect-host allowlist,
  private-IP rejection, size/timeout/page-count caps). [C8]
- MUST: **Allowlist-gated cross-domain link following**; non-allowlisted discovered domains → candidate
  queue, never crawled.
- MUST: HTML + PDF, decided by **HTTP `Content-Type` header** (+ magic-byte fallback), not URL extension.
  Tables extracted to **markdown** to preserve row/column alignment; oversize tables summary-indexed. [C-Gemini3]
- MUST: Every chunk carries provenance — source, publisher, tier, license, `retrievedAt`,
  published/`lastmod` date, `contentHash`, `status`.
- MUST: Chunk **writes/reads use raw SQL** (`$executeRaw`/`$queryRaw`) with a validated `::vector` literal
  — the `Unsupported("vector(1024)")` column is not writable through the typed client. [C1]
- MUST: `search_knowledge_base` read tool; cited answers via clickable internal redirect links
  (`/kb/source/<id>`) **with a per-request tenant-subscription recheck** and graceful **tombstone**
  rendering for withdrawn docs. Defers math to existing calculators. [C2/C6]
- MUST: **Numeric safety guardrail** — dose/temp/limit answers quote the source's numeric phrase verbatim
  and tell the winemaker to verify against the cited document. [C6]
- MUST: **Tool-chaining** for "target + math" questions — search KB for the threshold, then pass it to the
  calculator; never let the KB compute the dose. [C9]
- MUST: Voyage `voyage-4` embeddings, **1024-dim (committed for v1)**; model+dim stored per row; a model
  change is a documented re-embed backfill, not a live "swap." [C1/DQ4]
- MUST: Eval harness scoring retrieval **and answer faithfulness** (numbers match source verbatim),
  **negative-rejection** (out-of-corpus → refuse), and a **hybrid-routing** case (KB threshold → calc). [C5/C9]
- MUST: Scheduled re-crawler as a GH Actions loop with a **single-flight `concurrency:` group**; opens a
  PR/issue, never auto-merges; change-detected re-embed via **versioned chunk sets + atomic active-flip**
  (no destructive delete/rebuild race); removed pages **tombstoned**, not deleted. [C7]
- SHOULD: **Source-diverse retrieval via MMR** (relevance × diversity), not hard publisher caps;
  conflict-surfacing with attribution + publish dates. [C-Gemini5]
- SHOULD: Inject the tenant's **active subscriptions + source dates** into the tool context so the model
  doesn't claim "nothing in Wine Australia" when unsubscribed and can weight recency. [DQ7]
- SHOULD: Light **query expansion** — fold acronym/unit synonyms (KMBS↔potassium metabisulfite, ppm↔mg/L)
  into the lexical arm of hybrid search. [DQ8]
- SHOULD: Minimal per-tenant source-subscription settings surface.
- NICE: HNSW ANN index (only once the corpus exceeds a few-thousand chunks; never index an empty table).
- NICE: Dedicated "Sources" card component (internal redirect links ship first).

## Scope Boundaries

**In scope:** AWRI + Wine Australia crawling, global corpus with document-identity split, per-tenant
subscriptions, hybrid retrieval + MMR diversity + conflict-surfacing, cited answers with tenant-checked
redirect + tombstone, numeric guardrail, hardened eval, re-crawler loop. Vertical slice proven on AWRI.

**Out of scope (this plan):**
- Per-winery **private** document upload (tenant-scoped *content*). The subscription design leaves the door
  open; not built now.
- New calculator tools (app already has `calc_so2`/`calc_sugar`). KB defers, never recomputes.
- Multilingual sources (all v1 sources English).
- Automated source **discovery** beyond logging candidates for human promotion.
- Precomputed "claims" layer for proactive conflict detection (retrieval-time only).
- A separate narrower maintenance DB role for the CI crawler — owner (`runAsSystem`) accepted for v1
  because the loop opens a PR (no silent prod write); noted in the security register as a follow-up. [DQ9]
- Fine-tuning / local models (Ollama) — explicitly rejected; see ADR.

## Research Summary

### Codebase Patterns
- **Assistant tool loop:** `src/app/api/assistant/route.ts` (NDJSON) → `src/lib/assistant/run.ts`
  `runAssistant()` (MODEL `claude-opus-4-8`, `MAX_TURNS 8`). Registry `src/lib/assistant/registry.ts`;
  `AssistantTool = { name, description, kind, inputSchema (raw JSON Schema), run(ctx,input) }`;
  `ToolContext = { user, lastUserMessage }` — no prisma/tenantId/conversationId; tenancy from
  `ctx.user.activeOrganizationId` (`calc-shared.ts:122`). Read tools return a plain result.
- **Calculators (defer to these):** `calc_so2` → `src/lib/winemaking-calc/so2.ts`; DAP via `calc_sugar`
  `yan-dose` (`src/lib/winemaking-calc/sugar.ts`, `YAN_PRODUCTS.DAP = 0.2127`); inventory `query_materials`.
- **Citations:** `Markdown.tsx` renders `[label](/internal/path)` clickable; `isSafeInternalPath`
  (`assistant-events.ts:33`) rejects hrefs containing `:` → external URLs are dead text ⇒ internal
  `/kb/source/<id>` redirect route.
- **Full-text precedent (both the vector column mechanic AND the lexical arm of hybrid):** `search_vector`
  is `Unsupported("tsvector")?` (`schema.prisma:1079`) + a hand-written raw-SQL generated column + GIN
  index (`20260625121704_add_assistant_conversations/migration.sql:36`), queried via
  `websearch_to_tsquery + ts_rank`. A `Unsupported("vector(1024)")` column follows the same raw-SQL path.
- **Global vs tenant:** `FxRate` global (no tenantId/RLS, in `GLOBAL_MODELS` `models.ts:17-26`, mirrored in
  `verify-tenant-isolation.ts`, verified by plain-`prisma` `verify-fx.ts`). Subscription table = full
  Phase-12 checklist (`AGENTS.md:53-70`). `runAsSystem` (owner/BYPASSRLS, `system.ts:23`) for global
  writes; `runAsTenant` (`context.ts:39`) sets ALS+GUC; `prismaBase` on RLS tables → 0 rows without a GUC.
- **Automation loop:** `.github/workflows/brain-refresh.yml` (schedule + `workflow_dispatch`, marker
  watermark, opens a PR "do NOT merge"); `docs/AUTOMATION.md` golden rule. Only `ANTHROPIC_API_KEY`
  required; optional `DATABASE_URL_UNPOOLED` for Neon.
- **Eval pattern:** `scripts/verify-*.ts` via `tsx --conditions=react-server --env-file=.env`;
  `verify-fx.ts` structure (numbered `assert`s, `exit(1)`). Opt-in LLM-in-the-loop eval exists behind
  `ASSISTANT_EVAL=1` (`test/evals/assistant-tools.eval.test.ts`) — the base for the faithfulness judge.
- **Ingest precedent (reuse):** `src/lib/ingest/` + private Vercel Blob (`putPrivateDocument`) for raw
  snapshots; extraction brain is Anthropic. `OPENAI_API_KEY` present; **`VOYAGE_API_KEY` added + live-tested
  (voyage-4 → 1024-dim confirmed).**

### Prior Learnings
- **Windows/Neon migration gotcha:** hand-write SQL, `migrate diff --script | grep -v 'search_vector'`,
  `migrate deploy` (not `migrate dev`); isolate `ALTER TYPE`; stop dev server before `generate`.
- **Build in the MAIN checkout, not the worktree** (no `.env`/deps in worktree). Run migrations, crawler,
  `verify:*` there.
- **`prismaBase` on RLS tables → 0 rows** without a tenant GUC — use `runAsSystem` for global writes.
- No prior RAG/pgvector/crawler learnings — greenfield; write an ADR.

### External Research
- pgvector on Neon: `CREATE EXTENSION IF NOT EXISTS vector;` before any `vector(N)` table. No native Prisma
  type (6.13) → `Unsupported("vector(1024)")` + raw SQL. Cosine `<=>`, `ORDER BY embedding <=> $1::vector`.
  Bind a **validated pgvector text literal** `"[…]"`, not a JS array. HNSW only past ~thousands of rows.
- Embeddings: Voyage `voyage-4`, 1024-dim, `input_type="document"|"query"`. Dimension fixed at DDL.
- Chunking: heading/section-aware, ~512 tokens / ~15% overlap, tables kept whole **as markdown**, section
  breadcrumb prepended.
- Extraction: Defuddle (HTML→markdown) + unpdf (serverless PDF.js). Content-type-sniffed.
- Crawling: `sitemapper` + `robots-parser` + `p-queue` per-domain + manual `ETag`/`Last-Modified`
  conditional GET; sitemap `lastmod` first-pass filter.
- Hybrid/RRF: fuse dense + lexical ranked lists by `sum(1/(k+rank))` (k≈60); standard, cheap, robust for
  mixed semantic/exact queries. MMR for diversity: `argmax λ·sim(q,d) − (1−λ)·max sim(d,dⱼ)`.

## Key Decisions

| Decision | Choice | Alternatives | Rationale |
|----------|--------|--------------|-----------|
| Model strategy | RAG; Claude reasons | Fine-tune / Ollama | Fine-tuning installs style not facts; local models regress reasoning (ADR) |
| Retrieval | **Hybrid** dense pgvector + lexical tsvector, RRF fusion | Pure dense | Dense under-ranks exact numbers/acronyms in the eval set [C4] |
| Corpus scope | Global content + per-tenant source subscriptions | Pure global / pure tenant | Crawl once; each winery curates its shelf; room for private docs later |
| Document identity | **Split:** `KnowledgeBlob`(contentHash) / `KnowledgeDocument`(logical, source+canonicalUrl) / `KnowledgeUrlObservation`(alias) | One row per URL w/ byte-dedup | Byte-dedup on a single row destroys provenance + tombstoning + subscription scoping [C3] |
| Content tables tenancy | GLOBAL (no tenantId/RLS), in `GLOBAL_MODELS`, mirrored in `verify-tenant-isolation` | Tenant-scoped | Mirrors `FxRate`; identical public docs; dedup |
| Subscription tenancy | Tenant-scoped, full Phase-12 RLS | Global flags | Per-winery private config |
| Corpus access control | App-code filter + **per-request recheck on the citation route** | Rely on tool output only | No RLS on corpus → a guessable id is an authz bypass without the recheck [C2] |
| Embedding | Voyage `voyage-4`, **1024-dim committed v1**; model+dim per row; model change = re-embed backfill | "Swap freely" | `vector(1024)` hard-locks the dim; swap ≠ free [C1/DQ4] |
| Vector I/O | `Unsupported("vector(1024)")` + `$executeRaw` write / `$queryRaw` read; validated `::vector` literal | Typed Prisma client | Unsupported column isn't writable/selectable typed [C1] |
| Chunk revisioning | Versioned chunk sets per document + **atomic active-revision flip**; deterministic chunk id `hash(docId+ordinal+text)` | delete+rebuild | Avoids concurrent re-crawl race + orphaned cited-chunk logs [C7] |
| Tables | Extract to markdown; oversize (>512 tok) → embed a summary, inject full markdown table | "keep whole" blindly | Broken column alignment = wrong limit for wrong additive (safety) [Gemini3] |
| Conflict-surfacing | **MMR** diversity + attribution + publish dates | Hard publisher caps | Hard caps inject irrelevant noise to hit a diversity quota [Gemini5] |
| Numeric answers | Quote source numeric phrase **verbatim** + verify-against-source instruction | Free paraphrase | Extraction errors (dropped decimals) are the real harm [C6] |
| Citations | Internal `/kb/source/<id>` redirect, tenant-rechecked, tombstone-aware | Raw external links / new card | Renderer-safe, click-tracked, provenance-preserving [C2/Gemini7] |
| Crawl trust | Human allowlist; cross-domain following only into allowlisted; SSRF controls; candidates queued | Open crawl | Curation is the moat; first privileged fetcher runs with owner creds in CI [C8] |
| Content-type detect | HTTP `Content-Type` (+ `%PDF-` fallback) | URL extension | Wine Australia PDFs are `getmedia/<guid>?ext=.pdf` |
| Re-crawl runtime | GH Actions loop w/ single-flight `concurrency:` group | Uncontrolled schedule | Overlapping owner jobs magnify the rebuild race [C7] |
| Retrieved content | Untrusted data; escaped + length-limited before render | Trust it | Instruction-source boundary + `assistant-overclaim-write-guard` precedent |

## Implementation Units

> **Vertical slice (prove first):** Units 1 → 3 → 4 → 5 → 6 → 7 → 8 → 10 on **AWRI only** (a bounded page
> sample), end-to-end: crawl → extract → chunk/embed → **hybrid** retrieve → cited tool answer →
> tenant-checked citation → pass the hardened eval. Only then fan out to Wine Australia and add Units 9,
> 11, 12. Do not build all sources before the loop is green.

### Unit 1: Schema foundation — pgvector + tsvector, document-identity split, subscriptions, registries, grants + ADR

**Goal:** Data model with the identity split, both retrieval columns (dense + lexical), idempotency
constraints, explicit grants, and the architecture decision recorded.
**Files:** `prisma/schema.prisma`; `prisma/migrations/<ts>_knowledge_base_schema/migration.sql` (globals +
`CREATE EXTENSION vector` **before** any vector table + `Unsupported("vector(1024)")` + generated
`Unsupported("tsvector")` column + GIN/btree indexes + explicit `GRANT … TO app_rls`) and
`<ts>_knowledge_base_rls/migration.sql` (subscription RLS + DO $$ guard); `src/lib/tenant/models.ts`;
`scripts/verify-tenant-isolation.ts`; `docs/architecture/decisions/0007-knowledge-base-rag-global-corpus-tenant-subscriptions.md`;
`docs/architecture/scale-register.md` + `docs/architecture/security-register.md` entries.
**Approach:** GLOBAL models (no tenantId/RLS; add all to `GLOBAL_MODELS` + mirror): `KnowledgeSource`
(key, publisher, homeDomain, tier, license, seedRoots[], allowPrefixes[], denyPrefixes[], crawlCadence,
defaultEnabled, active; unique `key`, unique `homeDomain`); `TrustedDomain` (unique `domain`, sourceKey?);
`CandidateSource` (unique `domain`, discoveredFromUrl, firstSeenAt, timesSeen, status); **`KnowledgeBlob`**
(unique `contentHash`, byteSize, contentType, blobUrl, firstSeenAt) — byte-level dedup; **`KnowledgeDocument`**
(logical: sourceId, canonicalUrl, unique `(sourceId, canonicalUrl)`, blobId→KnowledgeBlob, publisher, tier,
license, sitemapLastmod?, publishedAt?, firstSeenAt, lastSeenAt, lastVerifiedAt, retrievedAt, etag?,
lastModifiedHttp?, status active|withdrawn, activeRevision Int, withdrawnAt?); **`KnowledgeUrlObservation`**
(documentId, url, unique `url`, firstSeenAt, lastSeenAt) — aliases/mirrors; **`KnowledgeChunk`** (id =
deterministic `hash(documentId+ordinal+text)`, documentId, revision Int, ordinal, sectionPath, text,
tokenCount, `embedding Unsupported("vector(1024)")?`, `searchVector Unsupported("tsvector")?` generated
from `text`, embeddingModel, embeddingDim, embeddedAt; unique `(documentId, revision, ordinal)`; index
`(documentId, revision)`). Retrieval reads only `revision = document.activeRevision`. TENANT-scoped (full
checklist, RLS, `@@unique([tenantId, sourceId])`): `KnowledgeSourceSubscription`. Windows migration
workflow; `CREATE EXTENSION` first; **no ANN index** (add HNSW later). Indexes: `KnowledgeDocument(sourceId,
status)`, GIN on `KnowledgeChunk.searchVector`. Explicit `GRANT SELECT` (+ INSERT/UPDATE where the app
writes) `TO app_rls` on every global table (they have no RLS — grants are the only gate). ADR records:
no-local-model, global-content/per-tenant-subscription, identity split, hybrid retrieval, 1024-dim commit.
**Tests:** `test/tenant-isolation.test.ts` — subscription RLS-isolated (A can't read B); global corpus
readable cross-tenant; `verify:invariants` + `verify:tenant-isolation` green (globals mirrored).
**Depends on:** none
**Execution note:** characterization-first — write the RLS isolation assertion, watch it fail, then migrate.
**Patterns to follow:** `20260625121704_add_assistant_conversations/migration.sql:36`, `20260715120100_inbox_rls`,
`models.ts:17-26`, `verify-fx.ts`.
**Verification:** `db:generate` clean; isolation + invariants green; `SELECT * FROM pg_extension WHERE
extname='vector'` returns a row; grants present (`\dp` / information_schema check).

### Unit 2: Embedding client (Voyage) + source/domain config + query-expansion synonyms

**Goal:** Swappable embedding client (Voyage `voyage-4`), seed config for AWRI + Wine Australia, and the
acronym/unit synonym map for the lexical arm.
**Files:** `src/lib/knowledge/embed.ts`; `src/lib/knowledge/config.ts`; `src/lib/knowledge/synonyms.ts`;
`scripts/seed-knowledge-sources.ts`; `src/lib/knowledge/env.ts` (`hasVoyageCredentials()`); `.env.example`
(already has `VOYAGE_API_KEY`).
**Approach:** `embed(texts, {inputType})` behind a model-keyed interface; Voyage impl (voyage-4, 1024,
batch, retry); missing-key gate mirrors `hasBlobCredentials()`. `config.ts` defines AWRI (3 seed roots;
`denyPrefixes` incl. `/information_services/technical_review/latest_issue/`; tier 1) + Wine Australia
(tier 1); both domains seeded to `TrustedDomain`. `synonyms.ts` maps KMBS↔potassium metabisulfite,
YAN↔yeast assimilable nitrogen, DAP↔diammonium phosphate, ppm↔mg/L, °C↔C, etc., used to expand the
lexical query only. Seed via `runAsSystem`.
**Tests:** `embed()` shape (mock: N→N×1024) + missing-key gate; `test/knowledge-config.test.ts` (AWRI
denies the paywalled Technical Review path); synonym expansion round-trip.
**Depends on:** Unit 1
**Verification:** `npx tsx --env-file=.env scripts/seed-knowledge-sources.ts` inserts sources + domains;
`embed()` unit test green.

### Unit 3: Crawler engine — sitemap, robots, SSRF-safe fetch, link-gate, blob dedup

**Goal:** Fetch trusted-source pages/PDFs safely into `KnowledgeBlob` + `KnowledgeDocument` +
`KnowledgeUrlObservation`, following links only into allowlisted domains.
**Files:** `src/lib/knowledge/crawl/{sitemap,robots,fetcher,link-gate,crawler}.ts`;
`src/lib/knowledge/crawl/ssrf.ts`; `scripts/crawl-source.ts`; `package.json` (deps `sitemapper`,
`robots-parser`, `p-queue`, `fast-xml-parser`; script `crawl:source`).
**Approach:** Per source: sitemap_index → children → URLs (+`lastmod`), filter `allowPrefixes` minus
`denyPrefixes`; per-host `robots.txt` (cache, honor `Crawl-delay`); `p-queue` per hostname. **SSRF guard**
(`ssrf.ts`): resolve DNS and reject private/reserved IPs, reject redirects to non-allowlisted hosts, cap
response size/timeout/PDF page-count, sniff content-type limits. Conditional GET (`If-None-Match`/
`If-Modified-Since`); `304` → bump `lastVerifiedAt`. Decide HTML vs PDF by `Content-Type` (fallback
`%PDF-`). Compute `contentHash` → upsert `KnowledgeBlob` (byte dedup); upsert `KnowledgeDocument` by
`(sourceId, canonicalUrl)` pointing at the blob; record every fetched URL as a `KnowledgeUrlObservation`.
Parse outbound links; enqueue only targets whose domain ∈ `TrustedDomain`; log others to `CandidateSource`.
Sanitize + length-limit stored titles/metadata (rendered later). Writes via `runAsSystem`; per-document
Postgres advisory lock to serialize concurrent processing. Treat fetched text as untrusted.
**Tests:** `test/knowledge-crawl.test.ts` — content-type routing (GUID `?ext=.pdf` + `application/pdf` → PDF);
link-gate (AWRI→wineaustralia enqueued; AWRI→random → CandidateSource, uncrawled); robots deny skipped;
blob dedup (same bytes twice → one blob, two documents/observations as appropriate); SSRF (private IP +
off-allowlist redirect rejected). Mock HTTP; no live network in CI.
**Depends on:** Unit 1, Unit 2
**Patterns to follow:** `src/lib/ingest/*`, `putPrivateDocument`.
**Verification:** `npm run crawl:source -- awri` (main checkout) populates blobs/documents/observations for
a bounded sample; a `CandidateSource` row appears; paywalled Technical Review absent; a forced private-IP
URL is refused.

### Unit 4: Extraction — HTML (Defuddle) + PDF (unpdf) + tables to markdown

**Goal:** Turn a fetched blob into clean markdown with tables preserved.
**Files:** `src/lib/knowledge/extract/{html,pdf,tables}.ts`; deps `defuddle`, `linkedom`, `unpdf`.
**Approach:** HTML → Defuddle → markdown (Readability fallback). PDF → unpdf text + positioned tables →
reconstruct as **markdown tables** (row/column preserved); flag tables that fail structure reconstruction
for review rather than injecting garbled text. Emit a normalized markdown document + a list of table
blocks with token counts.
**Tests:** `test/knowledge-extract.test.ts` — a known AWRI HTML fixture yields expected headings; a PDF
fixture with a dose table yields an aligned markdown table (columns intact); a broken-table fixture is
flagged, not silently mangled.
**Depends on:** Unit 3
**Verification:** extracted markdown for a sample AWRI fact sheet renders the barrel-sanitation /
protein-heat-test tables with intact columns.

### Unit 5: Chunk + embed + index pipeline (raw vector write, revisioned, atomic flip)

**Goal:** Structure-aware chunks written with valid vectors + tsvector, versioned for safe re-index.
**Files:** `src/lib/knowledge/chunk.ts`; `src/lib/knowledge/index-documents.ts`; dep token counter
(`gpt-tokenizer`); folded into `scripts/crawl-source.ts` (or `scripts/index-knowledge.ts`).
**Approach:** Split extracted markdown on heading hierarchy, recurse within oversize sections, never
mid-sentence; each table its own chunk (markdown); oversize table → embed a summary but store the full
markdown for context; prepend `sectionPath` breadcrumb + ~15% overlap; ~512-token target. Deterministic
chunk id `hash(documentId+ordinal+text)`. Embed via `embed(...,{inputType:"document"})`. **Write with
`$executeRaw`**: validate the vector is length-1024 all-finite, serialize to a `"[…]"` literal, bind and
cast `$1::vector`; `searchVector` is a generated column (auto). Write into a **new `revision`**, then flip
`KnowledgeDocument.activeRevision` atomically; prune stale revisions after. Idempotent: unchanged
`contentHash` → no-op.
**Tests:** `test/knowledge-chunk.test.ts` — table never split; breadcrumb prepended; token bounds;
re-index of an unchanged doc is a no-op; a changed doc writes a new revision and flips atomically (old
revision still readable until the flip); vector-literal builder rejects wrong-length/NaN.
**Depends on:** Unit 4
**Verification:** after `crawl:source -- awri`, `KnowledgeChunk` rows exist with non-null 1024-dim vectors
+ populated `searchVector`; re-run changes nothing; a simulated concurrent re-index never reads a
half-written revision.

### Unit 6: Hybrid retrieval core (dense + lexical + RRF + MMR, fail-closed, filtered)

**Goal:** The retrieval function: hybrid ranking over the tenant's enabled sources, diversified, correct.
**Files:** `src/lib/knowledge/retrieve.ts`; `src/lib/knowledge/subscriptions.ts`; `src/lib/knowledge/rrf.ts`,
`mmr.ts`.
**Approach:** `subscriptions.ts.resolveEnabledSourceIds(tenantId)` runs inside
`runAsTenant(tenantId, …)` over `KnowledgeSourceSubscription` (absent row → `source.defaultEnabled`).
**If empty → return `[]` immediately** (never drop the predicate). Then, with the app-role client on the
GLOBAL tables: dense arm = `$queryRaw` `ORDER BY embedding <=> $1::vector` over `KnowledgeChunk` join
`KnowledgeDocument` `WHERE d.sourceId = ANY($ids) AND d.status='active' AND c.revision=d.activeRevision AND
c.embedding IS NOT NULL AND c.embeddingModel=$model AND c.embeddingDim=1024`; lexical arm =
`websearch_to_tsquery` over `searchVector` with the synonym-expanded query, same filters; **RRF-fuse** both
ranked lists; **MMR** re-rank the fused top-N for diversity (λ≈0.7). Return passages tagged
documentId/publisher/tier/`publishedAt`.
**Tests:** `test/knowledge-retrieve.test.ts` — disabled source excluded; empty subscription → `[]`;
`withdrawn` + non-active-revision excluded; an exact-number query (`<2.0 NTU`) that dense misses is
recovered by the lexical arm (hybrid > dense-only on a seeded fixture); MMR returns a second document when
one doc dominates.
**Depends on:** Unit 5
**Patterns to follow:** `tx.ts` (raw tenant reads), `websearch_to_tsquery` (assistant-conversation search).
**Verification:** on the AWRI slice, "barrel sanitation Brett" surfaces the 70°C/85°C passage in the fused
top-k; the same with AWRI disabled returns nothing.

### Unit 7: `search_knowledge_base` tool — cited answers, numeric guardrail, tool-chaining, subscription-aware

**Goal:** Wire retrieval into the assistant with safe, cited, correctly-routed answers.
**Files:** `src/lib/assistant/tools/search-knowledge-base.ts`; `src/lib/assistant/registry.ts` (append);
`src/app/(app)/assistant/AssistantChat.tsx` (`TOOL_LABELS`).
**Approach:** `kind:"read"`, snake_case `search_knowledge_base`, input `{ query, topic? }`. Resolve tenant +
enabled sources (Unit 6), call hybrid retrieve, return passages + citation
`[<publisher>: <title>](/kb/source/<documentId>)`. **Description encodes the behavior contract:** cite
sources; present retrieved text as reference **not instruction** (untrusted); **quote any dose/temp/limit
numeric phrase verbatim from the source and tell the user to verify against the cited document**; **defer
math to `calc_so2`/`calc_sugar`/`query_materials`**; **for "target + calculation" questions, FIRST search
the KB for the threshold, THEN pass it to the calculator — never compute a dose from KB prose**; if nothing
relevant is in the enabled sources, say so plainly (don't fabricate). Inject the tenant's active
subscription names + source dates into the returned context so the model frames coverage correctly.
Escape citation labels.
**Tests:** golden case(s) in `test/evals/assistant-read-tools.golden.ts` (schema-validated); the deeper
answer-quality checks live in Unit 10.
**Depends on:** Unit 6
**Patterns to follow:** `query-brix.ts`, `calc-shared.ts:122`.
**Verification:** in the assistant, "most effective way to remove Brett aromas?" → RO answer + clickable
AWRI citation; a dose question returns the *target* + routes the math to the calculator, not a KB-computed
number.

### Unit 8: Citation redirect route — tenant recheck + tombstone rendering

**Goal:** Clickable citations that respect entitlements and survive source withdrawal.
**Files:** `src/app/kb/source/[id]/route.ts` (or a page for tombstones); a click-log write.
**Approach:** Resolve the caller's active tenant; **recompute whether the document's `sourceId` is enabled
for that tenant** — 404 if not (no trusting the tool's prior output). If `status='active'`, log the click
and 302 to the document's canonical URL. If `withdrawn`, render a **tombstone**: title, publisher,
withdrawal date, and the archived blob text ("this was available when cited; the publisher has since
withdrawn it").
**Tests:** `test/kb-source-route.test.ts` — tenant without the subscription gets 404 (authz); active →
302 to canonical URL + click logged; withdrawn → tombstone page, not 404.
**Depends on:** Unit 1 (Unit 7 produces the links)
**Verification:** a citation id for a source the tenant disabled 404s; a withdrawn doc shows the tombstone.

### Unit 9: Source-diverse retrieval polish + conflict-surfacing

**Goal:** Make disagreement visible with attribution and dates (MMR already diversifies in Unit 6).
**Files:** `src/lib/knowledge/retrieve.ts` (tuning); `src/lib/assistant/tools/search-knowledge-base.ts`
(description).
**Approach:** Ensure each returned passage carries `publisher + tier + publishedAt`; tool description
instructs: when retrieved passages give conflicting recommendations, present both — "X (AWRI, tier 1,
2020) recommends … ; Y (Wine Australia, tier 1, 2010) recommends …" — note the dates, prefer/flag the more
recent when they diverge, and let the winemaker decide; never average or hide the conflict.
**Tests:** `test/knowledge-conflict.test.ts` — a fixture with two conflicting tier-1 passages yields both,
attributed + dated (assert on the assembled tool result / passage set).
**Depends on:** Unit 6, Unit 7
**Verification:** a cool- vs warm-climate disagreement returns both, attributed and dated.

### Unit 10: Eval harness — `verify:knowledge-base` (retrieval + faithfulness + rejection + routing)

**Goal:** A CI-style gate that scores answer quality, not just retrieval.
**Files:** `scripts/verify-knowledge-base.ts`; `package.json` (`verify:knowledge-base`); reads
`docs/Q&A - Sheet1.csv`; reuse the `ASSISTANT_EVAL` LLM-judge plumbing.
**Approach:** Seed a Demo Winery subscription **inside `runAsTenant("org_demo_winery", …)`** enabling AWRI
(+ Wine Australia once crawled). For each **retrieval question**: run the tool as the Demo tenant and assert
(a) the expected source document is in top-k, (b) a citation is produced, and (c) **LLM-judge faithfulness**
— the answer's dose/temp/limit numbers match the retrieved source verbatim (no hallucinated numbers). Add
**negative-rejection** cases (≥2 out-of-corpus questions, e.g. "how do I brew IPA?") → the assistant must
refuse / say it's not in the corpus. Add the **hybrid-routing** case (target-YAN + DAP-dose) → assert BOTH
`search_knowledge_base` (threshold) AND `calc_sugar` (math) are invoked, and the dose comes from the
calculator. The 2 pure-calc questions → assert routes to the calculator, KB does not answer. Print
`ALL KNOWLEDGE-BASE CHECKS PASSED ✓ (N)`; `exit(1)` on fail.
**Tests:** the script is the gate; must pass on the AWRI slice before fan-out (mark the Wine-Australia-only
downy-mildew question pending until Unit 3 fan-out).
**Depends on:** Unit 7 (Unit 9 improves conflict cases; not required to pass retrieval)
**Patterns to follow:** `verify-fx.ts` structure; `ASSISTANT_EVAL` judge; Demo Winery + `QA-*` fixtures.
**Verification:** `npm run verify:knowledge-base` (main checkout) green on the AWRI slice, including a
faithfulness catch on a deliberately corrupted number and a passing negative-rejection case.

### Unit 11: Per-tenant source-subscription settings surface

**Goal:** Wineries choose which sources feed their assistant.
**Files:** a knowledge-sources section under `src/app/(app)/…/settings/` + a `runInTenantTx` server action;
read core `src/lib/knowledge/subscriptions.ts`.
**Approach:** List `active` `KnowledgeSource`s with publisher/tier/description + tenant on/off state
(default from `source.defaultEnabled`); toggle writes a `KnowledgeSourceSubscription` row (tenant-scoped).
Respect DESIGN.md tokens; minimal toggle list.
**Tests:** server-action test — toggling writes/updates the acting tenant's row only; RLS blocks
cross-tenant writes.
**Depends on:** Unit 1 (Unit 6 for the retrieval it controls)
**Execution note:** the slice can seed Demo subscriptions directly (Unit 10) and defer this UI; build
before fan-out is user-visible.
**Verification:** toggling AWRI off makes the assistant stop citing AWRI for that tenant.

### Unit 12: Scheduled re-crawler GH Actions loop (single-flight, atomic reindex, tombstone)

**Goal:** Keep the corpus fresh + auditable automatically; reviewable artifact, never auto-merge.
**Files:** `.github/workflows/knowledge-recrawl.yml`; `scripts/recrawl-knowledge.ts`; `docs/AUTOMATION.md`
(loop 5); optional marker `docs/.knowledge-recrawl-marker`.
**Approach:** Mirror `brain-refresh.yml`: `schedule` (weekly) + `workflow_dispatch`; **`concurrency:` group
`knowledge-recrawl` (cancel-in-progress:false)** so runs are single-flight; secrets `ANTHROPIC_API_KEY`,
`VOYAGE_API_KEY`, `DATABASE_URL_UNPOOLED`. `recrawl-knowledge.ts` iterates `active` sources: sitemap
`lastmod` / `contentHash` diff → re-extract + re-chunk + re-embed changed docs into a **new revision +
atomic flip** (Unit 5); `404`/removed → **tombstone** (`status='withdrawn'`, `withdrawnAt`, keep rows +
chunks for audit, excluded from retrieval), never hard-delete; summarize new `CandidateSource` domains.
Open a PR/issue with counts (added/changed/withdrawn/candidates); never merge.
**Tests:** `test/knowledge-recrawl.test.ts` — unchanged (304/lastmod) → no re-embed; changed hash →
new revision + flip; missing URL → `withdrawn` + drops from retrieval but row persists + tombstone route
still resolves.
**Depends on:** Unit 3, Unit 5
**Patterns to follow:** `brain-refresh.yml`, `docs/AUTOMATION.md`.
**Verification:** manual `workflow_dispatch` opens a PR/issue with a change summary, merges nothing; a
second concurrent dispatch is queued, not run in parallel.

## Confidence Check

| Section | Confidence | Notes |
|---------|-----------|-------|
| Problem Frame | HIGH | Well-motivated; real eval set; council reframed the dominant risk (wrong numbers) |
| Scope Boundaries | HIGH | Vertical-slice-first; private docs / discovery / claims-layer / narrower-role explicitly deferred |
| Implementation Units | MEDIUM-HIGH | Greenfield subsystem; hybrid + identity-split + revisioning add real surface, but each rides a proven precedent (tsvector, FxRate, brain-refresh, verify-fx) and the council fixes de-risk the sharp edges |
| Test Strategy | HIGH | Per-unit tests + `verify:knowledge-base` with faithfulness/rejection/routing; RLS isolation test |
| Risk Assessment | MEDIUM | Hybrid tuning (RRF/MMR params) needs eval iteration; table extraction from PDFs is the shakiest step; crawler must stay a good citizen (robots/SSRF/rate-limit) |

**Open prerequisites / risks flagged:**
- **`VOYAGE_API_KEY` — DONE** (added to main `.env`, live-tested, voyage-4 → 1024-dim). GH secret added in
  Unit 12.
- **Run migrations, crawler, `verify:*` from the MAIN checkout** (worktree has no `.env`/deps).
- **Windows/Neon migration workflow** (Unit 1) — hand-write SQL, `CREATE EXTENSION` first, filter phantom
  diffs, `migrate deploy`.
- **New npm deps:** `sitemapper`, `robots-parser`, `p-queue`, `fast-xml-parser`, `defuddle`, `linkedom`,
  `unpdf`, `gpt-tokenizer`.
- **Registers/ADR** (Unit 1): crawler = external data + cost + prompt-injection + numeric-safety surface —
  append scale + security register entries (incl. the deferred narrower-maintenance-role note) and ADR 0007.
- **PDF table extraction** is the highest-uncertainty step; the plan degrades gracefully (flag un-parseable
  tables rather than inject garbled numbers).

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | -- | -- |
| Codex Review | `/council` | Independent 2nd opinion | 1 | ✅ incorporated | 9 critical + design Qs folded in (see council-feedback.md) |
| Gemini Review | `/council` | Retrieval/product quality | 1 | ✅ incorporated | hybrid search, table/markdown, faithfulness eval, numeric guardrail, MMR |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | -- | -- |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | -- | -- |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | -- | -- |

**VERDICT:** Council (Codex + Gemini) complete and incorporated. Optional: `/plan-eng-review` for a
deeper architecture/test pass before `/work`. Otherwise ready to build the AWRI vertical slice.
