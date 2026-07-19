/**
 * Plan 079 — operator-directed crawl of Scott Laboratories (scottlab.com) into the global corpus.
 *
 *   npm run crawl:scott-labs                 # handbook PDF + curated wine articles
 *   KB_MAX_DOCS=3 npm run crawl:scott-labs   # bounded smoke
 *
 * Why a dedicated script (not the auto crawler): scottlab.com's /learn/ articles are bare ROOT slugs
 * intermixed with ~1,400 product pages AND with cider/beer/seltzer/spirits articles — NOT separable by
 * URL-path prefix. So we fetch a CURATED allow-list of wine article slugs + the annual winemaking handbook
 * PDF (the cider handbook and all beer/cider/spirits content are deliberately omitted). Vendor source
 * (tier 2). Fetches go through crawlUrls → honors robots for our UA (CellarhandKnowledgeBot; permitted)
 * + Scott's Crawl-delay: 10 + SSRF; writes the global corpus via runAsSystem.
 */
import { crawlUrls } from "@/lib/knowledge/crawl/crawler";
import { indexDocument } from "@/lib/knowledge/index-documents";
import { disconnectSystem } from "@/lib/tenant/system";

const HANDBOOK_PDF =
  "https://scottlab.com/content/files/documents/handbooks/rev/scott%20laboratories%202025-2026%20winemaking%20handbook%20aug.pdf";

// Curated WINE articles (bare root slugs). Cider/beer/seltzer/spirits/mead/coffee slugs intentionally
// excluded. A stale/renamed slug simply 404s and is skipped (crawlUrls counts it as an error, continues).
const WINE_ARTICLE_SLUGS = [
  "yeast-nutrition-101",
  "enzymes-101",
  "mannoproteins-101",
  "specialty-yeasts",
  "types-of-tannins",
  "fermentation-nutrition-planning",
  "troubleshooting-stuck-sluggish-alcoholic-fermentations",
  "troubleshooting-sluggish-malolactic-fermentations",
  "ml-bacteria-sensory-impact",
  "choosing-ml-bacteria-strains-for-wine-sensory-impact",
  "aromatic-white-wine-style-guide",
  "chardonnay-wine-style-guide",
  "sauvignon-blanc-wine-style-guide",
  "rose-wine-style-guide",
  "rhone-white-wine-style-guide",
  "full-bodied-red-wine-style-guide",
  "medium-bodied-red-wine-style-guide",
  "light-bodied-red-wine-style-guide",
  "scott-labs-yeast-choosing-guide",
  "scott-labs-yeast-nutrient-choosing-guide",
  "scott-labs-enzyme-choosing-guide",
  "scott-labs-fining-and-stability-choosing-guide",
  "scott-labs-oak-and-tannin-choosing-guide",
  "scott-labs-malolactic-bacteria-and-nutrient-choosing-guide",
  "best-practices-juice-clarification",
  "filtration-best-practices-prior-to-bottling",
  "bentonite-clarification-heat-protein-stabilization",
  "microbial-control-with-velcorin-best-practices-for-wine-production",
];

async function main() {
  const max = Number(process.env.KB_MAX_DOCS) || Infinity;
  const urls = [HANDBOOK_PDF, ...WINE_ARTICLE_SLUGS.map((s) => `https://scottlab.com/${s}`)].slice(0, max);
  console.log(`crawl:scott-labs — ${urls.length} URLs (1 handbook PDF + ${urls.length - 1} wine articles)`);

  const indexed = { docs: 0, chunks: 0, unchanged: 0, lowConf: 0, empty: 0, errors: 0 };
  const summary = await crawlUrls("scott-labs", urls, {
    delayMs: 10_000, // Scott's robots Crawl-delay is 10s (crawlUrls also enforces it)
    onDocument: async (doc) => {
      // per-document isolation: a bad doc must not abort the run.
      try {
        const r = await indexDocument({
          documentId: doc.documentId, bytes: doc.bytes, contentType: doc.contentType,
          url: doc.canonicalUrl, contentHash: doc.contentHash,
        });
        if (r.skipped === "unchanged") indexed.unchanged++;
        else if (r.skipped === "low-confidence") indexed.lowConf++;
        else if (r.skipped === "empty") indexed.empty++;
        else { indexed.docs++; indexed.chunks += r.chunks; }
        console.log(`  ${doc.contentType} ${doc.canonicalUrl.replace(/^https?:\/\/[^/]+/, "")} -> ${r.skipped || `${r.chunks} chunks`}`);
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
