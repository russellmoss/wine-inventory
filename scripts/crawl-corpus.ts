/**
 * Plan 079 — full corpus crawl WITH link-following (AWRI + Wine Australia, and the sources AWRI
 * references). Seeds from both sitemaps + roots, follows trusted links (routing each URL to its source),
 * reaches the /wp-content PDF fact sheets + cross-referenced Wine Australia pages, extracts, chunks,
 * embeds, indexes. Idempotent (unchanged docs skip re-embed). Voyage Tier 1 (2000 RPM) recommended.
 *
 *   npm run crawl:corpus                 # both sources, up to 2000 docs, 1s/host
 *   KB_MAX_DOCS=500 npm run crawl:corpus # smaller run
 */
import { crawlWithFollowing } from "@/lib/knowledge/crawl/crawler";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { disconnectSystem } from "@/lib/tenant/system";

async function main() {
  const maxDocs = Number(process.env.KB_MAX_DOCS) || 2000;
  const sources = (process.env.KB_SOURCES || "awri,wine-australia").split(",").map((s) => s.trim());
  console.log(`crawl:corpus — sources=[${sources.join(", ")}] maxDocs=${maxDocs} (link-following)`);
  const t0 = Date.now();
  let indexed = 0;
  let chunks = 0;
  let skipped = 0;

  const result = await crawlWithFollowing(sources, {
    maxDocs,
    delayMs: 1000,
    onDocument: async (doc) => {
      const r = await indexDocument({
        documentId: doc.documentId, bytes: doc.bytes, contentType: doc.contentType,
        url: doc.canonicalUrl, contentHash: doc.contentHash,
      });
      if (r.skipped) skipped++;
      else {
        indexed++;
        chunks += r.chunks;
      }
      if ((indexed + skipped) % 25 === 0) {
        const mins = ((Date.now() - t0) / 60000).toFixed(1);
        console.log(`  [${mins}m] ${indexed} indexed (${chunks} chunks), ${skipped} skipped/unchanged`);
      }
    },
  });

  const mins = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\ndone in ${mins} min — indexed=${indexed} chunks=${chunks} skipped=${skipped} hitCap=${result.hitCap} candidateDomains=${result.candidateDomains}`);
  console.log(JSON.stringify(result.summaries, null, 2));
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
