/**
 * Plan 079 — operator-directed, WINE/GRAPES-ONLY crawl of OSU Extension (extension.oregonstate.edu).
 *
 *   npm run crawl:osu-extension -- --dry-run   # print the curated wine/grape URL list, fetch nothing else
 *   npm run crawl:osu-extension                # crawl + index the curated list
 *   KB_MAX_DOCS=5 npm run crawl:osu-extension  # bounded smoke
 *
 * The wine articles live in a flat /catalog/ namespace shared with ~4k unrelated pubs AND with
 * beer/cider/spirits, so this can't be an open crawl. We fetch the two ALLOWED wine topic hubs, extract
 * their /catalog/ + /crop-production/wine-grapes/ + economics-PDF links, and keep ONLY wine/grape content:
 *   - viticulture hub (/crop-production/wine-grapes): all links are wine-grape → keep unless a NEG keyword.
 *   - winemaking hub (/food/wine-beer, really "Wine, beer, cider & spirits"): MIXED → require a POS
 *     wine/grape keyword AND no NEG keyword.
 * robots '*' is Allow: / and our UA is not on OSU's named training-crawler blocklist; use=reference. We do
 * NOT touch the robots-disallowed /topic/.../resources listings. Tier 1.
 */
import { crawlUrls } from "@/lib/knowledge/crawl/crawler";
import { fetchDocument } from "@/lib/knowledge/crawl/fetcher";
import { extractLinks } from "@/lib/knowledge/crawl/link-gate";
import { collectSitemapUrls } from "@/lib/knowledge/crawl/sitemap";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";
import { disconnectSystem } from "@/lib/tenant/system";

const HOST = "extension.oregonstate.edu";
const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DELAY_MS = 3000; // no robots Crawl-delay declared → self-throttle politely

// Off-topic — exclude even if a wine/grape word also appears. Covers other beverages (cider/beer/spirits),
// other crops that collide with generic terms (cherry/apple rootstock, mustard→"must", wheat, bunchgrass/
// grazing, kiwi/berries, table grapes), and academic program pages (certificate/degree). Order matters:
// NEG is applied to EVERY candidate, so it also cleans the viticulture-hub links.
const NEG =
  /(hard-cider|cider|hops?|spirit|distill|brew|beer|malt|mead|seltzer|kombucha|coffee|cocoa|sake|hemp|hazelnut|cherry|apple|pear|wheat|mustard|bunchgrass|graz|kiwi|blueberr|raspberr|strawberr|\bberries\b|vegetable|\bbees?\b|table-grape|certificate|degree-program)/i;
// Strong wine/grape signal (collision-free) — required for the MIXED winemaking hub + all sitemap URLs.
const POS =
  /(wine|winemak|winery|grapevine|grape|vineyard|viticultur|enolog|vinifer|veraison|malolactic|riesling|pinot|chardonnay|cabernet|merlot|syrah|tempranillo|zinfandel|sauvignon)/i;

const VITI_HUB = `https://${HOST}/crop-production/wine-grapes`;
const WINEMAKING_HUB = `https://${HOST}/food/wine-beer`;

function isContentPath(p: string): boolean {
  if (p.startsWith("/es/")) return false; // Spanish mirror
  return (
    p.startsWith("/catalog/") ||
    (p.startsWith("/crop-production/wine-grapes/") && p !== "/crop-production/wine-grapes/") ||
    (p.startsWith("/sites/") && p.toLowerCase().endsWith(".pdf"))
  );
}

/** Fetch the two wine hubs, extract content links, keep ONLY wine/grape ones. */
async function discover(): Promise<{ keep: string[]; dropped: string[] }> {
  const keep = new Set<string>();
  const dropped = new Set<string>();
  const hubs = [
    { url: VITI_HUB, requirePos: false }, // viticulture hub: everything is wine-grape
    { url: WINEMAKING_HUB, requirePos: true }, // mixed hub: require a wine/grape keyword
  ];
  for (const { url, requirePos } of hubs) {
    let html: string;
    try {
      const res = await fetchDocument(url, { isAllowedHost });
      html = res.bytes.toString("utf8");
    } catch (e) {
      console.log(`  ! hub fetch failed ${url}: ${e instanceof Error ? e.message.slice(0, 80) : e}`);
      continue;
    }
    for (const link of extractLinks(html, url)) {
      let u: URL;
      try {
        u = new URL(link);
      } catch {
        continue;
      }
      if (u.hostname.toLowerCase() !== HOST) continue;
      const p = u.pathname;
      if (!isContentPath(p)) continue;
      const wineOk = requirePos ? POS.test(p) && !NEG.test(p) : !NEG.test(p);
      if (wineOk) keep.add(`https://${HOST}${p}`);
      else dropped.add(`https://${HOST}${p}`);
    }
    await sleep(DELAY_MS);
  }

  // Broaden coverage via the site sitemap (the hubs only link a featured subset; the /topic/ resource
  // listings are JS-rendered). The sitemap is the WHOLE site, so REQUIRE a positive wine/grape keyword
  // AND no negative — strictly wine/grapes. Dry-run + eyeball the KEEP list before crawling.
  try {
    const sm = await collectSitemapUrls(`https://${HOST}/sitemap.xml`, isAllowedHost);
    console.log(`  sitemap: ${sm.length} total URLs scanned`);
    for (const su of sm) {
      let u: URL;
      try {
        u = new URL(su.loc);
      } catch {
        continue;
      }
      if (u.hostname.toLowerCase() !== HOST) continue;
      const p = u.pathname;
      if (!isContentPath(p)) continue;
      if (POS.test(p) && !NEG.test(p)) keep.add(`https://${HOST}${p}`);
    }
  } catch (e) {
    console.log(`  ! sitemap discovery failed: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
  }

  return { keep: [...keep].sort(), dropped: [...dropped].sort() };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const max = Number(process.env.KB_MAX_DOCS) || Infinity;
  console.log("crawl:osu-extension — discovering wine/grape content from the two wine hubs...");
  const { keep, dropped } = await discover();
  console.log(`\nKEEP (${keep.length} wine/grape URLs):`);
  for (const u of keep) console.log("  + " + u.replace(`https://${HOST}`, ""));
  console.log(`\nDROPPED (${dropped.length} non-wine on the mixed hub):`);
  for (const u of dropped) console.log("  - " + u.replace(`https://${HOST}`, ""));

  if (dryRun) {
    console.log("\n[dry-run] no fetch/index.");
    await disconnectSystem();
    return;
  }

  const urls = Number.isFinite(max) ? keep.slice(0, max) : keep;
  const indexed = { docs: 0, chunks: 0, unchanged: 0, lowConf: 0, empty: 0, errors: 0 };
  const summary = await crawlUrls("osu-extension", urls, {
    delayMs: DELAY_MS,
    onDocument: async (doc) => {
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
