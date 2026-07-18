// Plan 079 — the curated trusted-source registry. This is the MOAT and the crawl boundary: the crawler
// only fetches sources listed here, and only follows links INTO domains in TRUSTED_DOMAINS. Adding a
// source later is a config edit (re-run scripts/seed-knowledge-sources.ts), not code. AWRI is source #1,
// Wine Australia #2 (queued: UC Davis, Oregon State, Washington State, Cornell).

export interface KnowledgeSourceConfig {
  key: string;
  publisher: string;
  homeDomain: string;
  tier: number; // 1 = peer-reviewed / official extension
  license: string;
  seedRoots: string[];
  allowPrefixes: string[]; // path prefixes permitted (matched on URL pathname)
  denyPrefixes: string[]; // path prefixes refused (paywalled / robots-disallowed)
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
];

// Domains the crawler may follow links INTO (allowlist-gated cross-domain following). A link to a domain
// NOT listed here is logged to CandidateSource for human promotion, never crawled. Includes www + apex.
export const TRUSTED_DOMAINS: { domain: string; sourceKey?: string }[] = [
  { domain: "awri.com.au", sourceKey: "awri" },
  { domain: "www.awri.com.au", sourceKey: "awri" },
  { domain: "wineaustralia.com", sourceKey: "wine-australia" },
  { domain: "www.wineaustralia.com", sourceKey: "wine-australia" },
];

/** Set of trusted hostnames for O(1) gate checks (lowercased). */
export const TRUSTED_DOMAIN_SET: ReadonlySet<string> = new Set(
  TRUSTED_DOMAINS.map((d) => d.domain.toLowerCase()),
);

export function findSourceConfig(key: string): KnowledgeSourceConfig | undefined {
  return KNOWLEDGE_SOURCES.find((s) => s.key === key);
}
