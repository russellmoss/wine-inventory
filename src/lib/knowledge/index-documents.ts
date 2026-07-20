// Plan 079 Unit 5 — index a crawled document: extract -> chunk -> embed -> write chunks with a raw
// ::vector literal (the Unsupported vector column can't be written through the typed client — council C1)
// -> flip the document's activeRevision atomically -> prune old revisions. Content-hash idempotency: a
// re-crawl of byte-identical content already indexed with the current model is a no-op (no re-embed).
// Revisioning + atomic flip mean a concurrent re-crawl never leaves retrieval reading half-written chunks.

import crypto from "node:crypto";
import { runAsSystem } from "@/lib/tenant/system";
import { embedTexts, KB_EMBEDDING_MODEL, KB_EMBEDDING_DIM } from "./embed";
import { chunkMarkdown } from "./chunk";
import { extractDocument } from "./extract";
import type { DetectedType } from "./crawl/fetcher";

export interface IndexResult {
  chunks: number;
  skipped: "unchanged" | "low-confidence" | "empty" | "duplicate" | false;
}

function chunkId(documentId: string, revision: number, ordinal: number, text: string): string {
  return crypto.createHash("sha256").update(`${documentId}|${revision}|${ordinal}|${text}`).digest("hex");
}

/** Serialize a validated embedding to a pgvector text literal. Bound as a parameter, cast ::vector — never interpolated. */
function toVectorLiteral(vec: number[]): string {
  if (vec.length !== KB_EMBEDDING_DIM) throw new Error(`vector dim ${vec.length} != ${KB_EMBEDDING_DIM}`);
  for (const x of vec) if (!Number.isFinite(x)) throw new Error("non-finite value in embedding");
  return `[${vec.join(",")}]`;
}

/**
 * The document metadata derived from freshly-extracted content: what `indexDocument` writes alongside
 * the revision flip. Pure + exported so the write decision is testable — the DB write itself needs a live
 * Postgres and a Voyage embedding call, so without this seam the only write path for `publishedAt` and
 * `canonicalTitle` would have no automated coverage at all.
 *
 * Both fields are written UNCONDITIONALLY, including null. That is deliberate and it is a correction:
 * an earlier version preserved an existing date when the new extraction produced none. But this code is
 * only reached when the CONTENT CHANGED (an unchanged content hash returns early), so a retained date
 * belongs to content that no longer exists. Extension sites reuse URLs — a 2024-dated page replaced by
 * an undated reprint of a 2011 guide would keep the 2024 date, and the assistant would then skip the
 * "confirm this product is still registered" warning it gives for older material. Tying the metadata to
 * the content it was extracted from is the only story that stays true.
 */
export function buildDocumentMetadata(extracted: { title: string; publishedAt: Date | null }): {
  publishedAt: Date | null;
  canonicalTitle: string | null;
} {
  return {
    publishedAt: extracted.publishedAt,
    // citation.ts renders `canonicalTitle || publisher`, so an unset title makes every crawled document
    // cite as the bare publisher name with no indication of WHICH document. Capped because extracted
    // titles come from page <title>/PDF metadata and are occasionally a whole sentence.
    canonicalTitle: extracted.title.trim().slice(0, 300) || null,
  };
}

export async function indexDocument(input: {
  documentId: string;
  bytes: Buffer;
  contentType: DetectedType;
  url: string;
  contentHash: string;
}): Promise<IndexResult> {
  const doc = await runAsSystem((db) =>
    db.knowledgeDocument.findUnique({
      where: { id: input.documentId },
      select: { sourceId: true, activeRevision: true, indexedContentHash: true },
    }),
  );
  if (!doc) throw new Error(`indexDocument: document ${input.documentId} not found`);

  // idempotency: same content already indexed with the current model -> no-op
  if (doc.indexedContentHash === input.contentHash) {
    const already = await runAsSystem((db) =>
      db.knowledgeChunk.count({
        where: { documentId: input.documentId, revision: doc.activeRevision, embeddingModel: KB_EMBEDDING_MODEL },
      }),
    );
    if (already > 0) return { chunks: already, skipped: "unchanged" };
  }

  // Alias dedup: many CMSs (e.g. SPIP) serve the SAME article under several URLs. If another active
  // document in this SAME source already indexed this exact content, skip embedding a duplicate — it would
  // bloat the corpus and wreck retrieval diversity (the same passage returned N times). Blobs already dedup
  // the bytes; this dedups the embedded chunks.
  const aliasOf = await runAsSystem((db) =>
    db.knowledgeDocument.findFirst({
      where: {
        sourceId: doc.sourceId,
        indexedContentHash: input.contentHash,
        status: "active",
        id: { not: input.documentId },
      },
      select: { id: true },
    }),
  );
  if (aliasOf) {
    // Remove this pure-alias doc row so it doesn't inflate counts or linger empty (its blob is shared +
    // kept). Self-cleaning every crawl, so the weekly loop never accretes alias rows.
    await runAsSystem(async (db) => {
      await db.knowledgeUrlObservation.deleteMany({ where: { documentId: input.documentId } });
      await db.knowledgeDocument.delete({ where: { id: input.documentId } });
    });
    return { chunks: 0, skipped: "duplicate" };
  }

  const extracted = await extractDocument(input.bytes, input.contentType, input.url);
  if (extracted.lowConfidence) return { chunks: 0, skipped: "low-confidence" };

  const chunks = chunkMarkdown(extracted.markdown, extracted.title);
  if (chunks.length === 0) return { chunks: 0, skipped: "empty" };

  const metadata = buildDocumentMetadata(extracted);

  // Embed OUTSIDE the transaction (network call — never hold a DB tx across it), then validate each
  // embedding to a pgvector literal before opening the tx.
  const embedded = await embedTexts(chunks.map((c) => c.text), { inputType: "document" });
  const vectors = embedded.map((v) => toVectorLiteral(v));

  // Truly atomic write: one interactive transaction, doc row locked FOR UPDATE, the new revision derived
  // INSIDE the tx from the locked activeRevision (so concurrent indexers can't collide), any partial rows
  // from a prior crashed attempt cleared first, then insert -> flip activeRevision -> prune old — all or
  // nothing. A crash rolls back, so retrieval (revision = activeRevision) never sees a mixed revision.
  await runAsSystem(async (db) => {
    await db.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ activeRevision: number }[]>`
          SELECT "activeRevision" FROM "knowledge_document" WHERE "id" = ${input.documentId} FOR UPDATE`;
        const currentRev = locked[0]?.activeRevision ?? doc.activeRevision;
        const newRevision = currentRev + 1;

        // clear any leftover rows at the target revision (a prior attempt that crashed before flip)
        await tx.knowledgeChunk.deleteMany({ where: { documentId: input.documentId, revision: newRevision } });

        for (let i = 0; i < chunks.length; i++) {
          const c = chunks[i];
          const id = chunkId(input.documentId, newRevision, c.ordinal, c.text);
          await tx.$executeRaw`
            INSERT INTO "knowledge_chunk"
              ("id", "documentId", "revision", "ordinal", "sectionPath", "text", "tokenCount",
               "embedding", "embeddingModel", "embeddingDim", "embeddedAt", "createdAt")
            VALUES (${id}, ${input.documentId}, ${newRevision}, ${c.ordinal}, ${c.sectionPath}, ${c.text},
                    ${c.tokenCount}, ${vectors[i]}::vector, ${KB_EMBEDDING_MODEL}, ${KB_EMBEDDING_DIM}, now(), now())
            ON CONFLICT ("id") DO NOTHING`;
        }
        await tx.knowledgeDocument.update({
          where: { id: input.documentId },
          data: {
            activeRevision: newRevision,
            indexedContentHash: input.contentHash,
            // Plan 084 — publishedAt/canonicalTitle live in the EXTRACTED content, but persistDocument
            // (the crawler's only document write) runs before extraction and never sees parsed bytes, so
            // it structurally cannot set them. This is the first point in the pipeline that has both the
            // document row and the parsed content, which is why the write belongs here and why every
            // ingestion path (crawlSource, crawlUrls, crawlWithFollowing) gets it for free.
            // See buildDocumentMetadata for why both fields are written unconditionally.
            ...metadata,
          },
        });
        await tx.knowledgeChunk.deleteMany({
          where: { documentId: input.documentId, revision: { not: newRevision } },
        });
      },
      { timeout: 60_000 },
    );
  });

  return { chunks: chunks.length, skipped: false };
}
