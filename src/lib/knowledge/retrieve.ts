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

/**
 * Where a passage's date came from. Plan 084 — this distinction is the whole point.
 *
 * "published"     — the document declared it (JSON-LD datePublished, article:published_time, PDF
 *                   CreationDate). Trustworthy enough to reason about staleness with.
 * "last-modified" — no declared date; this is the sitemap's <lastmod>, i.e. when the page was last
 *                   TOUCHED. On WordPress that is a theme migration, a plugin bulk-edit or a category
 *                   re-tag. A 2009 spray guide re-tagged last month carries a last-modified of last
 *                   month. It is NOT a publication date and must never be treated as one.
 * "unknown"       — neither is available.
 */
export type DateSource = "published" | "last-modified" | "unknown";

export interface RetrievedPassage {
  chunkId: string;
  documentId: string;
  publisher: string;
  tier: number;
  canonicalUrl: string;
  publishedAt: Date | null;
  dateSource: DateSource;
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

/** Resolve a row's effective date and record WHICH kind of date it is. Pure — unit-tested. */
export function dateOf(r: { publishedAt: Date | null; sitemapLastmod: Date | null }): {
  publishedAt: Date | null;
  dateSource: DateSource;
} {
  if (r.publishedAt) return { publishedAt: r.publishedAt, dateSource: "published" };
  if (r.sitemapLastmod) return { publishedAt: r.sitemapLastmod, dateSource: "last-modified" };
  return { publishedAt: null, dateSource: "unknown" };
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

  // Plan 090 Unit 1 — both arms carry a `, c."id"` TIEBREAKER, and it is load-bearing rather than
  // cosmetic. Neither ORDER BY was total: `ts_rank` in particular produces coarse, heavily-tied scores
  // (measured: 2 tied rows inside the top 40 for the leafroll/mealybug eval query), and there is no ANN
  // index on `embedding`, so the dense arm is a sequential scan whose row order among equal distances is
  // whatever the plan happens to produce. With `LIMIT ${candidateK}` a tie straddling the cut means the
  // surviving candidate varies between executions, and that propagates through RRF and MMR into the
  // final ranking.
  //
  // Measured before the fix: 2 of 5 identical snapshot runs showed a spurious single-query movement, a
  // DIFFERENT query each time. That noise would have shown up in the plan-090 before/after artifact as a
  // retrieval change nobody made. `id` is unique and stable within a revision, so this only decides
  // among rows that already scored equal — it changes no ranking that was actually determined.
  //
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
    ORDER BY c."embedding" <=> ${qlit}::vector, c."id"
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
    ORDER BY ts_rank(c."search_vector", websearch_to_tsquery('english', ${lexQuery})) DESC, c."id"
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
    // Effective date for conflict-surfacing: the page's declared date, else the sitemap lastmod. The
    // fallback is KEPT (a rough date beats none for ordering) but is now LABELLED, because the two are
    // not interchangeable and the difference is load-bearing: the assistant reasons about staleness of
    // spray and pesticide guidance from this, and a lastmod reflects the last edit, not the last review.
    ...dateOf(r),
    sectionPath: r.sectionPath,
    text: r.text,
  }));
}
