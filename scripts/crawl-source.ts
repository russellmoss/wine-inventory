/**
 * Plan 079 — crawl a trusted source into the global corpus, extracting + embedding as it goes (Units 3-5).
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/crawl-source.ts awri --max 5
 *   ... --no-index   crawl + persist documents only (skip extract/embed; no VOYAGE_API_KEY needed)
 *
 * Default: full pipeline (fetch -> dedup -> extract -> chunk -> embed -> write chunks with atomic revision
 * flip). Requires seed:knowledge-sources first. Writes go through runAsSystem (global tables).
 */
import { crawlSource } from "@/lib/knowledge/crawl/crawler";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { disconnectSystem } from "@/lib/tenant/system";

function parseArgs(argv: string[]): { sourceKey: string; maxDocs: number; index: boolean } {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const maxIdx = argv.indexOf("--max");
  const maxDocs = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : 25;
  const sourceKey = positional[0];
  if (!sourceKey) throw new Error("usage: crawl-source.ts <sourceKey> [--max N] [--no-index]");
  return {
    sourceKey,
    maxDocs: Number.isFinite(maxDocs) && maxDocs > 0 ? maxDocs : 25,
    index: !argv.includes("--no-index"),
  };
}

async function main() {
  const { sourceKey, maxDocs, index } = parseArgs(process.argv.slice(2));
  console.log(`crawling ${sourceKey} (max ${maxDocs}, index=${index})...`);
  const t0 = Date.now();

  const indexed = { docs: 0, chunks: 0, unchanged: 0, lowConf: 0, empty: 0 };
  const summary = await crawlSource(sourceKey, {
    maxDocs,
    onDocument: index
      ? async (doc) => {
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
      : undefined,
  });

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
