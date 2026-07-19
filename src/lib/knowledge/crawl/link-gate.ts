// Plan 079 — allowlist-gated cross-domain link following. Extracts links from crawled HTML; a link into a
// TRUSTED_DOMAIN is followable, anything else is logged to the CandidateSource queue for human promotion
// and NEVER crawled. This is what makes cross-domain following (AWRI -> Wine Australia) safe rather than a
// path to crawling the open web. Uses a regex extractor (no DOM dep here — extraction is Unit 4).

import { TRUSTED_DOMAIN_SET } from "../config";

/** Extract absolute link URLs from an HTML string, resolved against baseUrl. */
export function extractLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = (m[1] ?? "").trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    try {
      out.add(new URL(href, baseUrl).toString());
    } catch {
      /* skip malformed */
    }
  }
  return [...out];
}

export function hostIsTrusted(host: string): boolean {
  return TRUSTED_DOMAIN_SET.has(host.toLowerCase());
}

export interface GatedLinks {
  followable: string[]; // links into trusted domains
  candidateDomains: { domain: string; fromUrl: string }[]; // discovered non-allowlisted domains
}

/** Split extracted links into followable (trusted) vs candidate domains (logged, never crawled). */
export function gateLinks(links: string[], fromUrl: string): GatedLinks {
  const followable: string[] = [];
  const candidates = new Map<string, string>();
  for (const link of links) {
    let host: string;
    try {
      host = new URL(link).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (hostIsTrusted(host)) followable.push(link);
    else if (!candidates.has(host)) candidates.set(host, fromUrl);
  }
  return {
    followable,
    candidateDomains: [...candidates].map(([domain, from]) => ({ domain, fromUrl: from })),
  };
}
