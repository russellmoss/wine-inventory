// Plan 079 Unit 5 — index a crawled document: extract -> chunk -> embed -> write chunks with a raw
// ::vector literal (the Unsupported vector column can't be written through the typed client — council C1)
// -> flip the document's activeRevision atomically -> prune old revisions. Content-hash idempotency: a
// re-crawl of byte-identical content already indexed with the current model is a no-op (no re-embed).
// Revisioning + atomic flip mean a concurrent re-crawl never leaves retrieval reading half-written chunks.

import crypto from "node:crypto";
import { runAsSystem } from "@/lib/tenant/system";
import { embedTexts, KB_EMBEDDING_MODEL, KB_EMBEDDING_DIM } from "./embed";
import { chunkMarkdown, findDroppedNumericTokens } from "./chunk";
import { extractDocument } from "./extract";
import { applySectionFilter, deriveIndexHash, resolveSectionFilter } from "./sections";
import { assessProductTable } from "./boundary/product-table-core";
import { boundaryModeFor } from "./boundary/enforcing";
import type { DetectedType } from "./crawl/fetcher";

export interface IndexResult {
  chunks: number;
  /**
   * SKB Unit 2 — "product-table" joins the existing values. It is a RETURNED FIELD and never an
   * exception, deliberately: the monthly re-crawl's tombstone pass reads a throw out of this path as
   * "the page was removed" and would mark a whole source's corpus slice `withdrawn` on it. Same rule
   * `crawl/challenge.ts` already follows for WAF detection.
   *
   * Plan 100 Unit 3b — "numeric-loss" joins them for exactly the same reason, and under exactly the
   * same rule: a document whose extracted text carries a decimal that survives into none of its
   * chunks is refused, as a returned value rather than a throw.
   */
  // NOTE: kept on one line. test/knowledge-boundary-gate.test.ts asserts this union's SOURCE TEXT
  // matches /skipped:\s*"unchanged"[\s\S]*?\|\s*"product-table"/ — a structural guard that the gate
  // signals by return value rather than by throwing. Wrapping the union breaks that guard.
  skipped: "unchanged" | "low-confidence" | "empty" | "duplicate" | "product-table" | "numeric-loss" | false;
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
  /**
   * Plan 084. Optional: when the source declares a `sectionFilter`, non-technical sections are
   * stripped from the raw HTML before extraction. Omitted (every pre-084 caller) = current behavior,
   * byte-identical.
   */
  sourceKey?: string;
}): Promise<IndexResult> {
  const doc = await runAsSystem((db) =>
    db.knowledgeDocument.findUnique({
      where: { id: input.documentId },
      select: {
        sourceId: true,
        activeRevision: true,
        indexedContentHash: true,
        // SKB Unit 2 — the boundary gate resolves the source key from the ROW, not from
        // `input.sourceKey`. Two callers (crawl-ets, crawl-ives) legitimately omit the optional input,
        // and a gate a caller can bypass by forgetting an argument is not a gate.
        source: { select: { key: true } },
      },
    }),
  );
  if (!doc) throw new Error(`indexDocument: document ${input.documentId} not found`);

  // ── KB-1: the tabular/prose boundary gate (SKB Unit 2) ──
  //
  // Runs BEFORE the idempotency short-circuit, not after. If it ran after, a source moved onto the
  // enforcing list would keep its previously-indexed tier-C chunks live and retrievable forever: the
  // stored hash still matches, chunks still exist, and the function returns "unchanged" without the
  // detector ever seeing the bytes. Closing D3 has to actually purge, and this is the line that makes
  // a deletion from the report-only census take effect on the next crawl. The cost is one regex pass
  // over bytes already in memory, against a network fetch that has already happened.
  //
  // Also before extraction, per council C2: `extract/pdf.ts` emits no pipe tables and no headings, so
  // post-extraction text destroys the row-repetition signal on exactly the documents that matter.
  const boundaryMode = boundaryModeFor(doc.source?.key);
  const boundary = assessProductTable(
    input.contentType === "html"
      ? { kind: "html", html: input.bytes.toString("utf8") }
      : { kind: "text", text: input.bytes.toString("utf8") },
  );
  if (boundaryMode === "enforce" && boundary.verdict !== "prose") {
    // `uncertain` skips here and is ADMITTED for a report-only source — the failure direction is
    // source-dependent because only here is anything actually being gated (council C2).
    console.log(
      `  [boundary] ${input.url} — SKIPPED as ${boundary.verdict} (rows=${boundary.rowCount}; ${boundary.signals.join(", ") || "no signals"})`,
    );
    // Clear any chunks a previous, pre-enforcement crawl left behind, so the skip is a real removal
    // rather than a decision that only applies to future content. Same locking discipline as the
    // all-sections-dropped branch below: the document row is taken FOR UPDATE inside one tx so a
    // concurrent indexer cannot flip in a new revision while these are deleted. `indexedContentHash`
    // is deliberately left alone — it describes the last content that was actually indexed, and this
    // content was not.
    await runAsSystem(async (db) => {
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "activeRevision" FROM "knowledge_document" WHERE "id" = ${input.documentId} FOR UPDATE`;
        await tx.knowledgeChunk.deleteMany({ where: { documentId: input.documentId } });
      }, { timeout: 60_000 });
    });
    return { chunks: 0, skipped: "product-table" };
  }
  if (boundary.verdict !== "prose") {
    // Report-only: admitted and counted. This is the number D3's close-out decides against, and
    // `verify:kb-boundary` is what totals it across the corpus.
    console.log(
      `  [boundary] ${input.url} — ${boundary.verdict} on a REPORT-ONLY source (rows=${boundary.rowCount}); admitted`,
    );
  }

  // Plan 084 — section filtering applies to HTML only (PDFs carry no anchors). The hash the index
  // stores folds in SECTION_FILTER_VERSION, so bumping a drop pattern forces a real re-index instead
  // of short-circuiting to "unchanged" forever. Computed WITHOUT running the filter, so the cheap
  // idempotency check below still short-circuits before any parsing.
  const sectionFilter = resolveSectionFilter(input.contentType, input.sourceKey);
  const sectionFilterApplies = sectionFilter !== null;
  // Plan 090 Unit 8 — PDFs additionally fold in PDF_EXTRACT_VERSION, so an extractor improvement
  // actually reaches documents whose bytes have not changed. Without it Units 4-7 would have shipped
  // in code and changed nothing in the corpus, silently.
  // Plan 100 Unit 1b — and CHUNKER_VERSION, for the same reason, on every document rather than a
  // subset. `input.contentHash` is the RAW fetched bytes and must stay that way; see IndexHashInput.
  const indexHash = deriveIndexHash({
    rawContentHash: input.contentHash,
    isPdf: input.contentType === "pdf",
    filter: sectionFilter,
  });

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

  // Plan 084 — strip non-technical sections BEFORE extraction. It has to happen here: Defuddle
  // prunes empty inline elements and every section anchor is an empty <a name="3" id="3"></a>, so
  // by the time we have markdown the section boundaries are gone.
  let bytes = input.bytes;
  if (sectionFilterApplies) {
    const filtered = applySectionFilter(input.bytes.toString("utf8"), sectionFilter!.strategy);
    if (filtered.html === null) {
      // Sections existed and every one was an announcement.
      //
      // Returning early would leave the document's previously indexed chunks live and retrievable
      // — including the announcement text a pattern change was meant to remove — while
      // `indexedContentHash` kept its old value. That defeats SECTION_FILTER_VERSION in the exact
      // branch the version mechanism exists to serve. Clear the chunks and record the hash.
      // activeRevision is left alone: retrieval reads `revision = activeRevision` and now finds
      // zero rows, which is the correct "this page has no indexable content" state.
      //
      // NOTE: the CHUNKS converge, the WORK does not. The idempotency short-circuit above needs a
      // hash match AND at least one existing chunk, and this branch leaves zero — so a later sweep
      // re-parses the page and re-runs this small transaction. That costs one parse plus one tiny
      // tx per all-dropped document per sweep, and zero embedding spend. Not worth a sentinel
      // column to avoid; documented so nobody reads the code expecting a full short-circuit.
      // Same locking discipline as the main write below: take the document row FOR UPDATE inside
      // one tx, so a concurrent indexer can't flip in a new revision while we delete its chunks and
      // leave the document pointing at a revision with no rows.
      await runAsSystem(async (db) => {
        await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "activeRevision" FROM "knowledge_document" WHERE "id" = ${input.documentId} FOR UPDATE`;
          await tx.knowledgeChunk.deleteMany({ where: { documentId: input.documentId } });
          await tx.knowledgeDocument.update({
            where: { id: input.documentId },
            data: { indexedContentHash: indexHash },
          });
        }, { timeout: 60_000 });
      });
      console.log(
        `  [sections] ${input.url} — ALL ${filtered.dropped.length} sections dropped; chunks cleared`,
      );
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
  // Both persisted fields come from the extracted content, built in one place so the pair cannot
  // drift (see the update below for why that matters).
  const documentMeta = buildDocumentMetadata(extracted);
  if (extracted.lowConfidence) return { chunks: 0, skipped: "low-confidence" };

  const chunks = chunkMarkdown(extracted.markdown, extracted.title);
  if (chunks.length === 0) return { chunks: 0, skipped: "empty" };

  // Plan 100 Unit 3b — the standing numeric-integrity guard, checked BEFORE we spend an embedding
  // call and long before anything reaches retrieval.
  //
  // Unit 1 fixed the one splitter that was eating decimals. This catches the next one. The failure
  // mode is invisible by construction: a corrupted rate usually stays agronomically plausible, so
  // nothing downstream can tell that "5 lb ai/A" used to say "0.5 lb ai/A" — and the citation makes
  // the wrong number look checked. 5 lb/A of sulfur is a normal spray; 5 lb/A of a Group 3 DMI is
  // catastrophic and illegal.
  //
  // Fails CLOSED (a typed skip, never a throw). A throw here would surface in the crawl's fetch/index
  // error path, and the re-crawl tombstone pass reads certain failures as "the page was removed" —
  // one bad document must not be able to tombstone a source.
  const droppedNumbers = findDroppedNumericTokens(extracted.markdown, chunks.map((c) => c.text));
  if (droppedNumbers.length > 0) {
    console.error(
      `[kb] NUMERIC LOSS — refusing to index ${input.url}: ${droppedNumbers.length} token(s) ` +
        `present in the extracted text are absent from every chunk: ${droppedNumbers.slice(0, 10).join(", ")}`,
    );
    return { chunks: 0, skipped: "numeric-loss" };
  }

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
            // plan 084: indexHash, NOT input.contentHash. It folds in SECTION_FILTER_VERSION so a
            // drop-pattern change forces a real re-index. Identical to contentHash for every source
            // that does not declare a sectionFilter, so #405's behavior is unchanged.
            indexedContentHash: indexHash,
            // BOTH fields, written unconditionally — see buildDocumentMetadata for why null is a
            // legitimate value to persist here rather than something to skip. Short version: this
            // line is only reached when the CONTENT CHANGED, so keeping a previous date or title
            // would attach it to content that no longer exists.
            //
            // Going through buildDocumentMetadata rather than inlining is deliberate. Reconciling
            // #411 onto main dropped the title half here — main's update object predated
            // canonicalTitle — and 90/90 Cornell documents indexed untitled, every one of them
            // citing as the bare publisher name with no indication of WHICH document.
            // verify:knowledge-base's title-coverage gate is what caught it.
            ...documentMeta,
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
