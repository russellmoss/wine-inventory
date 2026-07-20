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
import { findSourceConfig } from "./config";
import { applySectionFilter, deriveIndexHash } from "./sections";
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

export async function indexDocument(input: {
  documentId: string;
  bytes: Buffer;
  contentType: DetectedType;
  url: string;
  contentHash: string;
  /**
   * Plan 083. Optional: when the source declares a `sectionFilter`, non-technical sections are
   * stripped from the raw HTML before extraction. Omitted (every pre-083 caller) = current behavior,
   * byte-identical.
   */
  sourceKey?: string;
}): Promise<IndexResult> {
  const doc = await runAsSystem((db) =>
    db.knowledgeDocument.findUnique({
      where: { id: input.documentId },
      select: { sourceId: true, activeRevision: true, indexedContentHash: true },
    }),
  );
  if (!doc) throw new Error(`indexDocument: document ${input.documentId} not found`);

  // Plan 083 — section filtering applies to HTML only (PDFs carry no anchors). The hash the index
  // stores folds in SECTION_FILTER_VERSION, so bumping a drop pattern forces a real re-index instead
  // of short-circuiting to "unchanged" forever. Computed WITHOUT running the filter, so the cheap
  // idempotency check below still short-circuits before any parsing.
  const sectionFilterApplies =
    input.contentType === "html" &&
    (input.sourceKey ? findSourceConfig(input.sourceKey)?.sectionFilter === "anchor-heading" : false);
  const indexHash = deriveIndexHash(input.contentHash, sectionFilterApplies);

  // idempotency: same content already indexed with the current model -> no-op
  if (doc.indexedContentHash === indexHash) {
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
        indexedContentHash: indexHash,
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

  // Plan 083 — strip non-technical sections BEFORE extraction. It has to happen here: Defuddle
  // prunes empty inline elements and every section anchor is an empty <a name="3" id="3"></a>, so
  // by the time we have markdown the section boundaries are gone.
  let bytes = input.bytes;
  if (sectionFilterApplies) {
    const filtered = applySectionFilter(input.bytes.toString("utf8"));
    if (filtered.html === null) {
      // sections existed and every one was an announcement
      return { chunks: 0, skipped: "empty" };
    }
    if (filtered.failedOpen) {
      // T1-era page (VT #1-40, ~24% of that corpus): no anchors to split on, so ingest it whole
      // rather than dropping it. Logged because a silent count drop is invisible otherwise.
      console.log(`  [sections] ${input.url} — no anchors, ingesting whole (fail-open)`);
    } else {
      console.log(
        `  [sections] ${input.url} — kept ${filtered.keptAnchors.length}, dropped ${filtered.dropped.length}` +
          (filtered.dropped.length
            ? `: ${filtered.dropped.map((d) => `#${d.anchor} (${d.reason})`).join(", ")}`
            : ""),
      );
      bytes = Buffer.from(filtered.html, "utf8");
    }
  }

  const extracted = await extractDocument(bytes, input.contentType, input.url);
  if (extracted.lowConfidence) return { chunks: 0, skipped: "low-confidence" };

  const chunks = chunkMarkdown(extracted.markdown, extracted.title);
  if (chunks.length === 0) return { chunks: 0, skipped: "empty" };

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
          data: { activeRevision: newRevision, indexedContentHash: indexHash },
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
