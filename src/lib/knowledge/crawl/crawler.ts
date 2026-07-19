// Plan 079 — crawler orchestrator. Per source: discover URLs (sitemap + seed roots) -> filter to
// allow/deny prefixes -> per-URL robots check + per-host politeness throttle -> SSRF-safe conditional GET
// -> content-hash dedup into the identity split (KnowledgeBlob = bytes, KnowledgeDocument = logical doc,
// KnowledgeUrlObservation = alias) -> gate outbound links (candidates queued, never crawled). Extraction +
// chunk/embed are NOT here (Units 4/5): the optional onDocument hook hands the fetched bytes to that
// pipeline in the same pass. Writes go through runAsSystem (owner) — these are GLOBAL tables.

import crypto from "node:crypto";
import { runAsSystem } from "@/lib/tenant/system";
import { findSourceConfig, TRUSTED_DOMAIN_SET, type KnowledgeSourceConfig } from "../config";
import { collectSitemapUrls, type SitemapUrl } from "./sitemap";
import { isAllowedByRobots, getCrawlDelayMs } from "./robots";
import { fetchDocument, type DetectedType, type FetchResult } from "./fetcher";
import { extractLinks, gateLinks } from "./link-gate";

const DEFAULT_DELAY_MS = 1500; // polite default between requests to one host
const isAllowedHost = (h: string) => TRUSTED_DOMAIN_SET.has(h.toLowerCase());

export interface CrawledDoc {
  documentId: string;
  sourceId: string;
  sourceKey: string;
  canonicalUrl: string;
  contentType: DetectedType;
  contentHash: string;
  bytes: Buffer;
}

export interface CrawlSummary {
  source: string;
  discovered: number;
  fetched: number;
  documents: number;
  notModified: number;
  skippedRobots: number;
  skippedType: number;
  errors: number;
  candidates: number;
}

/** Per-host politeness gate (min delay between requests to one host). Replaces p-queue. */
class HostThrottle {
  private last = new Map<string, number>();
  async wait(host: string, minDelayMs: number): Promise<void> {
    const prev = this.last.get(host) ?? 0;
    const waitMs = Math.max(0, prev + minDelayMs - Date.now());
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
    this.last.set(host, Date.now());
  }
}

function pathAllowed(cfg: KnowledgeSourceConfig, url: string): boolean {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  if (cfg.denyPrefixes.some((p) => path.startsWith(p))) return false;
  return cfg.allowPrefixes.some((p) => path.startsWith(p));
}

export async function crawlSource(
  sourceKey: string,
  opts: { maxDocs?: number; onDocument?: (doc: CrawledDoc) => Promise<void> } = {},
): Promise<CrawlSummary> {
  const cfg = findSourceConfig(sourceKey);
  if (!cfg) throw new Error(`unknown source: ${sourceKey}`);
  const maxDocs = opts.maxDocs ?? 50;
  const summary: CrawlSummary = {
    source: sourceKey, discovered: 0, fetched: 0, documents: 0,
    notModified: 0, skippedRobots: 0, skippedType: 0, errors: 0, candidates: 0,
  };
  const throttle = new HostThrottle();

  const sourceRow = await runAsSystem((db) => db.knowledgeSource.findUnique({ where: { key: sourceKey } }));
  if (!sourceRow) throw new Error(`source ${sourceKey} not seeded — run: npm run seed:knowledge-sources`);
  const sourceId = sourceRow.id;

  // 1. Discover: sitemap(s) at the seed origin + the seed roots themselves.
  const seedOrigin = new URL(cfg.seedRoots[0]).origin;
  let sitemapUrls: SitemapUrl[] = [];
  for (const sm of [`${seedOrigin}/sitemap_index.xml`, `${seedOrigin}/sitemap.xml`]) {
    sitemapUrls = await collectSitemapUrls(sm, isAllowedHost);
    if (sitemapUrls.length) break;
  }

  const seen = new Set<string>();
  const queue: { url: string; lastmod?: string }[] = [];
  for (const root of cfg.seedRoots) {
    if (!seen.has(root)) { seen.add(root); queue.push({ url: root }); }
  }
  for (const su of sitemapUrls) {
    if (!seen.has(su.loc) && pathAllowed(cfg, su.loc)) {
      seen.add(su.loc);
      queue.push({ url: su.loc, lastmod: su.lastmod });
    }
  }
  summary.discovered = queue.length;

  // 2. Fetch loop (bounded by maxDocs).
  const candidateDomains = new Map<string, string>();
  let processed = 0;
  for (const item of queue) {
    if (processed >= maxDocs) break;
    let host: string;
    try {
      host = new URL(item.url).host;
    } catch {
      continue;
    }

    // robots
    let robotsOk = true;
    try {
      robotsOk = await isAllowedByRobots(item.url, isAllowedHost);
    } catch {
      robotsOk = true; // fail-open on a robots fetch error (denyPrefixes still hard-block)
    }
    if (!robotsOk) { summary.skippedRobots++; continue; }

    // politeness
    const origin = new URL(item.url).origin;
    const delay = Math.max(DEFAULT_DELAY_MS, await getCrawlDelayMs(origin, isAllowedHost).catch(() => 0));
    await throttle.wait(host, delay);

    // conditional GET against the stored doc's validators
    const existing = await runAsSystem((db) =>
      db.knowledgeDocument.findUnique({
        where: { sourceId_canonicalUrl: { sourceId, canonicalUrl: item.url } },
        select: { id: true, etag: true, lastModifiedHttp: true },
      }),
    );

    let res;
    try {
      res = await fetchDocument(item.url, {
        etag: existing?.etag ?? null,
        lastModified: existing?.lastModifiedHttp ?? null,
        isAllowedHost,
      });
    } catch {
      summary.errors++;
      continue;
    }
    processed++;
    summary.fetched++;

    if (res.notModified) {
      summary.notModified++;
      if (existing) {
        await runAsSystem((db) =>
          db.knowledgeDocument.update({
            where: { id: existing.id },
            data: { lastVerifiedAt: new Date(), lastSeenAt: new Date() },
          }),
        );
      }
      continue;
    }
    if (res.contentType === "other") { summary.skippedType++; continue; }

    const contentHash = crypto.createHash("sha256").update(res.bytes).digest("hex");
    const document = await persistDocument(sourceId, cfg, item.url, item.lastmod, res, contentHash);
    summary.documents++;

    // outbound links (HTML only): gate to trusted domains, log the rest as candidates
    if (res.contentType === "html") {
      const gated = gateLinks(extractLinks(res.bytes.toString("utf8"), res.finalUrl), res.finalUrl);
      for (const c of gated.candidateDomains) {
        if (!candidateDomains.has(c.domain)) candidateDomains.set(c.domain, c.fromUrl);
      }
    }

    // hand the fetched bytes to the extraction/chunk/embed pipeline (Units 4/5), same pass
    if (opts.onDocument) {
      await opts.onDocument({
        documentId: document.id, sourceId, sourceKey, canonicalUrl: item.url,
        contentType: res.contentType, contentHash, bytes: res.bytes,
      });
    }
  }

  // persist discovered candidate domains for human promotion
  for (const [domain, fromUrl] of candidateDomains) {
    await runAsSystem((db) =>
      db.candidateSource.upsert({
        where: { domain },
        update: { lastSeenAt: new Date(), timesSeen: { increment: 1 } },
        create: { domain, discoveredFromUrl: fromUrl },
      }),
    );
  }
  summary.candidates = candidateDomains.size;
  return summary;
}

/** Upsert the identity-split rows for one fetched document (shared by crawlSource + crawlUrls). */
async function persistDocument(
  sourceId: string,
  cfg: KnowledgeSourceConfig,
  url: string,
  lastmod: string | undefined,
  res: FetchResult,
  contentHash: string,
) {
  return runAsSystem(async (db) => {
    const blob = await db.knowledgeBlob.upsert({
      where: { contentHash },
      update: {},
      create: { contentHash, contentType: res.rawContentType || res.contentType, byteSize: res.bytes.length },
    });
    const doc = await db.knowledgeDocument.upsert({
      where: { sourceId_canonicalUrl: { sourceId, canonicalUrl: url } },
      update: {
        blobId: blob.id, contentType: res.contentType, etag: res.etag, lastModifiedHttp: res.lastModified,
        sitemapLastmod: lastmod ? new Date(lastmod) : null,
        lastSeenAt: new Date(), lastVerifiedAt: new Date(), retrievedAt: new Date(), status: "active",
      },
      create: {
        sourceId, canonicalUrl: url, blobId: blob.id, publisher: cfg.publisher, tier: cfg.tier,
        license: cfg.license, contentType: res.contentType, etag: res.etag, lastModifiedHttp: res.lastModified,
        sitemapLastmod: lastmod ? new Date(lastmod) : null,
      },
    });
    for (const u of new Set([url, res.finalUrl])) {
      await db.knowledgeUrlObservation.upsert({
        where: { url: u },
        update: { lastSeenAt: new Date() },
        create: { documentId: doc.id, url: u },
      });
    }
    return doc;
  });
}

/**
 * Crawl a SPECIFIC list of URLs through the same fetch/dedup/persist pipeline. Bypasses sitemap discovery
 * + allow-prefix filtering (the host allowlist + robots + SSRF still apply), so it can reach linked PDFs
 * (e.g. AWRI /wp-content fact sheets) that aren't in the sitemap. Used by the eval harness for targeted
 * coverage of the eval-question pages.
 */
export async function crawlUrls(
  sourceKey: string,
  urls: string[],
  opts: { onDocument?: (doc: CrawledDoc) => Promise<void> } = {},
): Promise<CrawlSummary> {
  const cfg = findSourceConfig(sourceKey);
  if (!cfg) throw new Error(`unknown source: ${sourceKey}`);
  const summary: CrawlSummary = {
    source: sourceKey, discovered: urls.length, fetched: 0, documents: 0,
    notModified: 0, skippedRobots: 0, skippedType: 0, errors: 0, candidates: 0,
  };
  const throttle = new HostThrottle();
  const sourceRow = await runAsSystem((db) => db.knowledgeSource.findUnique({ where: { key: sourceKey } }));
  if (!sourceRow) throw new Error(`source ${sourceKey} not seeded — run: npm run seed:knowledge-sources`);
  const sourceId = sourceRow.id;

  for (const url of urls) {
    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      continue;
    }
    if (!isAllowedHost(new URL(url).hostname.toLowerCase())) {
      summary.errors++;
      continue;
    }
    let robotsOk = true;
    try {
      robotsOk = await isAllowedByRobots(url, isAllowedHost);
    } catch {
      robotsOk = true;
    }
    if (!robotsOk) { summary.skippedRobots++; continue; }
    const delay = Math.max(DEFAULT_DELAY_MS, await getCrawlDelayMs(new URL(url).origin, isAllowedHost).catch(() => 0));
    await throttle.wait(host, delay);

    const existing = await runAsSystem((db) =>
      db.knowledgeDocument.findUnique({
        where: { sourceId_canonicalUrl: { sourceId, canonicalUrl: url } },
        select: { id: true, etag: true, lastModifiedHttp: true },
      }),
    );
    let res;
    try {
      res = await fetchDocument(url, { etag: existing?.etag ?? null, lastModified: existing?.lastModifiedHttp ?? null, isAllowedHost });
    } catch {
      summary.errors++;
      continue;
    }
    summary.fetched++;
    if (res.notModified) {
      summary.notModified++;
      if (existing) {
        await runAsSystem((db) =>
          db.knowledgeDocument.update({ where: { id: existing.id }, data: { lastVerifiedAt: new Date(), lastSeenAt: new Date() } }),
        );
      }
      continue;
    }
    if (res.contentType === "other") { summary.skippedType++; continue; }

    const contentHash = crypto.createHash("sha256").update(res.bytes).digest("hex");
    const document = await persistDocument(sourceId, cfg, url, undefined, res, contentHash);
    summary.documents++;
    if (opts.onDocument) {
      await opts.onDocument({
        documentId: document.id, sourceId, sourceKey, canonicalUrl: url,
        contentType: res.contentType, contentHash, bytes: res.bytes,
      });
    }
  }
  return summary;
}
