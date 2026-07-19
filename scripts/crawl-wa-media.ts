/**
 * Plan 079 — targeted fetch of the SPECIFIC Wine Australia /getmedia PDF documents that WA's own
 * (robots-allowed) HTML pages reference. Operator-directed: WA's robots.txt disallows non-Google
 * crawlers from /getmedia media, so this is a deliberate, narrow retrieval of specific public extension
 * documents (not a blanket site crawl) — polite (2s/host), honest user-agent, routed to the WA source.
 *
 *   npm run crawl:wa-media
 */
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { extractLinks } from "@/lib/knowledge/crawl/link-gate";
import { crawlUrls } from "@/lib/knowledge/crawl/crawler";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import { runAsSystem, disconnectSystem } from "@/lib/tenant/system";

const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const waPages = await runAsSystem((db) =>
    db.knowledgeDocument.findMany({ where: { publisher: "Wine Australia", contentType: "html" }, select: { canonicalUrl: true } }),
  );
  console.log(`discovering /getmedia links from ${waPages.length} Wine Australia HTML pages...`);

  const media = new Set<string>();
  let scanned = 0;
  for (const p of waPages) {
    try {
      const res = await fetchDocument(p.canonicalUrl, { isAllowedHost });
      if (res.contentType === "html") {
        for (const link of extractLinks(res.bytes.toString("utf8"), res.finalUrl)) {
          try {
            const u = new URL(link);
            if (u.hostname.toLowerCase().endsWith("wineaustralia.com") && u.pathname.toLowerCase().startsWith("/getmedia/")) {
              media.add(link.split("#")[0]);
            }
          } catch {
            /* skip */
          }
        }
      }
    } catch {
      /* skip a page that won't fetch */
    }
    scanned++;
    if (scanned % 10 === 0) console.log(`  scanned ${scanned}/${waPages.length}, ${media.size} media links so far`);
    await sleep(800);
  }

  const urls = [...media];
  console.log(`\nfound ${urls.length} unique /getmedia documents. Fetching (2s/host) + indexing...`);

  let indexed = 0;
  let chunks = 0;
  let skipped = 0;
  let errs = 0;
  const summary = await crawlUrls("wine-australia", urls, {
    ignoreRobots: true,
    delayMs: 2000,
    onDocument: async (doc) => {
      try {
        const r = await indexDocument({ documentId: doc.documentId, bytes: doc.bytes, contentType: doc.contentType, url: doc.canonicalUrl, contentHash: doc.contentHash });
        if (r.skipped) skipped++;
        else {
          indexed++;
          chunks += r.chunks;
        }
      } catch (e) {
        errs++;
        console.log(`  ! ${doc.canonicalUrl}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      }
      if ((indexed + skipped + errs) % 20 === 0) console.log(`  ${indexed} indexed (${chunks} chunks), ${skipped} skipped, ${errs} errors`);
    },
  });

  console.log(`\ndone — fetched=${summary.fetched} documents=${summary.documents} skippedType=${summary.skippedType} fetchErrors=${summary.errors}; indexed=${indexed} chunks=${chunks} skipped=${skipped} indexErrors=${errs}`);
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
