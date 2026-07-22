/**
 * Plan 090 Unit 9 — re-index existing corpus documents through the current extractor.
 *
 *   npm run reindex:knowledge -- --sources=osu-owri,wbi,lvwo --dry-run
 *   npm run reindex:knowledge -- --sources=osu-owri,wbi,lvwo
 *   npm run reindex:knowledge -- --sources=osu-owri --limit=10
 *
 * WHY THIS EXISTS. Units 4-7 changed how PDFs are extracted, but the corpus stores the OLD text.
 * Unit 8 made the extractor version participate in `indexedContentHash`, so the monthly recrawl will
 * propagate the change on its own — this script only does it now instead of waiting, scoped to the
 * sources that carry most of the defect.
 *
 * TWO SILENT-NO-OP TRAPS, both real, both guarded:
 *   1. `indexDocument` short-circuits on an unchanged index hash. Fixed in Unit 8 by folding
 *      PDF_EXTRACT_VERSION in for PDFs.
 *   2. `crawlUrls` issues a CONDITIONAL GET. The publisher's bytes have not changed, so it would 304,
 *      `continue`, and never call onDocument — a clean-looking run that re-indexed nothing. Hence
 *      `ignoreValidators: true` below.
 * Both had to be handled or this script would report success and do nothing.
 *
 * SAFETY. Every write goes through `indexDocument`, which builds the new revision, flips
 * `activeRevision` and prunes the old one inside ONE interactive transaction with the document row
 * locked FOR UPDATE. Retrieval reads `revision = activeRevision`, so a crash or an abort mid-run
 * leaves each document on its previous revision — rollback-safe per document, by construction.
 *
 * Run from the MAIN checkout (`.claude/worktrees/*` has no .env).
 */
import { crawlUrls } from "@/lib/knowledge/crawl/crawler";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";
import { prisma } from "@/lib/prisma";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

interface DocRow {
  id: string;
  canonicalUrl: string;
  contentType: string;
  sourceKey: string;
}

async function main() {
  const sources = (arg("sources") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const dryRun = process.argv.includes("--dry-run");
  const limit = Number(arg("limit") ?? "0") || 0;

  if (sources.length === 0) {
    console.error("usage: --sources=key1,key2 [--dry-run] [--limit=N]");
    process.exit(2);
  }

  const docs = await runAsSystem((db) =>
    db.$queryRawUnsafe<DocRow[]>(
      `SELECT d."id", d."canonicalUrl", d."contentType", s."key" AS "sourceKey"
       FROM "knowledge_document" d
       JOIN "knowledge_source" s ON s."id" = d."sourceId"
       WHERE d."status" = 'active' AND s."key" = ANY($1::text[])
       ORDER BY s."key", d."canonicalUrl"`,
      sources,
    ),
  );

  const bySource = new Map<string, DocRow[]>();
  for (const d of docs) {
    if (!bySource.has(d.sourceKey)) bySource.set(d.sourceKey, []);
    bySource.get(d.sourceKey)!.push(d);
  }

  console.log(`plan 090 re-index — sources: ${sources.join(", ")}${dryRun ? "  [DRY RUN]" : ""}\n`);
  for (const [key, rows] of bySource) {
    const pdfs = rows.filter((r) => r.contentType === "pdf").length;
    console.log(`  ${key.padEnd(14)} ${String(rows.length).padStart(4)} documents (${pdfs} pdf)`);
  }
  const missing = sources.filter((s) => !bySource.has(s));
  if (missing.length) console.log(`  ⚠️  no active documents for: ${missing.join(", ")}`);

  if (dryRun) {
    const chunks = await runAsSystem((db) =>
      db.$queryRawUnsafe<{ chunks: bigint }[]>(
        `SELECT COUNT(c."id")::bigint AS chunks
         FROM "knowledge_chunk" c
         JOIN "knowledge_document" d ON d."id" = c."documentId" AND c."revision" = d."activeRevision"
         JOIN "knowledge_source" s ON s."id" = d."sourceId"
         WHERE d."status" = 'active' AND s."key" = ANY($1::text[])`,
        sources,
      ),
    );
    console.log(`\nwould re-embed ~${chunks[0]?.chunks ?? 0} chunks. No writes performed.`);
    await disconnectSystem();
    await prisma.$disconnect();
    return;
  }

  const totals = { reindexed: 0, unchanged: 0, skipped: 0, errors: 0, chunks: 0 };
  for (const [key, rows] of bySource) {
    const urls = (limit ? rows.slice(0, limit) : rows).map((r) => r.canonicalUrl);
    console.log(`\n=== ${key} — ${urls.length} urls ===`);

    const summary = await crawlUrls(key, urls, {
      // See the header note: without this the conditional GET 304s and nothing is re-indexed.
      ignoreValidators: true,
      onDocument: async (doc) => {
        try {
          const res = await indexDocument({
            documentId: doc.documentId,
            bytes: doc.bytes,
            contentType: doc.contentType,
            url: doc.canonicalUrl,
            contentHash: doc.contentHash,
            sourceKey: key,
          });
          if (res.skipped === "unchanged") totals.unchanged++;
          else if (res.skipped) totals.skipped++;
          else {
            totals.reindexed++;
            totals.chunks += res.chunks;
          }
        } catch (e) {
          totals.errors++;
          console.log(`  ! index failed ${doc.canonicalUrl}: ${(e as Error).message.slice(0, 160)}`);
        }
      },
    });
    console.log(
      `  fetched ${summary.fetched}, documents ${summary.documents}, notModified ${summary.notModified}, errors ${summary.errors}`,
    );
    // notModified should be ZERO with ignoreValidators. If it is not, the flag is not reaching
    // fetchDocument and the run is a no-op wearing a success message.
    if (summary.notModified > 0) {
      console.log(`  ⚠️  ${summary.notModified} responses were 304 despite ignoreValidators — those documents were NOT re-indexed.`);
    }
  }

  console.log(
    `\nre-indexed ${totals.reindexed} documents (${totals.chunks} chunks), unchanged ${totals.unchanged}, skipped ${totals.skipped}, errors ${totals.errors}`,
  );
  if (totals.unchanged > 0) {
    console.log(`⚠️  "unchanged" means indexDocument short-circuited — check PDF_EXTRACT_VERSION actually moved.`);
  }

  await disconnectSystem();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
