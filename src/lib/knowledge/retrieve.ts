// Plan 079 Unit 6 — hybrid retrieval. Dense (pgvector cosine) + lexical (tsvector websearch) candidate
// lists, fused by RRF, diversified by MMR, filtered to the tenant's enabled sources. Fail-closed: no
// enabled sources => no results (never "all"). Excludes withdrawn docs + non-active-revision + wrong-model
// chunks. Web-app path: extended prisma (raw queries run as app_rls; the global corpus has no RLS, the
// subscription read is tenant-scoped inside resolveEnabledSources). Council: C4 (hybrid), fail-closed, MMR.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { embedQuery, KB_EMBEDDING_MODEL, KB_EMBEDDING_DIM } from "./embed";
import { resolveEnabledSourceIds } from "./subscriptions";
import { expandQueryTerms } from "./synonyms";
import { rrfFuse, normalizeScores } from "./rrf";
import { mmrSelect, type MmrCandidate } from "./mmr";

export interface RetrievedPassage {
  chunkId: string;
  documentId: string;
  publisher: string;
  tier: number;
  canonicalUrl: string;
  publishedAt: Date | null;
  sectionPath: string;
  text: string;
}

interface Row {
  chunkId: string;
  documentId: string;
  sectionPath: string;
  text: string;
  publisher: string;
  tier: number;
  canonicalUrl: string;
  publishedAt: Date | null;
  sitemapLastmod: Date | null;
  embeddingText: string;
}

function parseVector(text: string | null): number[] {
  if (!text) return [];
  try {
    return JSON.parse(text) as number[];
  } catch {
    return [];
  }
}

export async function retrieveKnowledge(opts: {
  tenantId: string;
  query: string;
  topK?: number;
}): Promise<RetrievedPassage[]> {
  const enabled = await resolveEnabledSourceIds(opts.tenantId);
  if (enabled.length === 0) return []; // FAIL-CLOSED: no enabled sources -> nothing (never all)

  const topK = opts.topK ?? 6;
  const candidateK = Math.max(topK * 4, 24);
  const inList = Prisma.join(enabled);

  const qvec = await embedQuery(opts.query);
  const qlit = `[${qvec.join(",")}]`;
  const lexQuery = expandQueryTerms(opts.query);

  // Dense arm: cosine nearest neighbors.
  const dense = await prisma.$queryRaw<Row[]>`
    SELECT c."id" AS "chunkId", c."documentId", c."sectionPath", c."text",
           d."publisher", d."tier", d."canonicalUrl", d."publishedAt", d."sitemapLastmod",
           c."embedding"::text AS "embeddingText"
    FROM "knowledge_chunk" c
    JOIN "knowledge_document" d ON d."id" = c."documentId"
    WHERE d."sourceId" IN (${inList})
      AND d."status" = 'active' AND c."revision" = d."activeRevision"
      AND c."embedding" IS NOT NULL
      AND c."embeddingModel" = ${KB_EMBEDDING_MODEL} AND c."embeddingDim" = ${KB_EMBEDDING_DIM}
    ORDER BY c."embedding" <=> ${qlit}::vector
    LIMIT ${candidateK}`;

  // Lexical arm: full-text over the generated tsvector (with synonym expansion for acronyms/units).
  const lexical = await prisma.$queryRaw<Row[]>`
    SELECT c."id" AS "chunkId", c."documentId", c."sectionPath", c."text",
           d."publisher", d."tier", d."canonicalUrl", d."publishedAt", d."sitemapLastmod",
           c."embedding"::text AS "embeddingText"
    FROM "knowledge_chunk" c
    JOIN "knowledge_document" d ON d."id" = c."documentId"
    WHERE d."sourceId" IN (${inList})
      AND d."status" = 'active' AND c."revision" = d."activeRevision"
      AND c."embedding" IS NOT NULL
      AND c."search_vector" @@ websearch_to_tsquery('english', ${lexQuery})
    ORDER BY ts_rank(c."search_vector", websearch_to_tsquery('english', ${lexQuery})) DESC
    LIMIT ${candidateK}`;

  const byId = new Map<string, Row>();
  for (const r of [...dense, ...lexical]) if (!byId.has(r.chunkId)) byId.set(r.chunkId, r);
  if (byId.size === 0) return [];

  // Fuse the two ranked lists, normalize to [0,1], then MMR-diversify.
  const fused = rrfFuse([dense.map((r) => r.chunkId), lexical.map((r) => r.chunkId)]);
  const norm = normalizeScores(fused);
  const candidates: MmrCandidate<Row>[] = fused
    .map((f) => byId.get(f.id))
    .filter((r): r is Row => !!r)
    .map((r) => ({ item: r, relevance: norm.get(r.chunkId) ?? 0, vector: parseVector(r.embeddingText) }));

  return mmrSelect(candidates, topK, 0.7).map((r) => ({
    chunkId: r.chunkId,
    documentId: r.documentId,
    publisher: r.publisher,
    tier: r.tier,
    canonicalUrl: r.canonicalUrl,
    // effective date for conflict-surfacing: the page's published date, else the sitemap lastmod
    publishedAt: r.publishedAt ?? r.sitemapLastmod,
    sectionPath: r.sectionPath,
    text: r.text,
  }));
}
