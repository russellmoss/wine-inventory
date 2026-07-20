/**
 * Plan 079 — crawl a trusted source into the global corpus, extracting + embedding as it goes (Units 3-5).
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/crawl-source.ts awri --max 5
 *   ... --no-index   crawl + persist documents only (skip extract/embed; no VOYAGE_API_KEY needed)
 *   ... --follow     follow links (crawlWithFollowing) instead of the sitemap-only crawlSource
 *
 * Plan 085 — --follow exists because crawlSource does NO link-following: it seeds from the sitemap
 * plus the roots and stops. For a source with no sitemap (msu-grapes: both standard locations 404)
 * that means it fetches the seed root and nothing else, which looks like a broken crawl. It is also
 * the only way to exercise linkedOnlyPrefixes by hand, since provenance only exists in the
 * following crawl.
 *
 * Default: full pipeline (fetch -> dedup -> extract -> chunk -> embed -> write chunks with atomic revision
 * flip). Requires seed:knowledge-sources first. Writes go through runAsSystem (global tables).
 */
import { crawlSource, crawlWithFollowing, type CrawledDoc } from "@/lib/knowledge/crawl/crawler";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { disconnectSystem } from "@/lib/tenant/system";

function parseArgs(argv: string[]): { sourceKey: string; maxDocs: number; index: boolean; follow: boolean } {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const maxIdx = argv.indexOf("--max");
  const maxDocs = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : 25;
  const sourceKey = positional[0];
  if (!sourceKey) throw new Error("usage: crawl-source.ts <sourceKey> [--max N] [--no-index] [--follow]");
  return {
    sourceKey,
    maxDocs: Number.isFinite(maxDocs) && maxDocs > 0 ? maxDocs : 25,
    index: !argv.includes("--no-index"),
    follow: argv.includes("--follow"),
  };
}

async function main() {
  const { sourceKey, maxDocs, index, follow } = parseArgs(process.argv.slice(2));
  console.log(`crawling ${sourceKey} (max ${maxDocs}, index=${index}, follow=${follow})...`);
  const t0 = Date.now();

  const indexed = { docs: 0, chunks: 0, unchanged: 0, lowConf: 0, empty: 0 };
  const onDocument = index
      ? async (doc: CrawledDoc) => {
          const r = await indexDocument({
            documentId: doc.documentId,
            bytes: doc.bytes,
            contentType: doc.contentType,
            url: doc.canonicalUrl,
            contentHash: doc.contentHash,
            sourceKey: doc.sourceKey,
          });
          if (r.skipped === "unchanged") indexed.unchanged++;
          else if (r.skipped === "low-confidence") indexed.lowConf++;
          else if (r.skipped === "empty") indexed.empty++;
          else {
            indexed.docs++;
            indexed.chunks += r.chunks;
          }
          console.log(`  indexed ${doc.canonicalUrl.replace(/^https?:\/\/[^/]+/, "")} -> ${r.skipped || `${r.chunks} chunks`}`);
        }
      : undefined;

  // Both paths share the same onDocument pipeline; they differ only in how urls are DISCOVERED.
  const summary = follow
    ? (await crawlWithFollowing([sourceKey], { maxDocs, onDocument })).summaries[sourceKey]
    : await crawlSource(sourceKey, { maxDocs, onDocument });

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\ndone in ${secs}s:`);
  console.log(JSON.stringify({ crawl: summary, index: indexed }, null, 2));
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
