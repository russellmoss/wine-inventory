// Plan 079 — sitemap-first discovery. Fetches sitemap_index.xml, recurses into child sitemaps, and
// returns a flat list of { loc, lastmod }. The lastmod is the cheap first-pass "did this change?" signal
// the re-crawler (Unit 12) uses before issuing a conditional GET. Hand-parsed with fast-xml-parser so we
// keep lastmod (which url-only sitemap libraries drop). Bounded recursion depth.

import { XMLParser } from "fast-xml-parser";
import { fetchDocument } from "./fetcher";

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
}

const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });

async function fetchXml(url: string, isAllowedHost: (h: string) => boolean): Promise<string> {
  const res = await fetchDocument(url, { isAllowedHost });
  return res.notModified ? "" : res.bytes.toString("utf8");
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Resolve a sitemap (index or urlset) to a flat, deduped list of { loc, lastmod }. */
export async function collectSitemapUrls(
  sitemapUrl: string,
  isAllowedHost: (h: string) => boolean,
  depth = 0,
  seen = new Set<string>(),
): Promise<SitemapUrl[]> {
  if (depth > 3 || seen.has(sitemapUrl)) return [];
  seen.add(sitemapUrl);
  let xml: string;
  try {
    xml = await fetchXml(sitemapUrl, isAllowedHost);
  } catch {
    return [];
  }
  if (!xml) return [];
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  const out: SitemapUrl[] = [];

  const index = doc.sitemapindex as { sitemap?: unknown } | undefined;
  for (const child of asArray(index?.sitemap) as { loc?: unknown }[]) {
    if (child?.loc) out.push(...(await collectSitemapUrls(String(child.loc), isAllowedHost, depth + 1, seen)));
  }

  const urlset = doc.urlset as { url?: unknown } | undefined;
  for (const u of asArray(urlset?.url) as { loc?: unknown; lastmod?: unknown }[]) {
    if (u?.loc) out.push({ loc: String(u.loc), lastmod: u.lastmod ? String(u.lastmod) : undefined });
  }
  return out;
}
