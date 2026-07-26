/**
 * Spray S2 Unit 3 — streaming bulk-file download for the pesticide sources. `fetchDocument` is the
 * wrong tool here: it buffers via readCapped and is shaped for documents entering the corpus, and the
 * APPRIL dump is 98 MB. What IS reused: the SSRF guard, the crawl TLS dispatcher (spreads
 * tls.rootCertificates — never rejectUnauthorized:false), and the 404-is-a-coverage-signal rule
 * (plan 096: a 404 is never retried).
 */

import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { assertPublicHost } from "@/lib/knowledge/crawl/ssrf";
import { crawlDispatcher } from "@/lib/knowledge/crawl/tls";

/** Explicit allowlist for the pesticide bulk sources — a host outside this set is refused. */
export const PESTICIDE_BULK_HOSTS: ReadonlySet<string> = new Set(["www3.epa.gov", "files.cdpr.ca.gov"]);

const MAX_REDIRECTS = 3;
const DEFAULT_MAX_BYTES = 256 * 1024 * 1024; // the APPRIL dump is ~98 MB; headroom, not open-ended
const TIMEOUT_MS = 10 * 60 * 1000;

export type BulkFetchResult =
  | { ok: true; path: string; lastModified: Date | null; bytes: number }
  /** 404/410 — a coverage signal (the source moved or was withdrawn), NEVER a retry. */
  | { ok: false; reason: "gone"; status: number }
  | { ok: false; reason: "http-error"; status: number };

export async function fetchBulkFile(
  url: string,
  opts: { destPath: string; maxBytes?: number },
): Promise<BulkFetchResult> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:") throw new Error(`bulk-fetch: refused protocol ${u.protocol}`);
    const host = u.hostname.toLowerCase();
    if (!PESTICIDE_BULK_HOSTS.has(host)) throw new Error(`bulk-fetch: host ${host} is not allowlisted`);
    await assertPublicHost(host);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "cellarhand-pesticide-ingest/1.0" },
        // @ts-expect-error undici dispatcher option — same pattern as knowledge/crawl/fetcher.ts
        dispatcher: crawlDispatcher(),
      });

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return { ok: false, reason: "http-error", status: res.status };
        current = new URL(loc, current).toString();
        continue; // next hop re-runs the allowlist + SSRF checks
      }
      if (res.status === 404 || res.status === 410) return { ok: false, reason: "gone", status: res.status };
      if (res.status !== 200 || res.body == null) return { ok: false, reason: "http-error", status: res.status };

      let bytes = 0;
      const capped = Readable.fromWeb(res.body as import("stream/web").ReadableStream).map((chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new Error(`bulk-fetch: response exceeds ${maxBytes} bytes`);
        return chunk;
      });
      try {
        await pipeline(capped, createWriteStream(opts.destPath));
      } catch (err) {
        await unlink(opts.destPath).catch(() => undefined); // never leave a truncated file behind
        throw err;
      }

      const lm = res.headers.get("last-modified");
      const lastModified = lm ? new Date(lm) : null;
      return {
        ok: true,
        path: opts.destPath,
        lastModified: lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : null,
        bytes,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`bulk-fetch: too many redirects for ${url}`);
}
