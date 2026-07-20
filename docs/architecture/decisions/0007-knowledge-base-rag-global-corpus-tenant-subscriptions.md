# ADR 0007 — Winemaking knowledge base: RAG (not a trained model), a GLOBAL crawled corpus, per-tenant source subscriptions

- **Date:** 2026-07-18
- **Status:** accepted

## Context

We want the assistant to be a knowledgeable partner in winemaking/viticulture — answering technical
questions (SO₂ management, downy mildew fungicides, protein stability) with the authority of trusted
sources (AWRI, Wine Australia, university extension), cited, and surfacing disagreement when authorities
differ. Three forks had to be settled before building (Plan 079): how the model gets the knowledge, who
owns the corpus, and how each winery controls it.

## Decision

1. **RAG, not a trained/fine-tuned/local model.** Knowledge is a *retrieval* problem, not a weights
   problem. Claude already supplies world-class reasoning; what's missing is grounded, citable, up-to-date
   domain facts. Fine-tuning installs style/format, not reliable citable facts, and a locally-hosted model
   (Ollama et al.) would regress the reasoning we depend on. We retrieve from a curated corpus at question
   time and let Claude reason over it with citations. Fine-tuning stays explicitly out of scope.

2. **The corpus CONTENT is GLOBAL; per-winery control is a tenant-scoped SUBSCRIPTION.** The crawled public
   sources are identical for every tenant, so the content tables (`KnowledgeSource`, `KnowledgeBlob`,
   `KnowledgeDocument`, `KnowledgeUrlObservation`, `KnowledgeChunk`, `TrustedDomain`, `CandidateSource`) are
   GLOBAL reference data — no `tenantId`, no RLS, listed in `GLOBAL_MODELS` and mirrored in
   `verify-tenant-isolation.ts`, exactly like `FxRate`. We crawl and maintain once (dedup, one re-crawl
   loop). On top sits ONE tenant-scoped table, `KnowledgeSourceSubscription` (full Phase-12 RLS), recording
   which sources are active in each winery's assistant. Retrieval filters the global chunk pool to the
   tenant's enabled sources; **an empty set returns nothing (fail-closed), never "all."** This leaves a
   clean door open for a future per-winery *private* document layer (tenant-scoped content) without
   reworking the shared corpus.

3. **Document identity is split into three entities** (a byte blob can be reached from many URLs, and one
   logical document can be mirrored across sources): `KnowledgeBlob` (byte-level dedup, keyed by
   `contentHash`), `KnowledgeDocument` (one logical doc per `(source, canonicalUrl)`, carrying provenance +
   an `activeRevision`), and `KnowledgeUrlObservation` (every URL a doc was seen at). Collapsing these into
   one row (byte-dedup on a single document row) would destroy provenance, make tombstoning ambiguous, and
   leak content across subscriptions — the council flagged this (C3).

   **Consequence, discovered by plan 084:** "one logical doc per `(source, canonicalUrl)`" is enforced in
   three independent places — `normalizeCrawlUrl` does `raw.split("#")[0]`, `extractLinks` drops `#` hrefs,
   and alias-dedup keys on the raw-BYTE hash (so two fragments of one page collide and the second is
   hard-deleted). A source that mixes technical and non-technical content *within* one URL therefore cannot
   be handled by emitting a document per fragment; it must strip in place and emit one filtered document.
   That is what `sectionFilter` does (see [[../scale-register|scale-register]]). If a future requirement
   genuinely needs per-fragment identity — most likely per-chunk citation deep-links — the cheaper move is
   an `anchor` column on `KnowledgeChunk`, NOT relaxing any of those three points.

4. **Retrieval is HYBRID** — dense (pgvector cosine `<=>`) + lexical (a generated `tsvector`, the same
   full-text mechanism already used for assistant-conversation search) fused by Reciprocal Rank Fusion.
   Pure dense search under-ranks the exact numbers/acronyms/thresholds this domain is full of
   (`<2.0 NTU`, `group-11`, `70 °C/30 min`) — the single biggest answer-quality lever (council C4).

5. **Vectors are `Unsupported("vector(1024)")`**, written/read via raw SQL (`$executeRaw`/`$queryRaw`) with
   a validated `::vector` literal — the typed Prisma client can't write an `Unsupported` column. Dimension
   is **committed at 1024** for v1 (a `vector(N)` column is single-dimension at DDL); a model change is a
   documented re-embed backfill, not a live "swap." No ANN (HNSW) index in v1 — a few-thousand-row corpus
   is exact-scanned in single-digit ms; never index an empty table.

## Why (and what we rejected)

- **Rejected: fine-tune / local model.** Wrong tool for facts; regresses reasoning; updating a fact means
  retraining. RAG updates in minutes and cites.
- **Rejected: per-tenant corpus content.** Duplicating identical public docs per winery wastes storage and
  multiplies the crawl/maintenance cost N×. The global-content + tenant-subscription split gives each
  winery its own curated shelf without duplicating a single document.
- **Rejected: pure dense retrieval.** Fails the exact-term half of the real eval set.
- **Accepted cost:** corpus access control lives in application code (the global tables have no RLS), so the
  citation route (`/kb/source/<id>`) MUST re-check the tenant's subscription per request (council C2) and
  every direct corpus query must filter by enabled sources. This is a deliberate trade (shared reference
  data vs. per-row RLS); a security-barrier view is a future option if entitlements ever become contractual.

## Consequences

- New GLOBAL models must be kept in the two `GLOBAL_MODELS` mirrors or the RLS-coverage guard fails.
- Crawler writes run as owner (`runAsSystem`); retrieval resolves the tenant explicitly from
  `ctx.user.activeOrganizationId` (assistant requests carry no ALS tenant).
- Retrieved web content is UNTRUSTED (prompt-injection + extraction-error surface); numeric answers quote
  the source verbatim and defer all math to the existing calculators (`calc_so2`/`calc_sugar`).
- Proof: `verify:knowledge-base` (retrieval + faithfulness + negative-rejection + routing) + the existing
  `verify:tenant-isolation` coverage guard.
