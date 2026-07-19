// Plan 079 — SSRF guard for the crawler (council C8). The crawler is the repo's first privileged network
// fetcher; without these checks an allowlisted domain (or a redirect) that resolves to a private/reserved
// IP could reach internal services. We resolve DNS and reject private/reserved addresses. There is a
// residual TOCTOU gap (DNS could change between check and fetch) accepted for v1 — the crawler is
// human-gated and owner-run; a narrower maintenance role is a documented follow-up (security register).

import { lookup } from "node:dns/promises";
import net from "node:net";

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true; // unparseable -> unsafe
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fe80")) return true; // link-local
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local fc00::/7
  if (s.startsWith("::ffff:")) {
    const tail = s.split(":").pop() ?? "";
    if (tail.includes(".")) return isPrivateIPv4(tail); // IPv4-mapped
  }
  return false;
}

/** True if an IP literal is private/reserved (or unrecognizable). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true; // unknown format -> treat as unsafe
}

/** Throw if the hostname is a private IP literal or resolves (any A/AAAA) to a private/reserved address. */
export async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) throw new Error(`SSRF: refused private IP host ${hostname}`);
    return;
  }
  let addrs: { address: string }[];
  try {
    addrs = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`SSRF: DNS lookup failed for ${hostname}`);
  }
  if (addrs.length === 0) throw new Error(`SSRF: no DNS addresses for ${hostname}`);
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new Error(`SSRF: ${hostname} resolves to private/reserved address ${a.address}`);
    }
  }
}
