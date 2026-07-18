/**
 * Plan 079 — crawl a trusted source into the global corpus (Units 3-5 pipeline).
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/crawl-source.ts awri --max 5
 *
 * Unit 3 stage: fetch + dedup + persist KnowledgeBlob/KnowledgeDocument/KnowledgeUrlObservation + queue
 * candidate domains. Extraction + chunk/embed (Units 4/5) attach via the onDocument hook once built.
 * Requires seed:knowledge-sources to have run. Writes go through runAsSystem (global tables).
 */
import { crawlSource } from "@/lib/knowledge/crawl/crawler";
import { disconnectSystem } from "@/lib/tenant/system";

function parseArgs(argv: string[]): { sourceKey: string; maxDocs: number } {
  const positional = argv.filter((a) => !a.startsWith("--"));
  const maxIdx = argv.indexOf("--max");
  const maxDocs = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : 25;
  const sourceKey = positional[0];
  if (!sourceKey) {
    throw new Error("usage: crawl-source.ts <sourceKey> [--max N]   e.g. awri --max 5");
  }
  return { sourceKey, maxDocs: Number.isFinite(maxDocs) && maxDocs > 0 ? maxDocs : 25 };
}

async function main() {
  const { sourceKey, maxDocs } = parseArgs(process.argv.slice(2));
  console.log(`crawling ${sourceKey} (max ${maxDocs} docs)...`);
  const t0 = Date.now();
  const summary = await crawlSource(sourceKey, { maxDocs });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\ndone in ${secs}s:`);
  console.log(JSON.stringify(summary, null, 2));
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
