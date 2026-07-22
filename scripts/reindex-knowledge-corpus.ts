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
import { findCuratedSpec } from "@/lib/knowledge/curated-specs";
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

  // RESUME FILTER. Without it a re-run re-FETCHES every document in scope: already-processed ones
  // short-circuit inside indexDocument to "unchanged", but only AFTER the network round trip, and the
  // fetch is the expensive part (OWRI serves 1-2 MB PDFs against a 30s timeout). This matters because
  // fetch failures and interruptions are NORMAL at this scale — the first live run died to a dropped
  // connection with 121 of 616 documents left, and re-fetching the 495 finished ones would have cost
  // hours for nothing.
  //
  // Selects documents whose ACTIVE chunks were last embedded before the cutoff, plus any with no
  // chunks at all (a previously failed document has no new revision, so it correctly reappears).
  const staleBefore = arg("stale-before");
  // --pdf-only: plan 090 changed PDF extraction ONLY, and deriveIndexHash reflects that — an HTML
  // document's index hash is byte-identical to before, so re-fetching one can never produce a new
  // revision. It would cost a full network round trip to reach "unchanged". Skipping them cuts this
  // campaign from 1,461 documents to 790 (awri alone drops 736 -> 424).
  const pdfOnly = process.argv.includes("--pdf-only");
  const docs = await runAsSystem((db) =>
    db.$queryRawUnsafe<DocRow[]>(
      `SELECT d."id", d."canonicalUrl", d."contentType", s."key" AS "sourceKey"
       FROM "knowledge_document" d
       JOIN "knowledge_source" s ON s."id" = d."sourceId"
       WHERE d."status" = 'active' AND s."key" = ANY($1::text[])
         AND ($3::boolean IS NOT TRUE OR d."contentType" = 'pdf')
         AND ($2::timestamp IS NULL OR COALESCE(
               (SELECT MAX(c."embeddedAt") FROM "knowledge_chunk" c
                WHERE c."documentId" = d."id" AND c."revision" = d."activeRevision"),
               'epoch'::timestamp) < $2::timestamp)
       ORDER BY s."key", d."canonicalUrl"`,
      sources,
      staleBefore ?? null,
      pdfOnly,
    ),
  );
  if (staleBefore) console.log(`resuming: only documents last embedded before ${staleBefore}`);
  if (pdfOnly) console.log(`pdf-only: HTML documents skipped (their index hash is unchanged by plan 090)`);
  if (staleBefore || pdfOnly) console.log("");

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
    // Counted over the SELECTED document ids, not the whole source. With --stale-before the two differ
    // by an order of magnitude, and a dry run that overstates its own scope is exactly the kind of
    // reassuring-but-wrong output this plan has spent its time eliminating.
    const chunks = await runAsSystem((db) =>
      db.$queryRawUnsafe<{ chunks: bigint }[]>(
        `SELECT COUNT(c."id")::bigint AS chunks
         FROM "knowledge_chunk" c
         JOIN "knowledge_document" d ON d."id" = c."documentId" AND c."revision" = d."activeRevision"
         WHERE d."id" = ANY($1::text[])`,
        docs.map((d) => d.id),
      ),
    );
    console.log(`\nwould re-fetch ${docs.length} documents and re-embed ~${chunks[0]?.chunks ?? 0} chunks. No writes performed.`);
    await disconnectSystem();
    await prisma.$disconnect();
    return;
  }

  const totals = { reindexed: 0, unchanged: 0, skipped: 0, errors: 0, chunks: 0 };
  const abandoned: string[] = [];
  for (const [key, rows] of bySource) {
    const urls = (limit ? rows.slice(0, limit) : rows).map((r) => r.canonicalUrl);

    // INHERIT the source's curated fetch policy rather than restating it here.
    //
    // Found by watching a live run: lvwo and wbi sat at ZERO re-indexed while osu-owri progressed,
    // because both German state institutes block PDFs with a generic `/*.pdf$` robots rule (CMS
    // boilerplate, not anti-AI — the curated specs say so and set ignoreRobots for exactly that
    // reason). Without inheriting it, 350 of these 616 documents are silently skipped as
    // skippedRobots and the run still prints a success summary.
    //
    // Reading it from curated-specs keeps "may we ignore robots for this host" as ONE documented
    // decision in one place. A re-index script must never make that judgment on its own.
    const spec = findCuratedSpec(key);
    console.log(
      `\n=== ${key} — ${urls.length} urls${spec?.ignoreRobots ? "  [curated: ignoreRobots]" : ""} ===`,
    );

    // ONE SOURCE'S CRASH MUST NOT ABANDON THE REST.
    //
    // crawlUrls does its own DB reads (the conditional-GET validator lookup), and those are NOT inside
    // the per-document try/catch below. Observed twice on this box: a transient Neon P1001 ("Can't
    // reach database server") threw straight out of crawlUrls and killed the whole run, taking every
    // source after it — wbi never started because the crash landed mid-osu-owri.
    //
    // Interruptions are NORMAL at this scale, so the loop absorbs them per source and reports which
    // ones were abandoned. Nothing is lost either way: a document that never reached indexDocument
    // keeps its old revision and reappears in the next --stale-before pass.
    let summary;
    try {
      summary = await crawlUrls(key, urls, {
      // See the header note: without this the conditional GET 304s and nothing is re-indexed.
      ignoreValidators: true,
      ignoreRobots: spec?.ignoreRobots,
      delayMs: spec?.delayMs,
      maxBytes: spec?.maxBytes,
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
    } catch (e) {
      abandoned.push(key);
      console.log(`  ✗ ${key} ABANDONED mid-source: ${(e as Error).message.slice(0, 180)}`);
      console.log(`    re-run with the same --stale-before to pick it up; nothing was lost.`);
      continue;
    }
    console.log(
      `  fetched ${summary.fetched}, documents ${summary.documents}, notModified ${summary.notModified}, skippedRobots ${summary.skippedRobots}, errors ${summary.errors}`,
    );
    // A source whose every URL is refused by robots re-indexes NOTHING while the run still looks
    // successful — that is how lvwo and wbi sat at zero unnoticed. Say it loudly.
    if (summary.skippedRobots > 0) {
      console.log(`  ⚠️  ${summary.skippedRobots} urls refused by robots — NOT re-indexed. Does this source need ignoreRobots in curated-specs?`);
    }
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
  if (abandoned.length) {
    console.log(`\n⚠️  ${abandoned.length} source(s) ABANDONED mid-run: ${abandoned.join(", ")}`);
    console.log(`   This run is INCOMPLETE. Re-run with the same --stale-before before trusting any before/after comparison.`);
    process.exitCode = 1;
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
