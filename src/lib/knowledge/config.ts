// Plan 079 — the curated trusted-source registry. This is the MOAT and the crawl boundary: the crawler
// only fetches sources listed here, and only follows links INTO domains in TRUSTED_DOMAINS. Adding a
// source later is a config edit (re-run scripts/seed-knowledge-sources.ts), not code. AWRI is source #1,
// Wine Australia #2 (queued: UC Davis, Oregon State, Washington State, Cornell).

export interface KnowledgeSourceConfig {
  key: string;
  publisher: string;
  homeDomain: string;
  tier: number; // 1 = peer-reviewed / official extension; 2 = industry/vendor (product-biased)
  license: string;
  seedRoots: string[];
  allowPrefixes: string[]; // path prefixes permitted (matched on URL pathname)
  denyPrefixes: string[]; // path prefixes refused (paywalled / robots-disallowed)
  // Explicit sitemap URL(s). The auto crawler otherwise only probes origin/sitemap_index.xml +
  // origin/sitemap.xml; set this when the sitemap lives elsewhere (e.g. WordPress core /wp-sitemap.xml).
  sitemapUrls?: string[];
  // false = NOT part of the automatic sitemap/link-following crawl or the weekly re-crawl loop; the
  // corpus is populated by a dedicated operator script instead (a curated URL list that path-prefix
  // filtering can't cleanly express, or a paginated listing walk). Default true.
  autoCrawl?: boolean;
  crawlCadence: string;
  defaultEnabled: boolean;
}

export const KNOWLEDGE_SOURCES: KnowledgeSourceConfig[] = [
  {
    key: "awri",
    publisher: "AWRI",
    homeDomain: "awri.com.au",
    tier: 1,
    license: "Public AWRI industry resource — store paraphrasable text + a link back to the source.",
    seedRoots: [
      "https://www.awri.com.au/industry_support/winemaking_resources/",
      "https://www.awri.com.au/industry_support/viticulture/",
      "https://www.awri.com.au/information_services/fact-sheets/",
    ],
    allowPrefixes: [
      "/industry_support/winemaking_resources/",
      "/industry_support/viticulture/",
      "/information_services/fact-sheets/",
      "/wp-content/uploads/", // the PDF fact sheets, reached by following links from fact-sheet pages
    ],
    denyPrefixes: [
      "/information_services/technical_review/latest_issue/", // paywalled Technical Review (robots-disallowed)
      "/wp-admin/",
      "/cgi-bin/",
      "/tr/",
      "/zoom/",
    ],
    crawlCadence: "weekly",
    defaultEnabled: true,
  },
  {
    key: "wine-australia",
    publisher: "Wine Australia",
    homeDomain: "wineaustralia.com",
    tier: 1,
    license: "Public Wine Australia grower/maker resource — store paraphrasable text + a link back.",
    seedRoots: ["https://www.wineaustralia.com/growing-making"],
    allowPrefixes: ["/growing-making", "/getmedia/"], // getmedia/<guid> serves the fact-sheet PDFs
    denyPrefixes: [],
    crawlCadence: "weekly",
    defaultEnabled: true,
  },
  {
    key: "wsu",
    publisher: "WSU Viticulture & Enology",
    homeDomain: "wine.wsu.edu",
    tier: 1,
    license: "Public WSU Viticulture & Enology extension resource — store paraphrasable text + a link back.",
    // The whole host is viticulture/enology. The substantive articles are ROOT-level slugs (e.g.
    // /managing-high-acidity-in-grape-must-and-wine/), NOT under /extension/, so allow the whole host and
    // deny only WordPress cruft + the beer (brewing-certificate) + non-content program/admin pages.
    seedRoots: ["https://wine.wsu.edu/extension/"],
    sitemapUrls: ["https://wine.wsu.edu/wp-sitemap.xml"], // WordPress core sitemap (non-standard path)
    allowPrefixes: ["/"],
    denyPrefixes: [
      "/wp-admin/",
      "/wp-content/", // theme assets; the real PDFs live under /documents/ (still allowed)
      "/wp-json/",
      "/wp-includes/",
      "/feed/",
      "/comments/",
      "/category/", // thin WordPress taxonomy/author archive pages (self-filter anyway, but skip the fetch)
      "/tag/",
      "/author/",
      "/certificate-program/brewing-certificate/", // beer
      "/news/events/",
      "/shop/",
      "/cart/",
      "/checkout/",
      "/give/",
      "/employment/",
    ],
    crawlCadence: "weekly",
    defaultEnabled: true,
  },
  {
    key: "osu-owri",
    publisher: "Oregon Wine Research Institute (OSU)",
    homeDomain: "ir.library.oregonstate.edu",
    tier: 1,
    license:
      "Oregon Wine Research Institute open-access research (ScholarsArchive@OSU) — reference use with citation + link back.",
    // Operator-directed: the collection LISTING pages (ungated) expose the /downloads/<id> PDF links
    // directly, so scripts/crawl-owri.ts walks the listing and fetches the PDFs — never touching the
    // JS-challenge-gated /concern/ item pages. Our UA (CellarhandKnowledgeBot) is permitted by robots '*'
    // for /collections/ + /downloads/ (the ClaudeBot Disallow is a different, named bot).
    seedRoots: ["https://ir.library.oregonstate.edu/collections/nz806494j"],
    allowPrefixes: ["/collections/", "/downloads/"],
    denyPrefixes: ["/concern/", "/catalog", "/advanced", "/users", "/roles", "/oai", "/files/"],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
  {
    key: "scott-labs",
    publisher: "Scott Laboratories",
    homeDomain: "scottlab.com",
    tier: 2, // VENDOR (product-biased): steers toward the Lallemand/Fermaid/Erbslöh SKUs it sells.
    license:
      "Proprietary Scott Laboratories educational content — store paraphrasable text + a link back; treat product/brand/dosage specifics as vendor-sourced, not independent authority.",
    // Operator-directed: /learn/ articles are bare root slugs intermixed with ~1,400 product pages AND
    // with cider/beer/seltzer/spirits articles — NOT separable by path prefix. scripts/crawl-scott-labs.ts
    // fetches the winemaking handbook PDF + a curated allow-list of WINE article slugs (the cider handbook
    // and beer/cider/spirits articles are deliberately omitted).
    seedRoots: [
      "https://scottlab.com/content/files/documents/handbooks/rev/scott%20laboratories%202025-2026%20winemaking%20handbook%20aug.pdf",
    ],
    allowPrefixes: ["/content/files/documents/handbooks/rev/"],
    denyPrefixes: ["/shop/", "/api/", "/search", "/admin", "/sandbox", "/news", "/cdn-cgi/"],
    autoCrawl: false,
    crawlCadence: "manual",
    defaultEnabled: true,
  },
];

// Domains the crawler may follow links INTO (allowlist-gated cross-domain following). A link to a domain
// NOT listed here is logged to CandidateSource for human promotion, never crawled. Includes www + apex.
export const TRUSTED_DOMAINS: { domain: string; sourceKey?: string }[] = [
  { domain: "awri.com.au", sourceKey: "awri" },
  { domain: "www.awri.com.au", sourceKey: "awri" },
  { domain: "wineaustralia.com", sourceKey: "wine-australia" },
  { domain: "www.wineaustralia.com", sourceKey: "wine-australia" },
  { domain: "wine.wsu.edu", sourceKey: "wsu" },
  { domain: "ir.library.oregonstate.edu", sourceKey: "osu-owri" },
  { domain: "scottlab.com", sourceKey: "scott-labs" },
];

/** Set of trusted hostnames for O(1) gate checks (lowercased). */
export const TRUSTED_DOMAIN_SET: ReadonlySet<string> = new Set(
  TRUSTED_DOMAINS.map((d) => d.domain.toLowerCase()),
);

export function findSourceConfig(key: string): KnowledgeSourceConfig | undefined {
  return KNOWLEDGE_SOURCES.find((s) => s.key === key);
}
