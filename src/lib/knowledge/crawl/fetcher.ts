// Plan 079 — SSRF-safe conditional GET. Gates the host to the allowlist, resolves + rejects private IPs,
// follows redirects MANUALLY (re-gating each hop so a redirect can't jump off the allowlist or to an
// internal address), caps response size + time, and classifies HTML vs PDF by the Content-Type HEADER
// (with a magic-byte fallback) — never the URL extension (Wine Australia PDFs are getmedia/<guid>?ext=.pdf).

import { assertPublicHost } from "./ssrf";
import { detectChallengePage, type ChallengeInfo } from "./challenge";
import { crawlDispatcher } from "./tls";

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
  /**
   * Plan 085 — set when the body is a WAF/bot-wall interstitial rather than the document. This is
   * REPORTED, never thrown: `scripts/recrawl-knowledge.ts` reads a throw out of this function as
   * "the page was removed" and tombstones the document, so throwing on a transient challenge would
   * mark a whole source's corpus slice `withdrawn`. Callers must skip these BEFORE persisting —
   * each challenge carries a unique incident id, so they defeat the content-hash dedup and would
   * re-embed every month forever.
   */
  challenge: ChallengeInfo | null;
}

/**
 * Plan 085 — a non-2xx response, carrying its status.
 *
 * WHY THE STATUS HAS TO SURVIVE THE THROW: the tombstone pass in scripts/recrawl-knowledge.ts
 * treats a throw from `fetchDocument` as "this page was removed" and sets status:'withdrawn'. That
 * is only true for 404/410. A 403 or 429 (how Imperva and Cloudflare block when they don't serve a
 * 200 interstitial), a 503, a DNS blip, a timeout, or the 15 MB cap are all "could not establish",
 * and withdrawing on those quietly deletes live documents from the corpus.
 */
export class FetchHttpError extends Error {
  constructor(
    readonly status: number,
    url: string,
  ) {
    super(`fetch: HTTP ${status} for ${url}`);
    this.name = "FetchHttpError";
  }
}

/** 404 Gone / 410 Gone are the ONLY statuses that mean "removed". Everything else is unknown. */
export function statusMeansRemoved(e: unknown): boolean {
  return e instanceof FetchHttpError && (e.status === 404 || e.status === 410);
}

export const MAX_BYTES = 15 * 1024 * 1024; // 15 MB
const TIMEOUT_MS = 30_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = "CellarhandKnowledgeBot/1.0 (+winery ERP knowledge base; respects robots.txt)";

export function classifyContentType(rawContentType: string, head: Buffer): DetectedType {
  const ct = rawContentType.toLowerCase();
  if (ct.includes("application/pdf")) return "pdf";
  // Plan 084 — the %PDF- signature beats a text/html header, and must be checked BEFORE it.
  //
  // A five-byte magic number is unambiguous; a Content-Type header is a server config that is routinely
  // wrong (Apache missing an AddType after a migration, IIS static-handler fallthrough, CMS file-delivery
  // endpoints). Previously a genuine PDF served as text/html classified as html — and the soft-404 guard
  // then silently DROPPED it, because "a .pdf URL that returned HTML" is exactly its trigger. Note the
  // shape of the old bug: text/plain and application/octet-stream both recovered via this fallback; the
  // one header that caused data loss was the one that short-circuited before reaching it.
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  if (ct.includes("text/html") || ct.includes("application/xhtml")) return "html";
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
      // `dispatcher` carries the CA bundle from ./tls — Node's roots PLUS intermediates that some
      // publishers fail to send. Without it those hosts throw UNABLE_TO_VERIFY_LEAF_SIGNATURE even
      // though they load fine in a browser (browsers fetch the missing link via AIA; Node does not).
      // Verification is unchanged in every other respect.
      res = await fetch(current, {
        method: "GET",
        headers,
        redirect: "manual",
        signal: controller.signal,
        dispatcher: crawlDispatcher(),
      } as RequestInit);
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 304) {
      return {
        finalUrl: current, status: 304, contentType: "other", rawContentType: "",
        bytes: Buffer.alloc(0), etag: opts.etag ?? null, lastModified: opts.lastModified ?? null, notModified: true,
        challenge: null, // a 304 has no body to inspect
      };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) throw new Error(`fetch: ${res.status} redirect with no Location`);
      current = new URL(loc, current).toString(); // re-gated + re-checked next iteration
      continue;
    }
    if (!res.ok) throw new FetchHttpError(res.status, current);

    const rawContentType = res.headers.get("content-type") ?? "";
    const bytes = await readCapped(res, opts.maxBytes ?? MAX_BYTES);
    return {
      finalUrl: current, status: res.status,
      contentType: classifyContentType(rawContentType, bytes.subarray(0, 512)),
      rawContentType, bytes,
      etag: res.headers.get("etag"), lastModified: res.headers.get("last-modified"), notModified: false,
      // Reported, not thrown — see the FetchResult.challenge docstring. The status here is 200 and
      // the type is text/html, so nothing above this line would have refused it.
      challenge: detectChallengePage(bytes, rawContentType),
    };
  }
  throw new Error(`fetch: too many redirects for ${url}`);
}
