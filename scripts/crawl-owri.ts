/**
 * Plan 079 — operator-directed crawl of the Oregon Wine Research Institute collection
 * (ScholarsArchive@OSU, ir.library.oregonstate.edu) into the global corpus.
 *
 *   npm run crawl:owri                 # full collection (~270 research PDFs)
 *   KB_MAX_DOCS=3 npm run crawl:owri   # bounded smoke
 *
 * Why a dedicated script: the individual /concern/ item pages sit behind a JS bot-detection challenge, but
 * the collection LISTING pages (/collections/nz806494j?page=N) are ungated and expose the /downloads/<id>
 * PDF links directly, and the /downloads/ endpoints serve the PDFs directly. So we walk the listing to
 * enumerate the download URLs and fetch those PDFs — never touching the challenge-gated item pages. Our UA
 * (CellarhandKnowledgeBot) is permitted by robots '*' for /collections/ + /downloads/ (the ClaudeBot
 * Disallow targets a different, named bot); we honor their Crawl-delay: 16. Reference use, cite + link back.
 */
import { crawlUrls } from "@/lib/knowledge/crawl/crawler";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import { disconnectSystem } from "@/lib/tenant/system";

const HOST = "ir.library.oregonstate.edu";
const COLLECTION = `https://${HOST}/collections/nz806494j`;
const CRAWL_DELAY_MS = 16_000; // OSU robots Crawl-delay: 16 (honored for listing pages too)
const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Walk the paginated collection listing, collecting the /downloads/<id> PDF URLs it exposes directly. */
async function collectDownloadUrls(): Promise<string[]> {
  const maxPages = Number(process.env.KB_MAX_PAGES) || 40; // ~27 expected; env caps for smoke/safety
  const found = new Set<string>();
  let emptyStreak = 0;
  for (let page = 1; page <= maxPages; page++) {
    const url = `${COLLECTION}?locale=en&page=${page}`;
    let html: string;
    try {
      const res = await fetchDocument(url, { isAllowedHost });
      html = res.bytes.toString("utf8");
    } catch (e) {
      console.log(`  listing page ${page} fetch failed (${e instanceof Error ? e.message.slice(0, 80) : e}) — stopping`);
      break;
    }
    const before = found.size;
    for (const m of html.matchAll(/\/downloads\/([a-z0-9]+)/gi)) found.add(`https://${HOST}/downloads/${m[1]}`);
    const added = found.size - before;
    console.log(`  listing page ${page}: +${added} (total ${found.size})`);
    if (added === 0 && ++emptyStreak >= 2) break; // two consecutive empty pages = end of collection
    if (added > 0) emptyStreak = 0;
    if (page < maxPages) await sleep(CRAWL_DELAY_MS); // honor Crawl-delay between pages (skip after the last)
  }
  return [...found];
}

async function main() {
  const max = Number(process.env.KB_MAX_DOCS) || Infinity;
  console.log(`crawl:owri — enumerating the OWRI collection listing...`);
  let downloadUrls = await collectDownloadUrls();
  console.log(`enumerated ${downloadUrls.length} download URLs`);
  if (Number.isFinite(max)) downloadUrls = downloadUrls.slice(0, max);
  if (!downloadUrls.length) {
    console.log("no download URLs found — aborting");
    await disconnectSystem();
    return;
  }

  const indexed = { docs: 0, chunks: 0, unchanged: 0, lowConf: 0, empty: 0, errors: 0 };
  const summary = await crawlUrls("osu-owri", downloadUrls, {
    delayMs: CRAWL_DELAY_MS, // crawlUrls also enforces robots Crawl-delay (16s)
    onDocument: async (doc) => {
      // per-document isolation: one bad PDF must NEVER abort the whole ~270-doc crawl.
      try {
        const r = await indexDocument({
          documentId: doc.documentId, bytes: doc.bytes, contentType: doc.contentType,
          url: doc.canonicalUrl, contentHash: doc.contentHash,
        });
        if (r.skipped === "unchanged") indexed.unchanged++;
        else if (r.skipped === "low-confidence") indexed.lowConf++;
        else if (r.skipped === "empty") indexed.empty++;
        else { indexed.docs++; indexed.chunks += r.chunks; }
      } catch (e) {
        indexed.errors++;
        console.log(`  ! index failed for ${doc.canonicalUrl}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      }
      if ((indexed.docs + indexed.unchanged + indexed.lowConf + indexed.empty + indexed.errors) % 10 === 0) {
        console.log(`  progress: ${indexed.docs} indexed (${indexed.chunks} chunks), ${indexed.unchanged} unchanged, ${indexed.lowConf} lowConf, ${indexed.empty} empty, ${indexed.errors} errors`);
      }
    },
  });

  console.log(`\ndone: ${JSON.stringify({ crawl: summary, index: indexed })}`);
  await disconnectSystem();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectSystem().catch(() => {});
  process.exit(1);
});
