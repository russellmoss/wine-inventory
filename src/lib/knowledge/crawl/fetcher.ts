// Plan 079 — SSRF-safe conditional GET. Gates the host to the allowlist, resolves + rejects private IPs,
// follows redirects MANUALLY (re-gating each hop so a redirect can't jump off the allowlist or to an
// internal address), caps response size + time, and classifies HTML vs PDF by the Content-Type HEADER
// (with a magic-byte fallback) — never the URL extension (Wine Australia PDFs are getmedia/<guid>?ext=.pdf).

import { assertPublicHost } from "./ssrf";

export type DetectedType = "html" | "pdf" | "other";

export interface FetchResult {
  finalUrl: string;
  status: number;
  contentType: DetectedType;
  rawContentType: string;
  bytes: Buffer;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

export const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "CellarhandKnowledgeBot/1.0 (+winery ERP knowledge base; respects robots.txt)";

export function classifyContentType(rawContentType: string, head: Buffer): DetectedType {
  const ct = rawContentType.toLowerCase();
  if (ct.includes("application/pdf")) return "pdf";
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return "html";
  // magic-byte fallback (header missing or wrong)
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (/^\s*(<!doctype html|<html)/i.test(head.subarray(0, 256).toString("utf8"))) return "html";
  return "other";
}

async function readCapped(res: Response, maxBytes: number): Promise<Buffer> {
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`fetch: response exceeds ${maxBytes} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
  }
  return Buffer.concat(chunks);
}

/**
 * SSRF-safe conditional GET. `isAllowedHost` gates the initial URL AND every redirect hop. Pass the
 * document's stored etag/lastModified to get a cheap 304 (notModified) when nothing changed.
 */
export async function fetchDocument(
  url: string,
  opts: {
    etag?: string | null;
    lastModified?: string | null;
    isAllowedHost: (host: string) => boolean;
    // Override the default 15 MB read cap (SSRF/DoS guard) for a specific operator-directed fetch of a
    // known-large document (e.g. the 62 MB MAPA IPM guide). Defaults to MAX_BYTES.
    maxBytes?: number;
  },
): Promise<FetchResult> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const u = new URL(current);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      throw new Error(`fetch: refused protocol ${u.protocol}`);
    }
    if (!opts.isAllowedHost(u.hostname.toLowerCase())) {
      throw new Error(`fetch: host ${u.hostname} is not allowlisted`);
    }
    await assertPublicHost(u.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      const headers: Record<string, string> = {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/pdf,*/*",
      };
      if (opts.etag) headers["If-None-Match"] = opts.etag;
      if (opts.lastModified) headers["If-Modified-Since"] = opts.lastModified;
      res = await fetch(current, { method: "GET", headers, redirect: "manual", signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 304) {
      return {
        finalUrl: current, status: 304, contentType: "other", rawContentType: "",
        bytes: Buffer.alloc(0), etag: opts.etag ?? null, lastModified: opts.lastModified ?? null, notModified: true,
      };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`fetch: ${res.status} redirect with no Location`);
      current = new URL(loc, current).toString(); // re-gated + re-checked next iteration
      continue;
    }
    if (!res.ok) throw new Error(`fetch: HTTP ${res.status} for ${current}`);

    const rawContentType = res.headers.get("content-type") ?? "";
    const bytes = await readCapped(res, opts.maxBytes ?? MAX_BYTES);
    return {
      finalUrl: current, status: res.status,
      contentType: classifyContentType(rawContentType, bytes.subarray(0, 512)),
      rawContentType, bytes,
      etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"), notModified: false,
    };
  }
  throw new Error(`fetch: too many redirects for ${url}`);
}
