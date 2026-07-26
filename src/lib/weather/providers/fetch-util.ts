// VI-P8 — the impure fetch edge, shared by all adapters. SSRF-guarded (fixed host, no redirects off-allowlist),
// size-bounded, timed out. Never on a render path. A failure throws ProviderFetchError — never a partial record.

import { assertAllowedHost, FETCH_TIMEOUT_MS, MAX_RESPONSE_BYTES, WEATHER_USER_AGENT } from "../config";
import { ProviderFetchError, type WeatherSourceKey } from "./types";

export async function fetchJson(providerKey: WeatherSourceKey, url: string, init?: RequestInit): Promise<unknown> {
  const text = await fetchText(providerKey, url, init);
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderFetchError(providerKey, "parse", `non-JSON response from ${url}`);
  }
}

export async function fetchText(providerKey: WeatherSourceKey, url: string, init?: RequestInit): Promise<string> {
  assertAllowedHost(providerKey, url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // User-Agent on EVERY request (plan 096 U4 — NWS 403s without one); caller headers may extend, not remove.
  const headers = { "User-Agent": WEATHER_USER_AGENT, ...(init?.headers as Record<string, string> | undefined) };
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers, signal: controller.signal, redirect: "manual" });
  } catch (e) {
    throw new ProviderFetchError(providerKey, "timeout", `fetch failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
  // Reject any redirect (SSRF): a 3xx would send us off the allowlisted host.
  if (res.status >= 300 && res.status < 400) {
    throw new ProviderFetchError(providerKey, "redirect", `refused redirect (${res.status}) from ${url}`);
  }
  if (!res.ok) {
    throw new ProviderFetchError(providerKey, "http", `HTTP ${res.status} from ${url}`, res.status);
  }
  const body = await res.text();
  if (body.length > MAX_RESPONSE_BYTES) {
    throw new ProviderFetchError(providerKey, "oversized", `response ${body.length}B exceeds cap`);
  }
  if (body.length === 0) {
    throw new ProviderFetchError(providerKey, "empty", `empty response from ${url}`);
  }
  return body;
}

/** POST JSON body (RCC-ACIS accepts params as a JSON body or as ?params=). */
export async function postJson(providerKey: WeatherSourceKey, url: string, params: unknown): Promise<unknown> {
  return fetchJson(providerKey, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

/** ISO YYYY-MM-DD → compact YYYYMMDD (NASA POWER). */
export function isoToCompact(iso: string): string {
  return iso.replace(/-/g, "");
}

// ────────────────────────── Plan 096 U24 — retry with backoff (FORECAST path only) ──────────────────────────
// The observation ingest keeps its no-retry behavior (daily cadence absorbs a transient miss); a
// forecast miss is a user-visible blank strip until the next 6-hour run, so its fetches retry.
// Policy: retry TRANSIENT faults only — network/timeout, 429, 5xx. Never other 4xx (a 404 is the
// NWS coverage signal and must fall through to Open-Meteo immediately) and never parse/oversized
// (deterministic). NWS documents "retry after ~5 s" on rate-limit → 429/503 get a 5 s floor.

/** PURE: delay before retry `attempt` (1-based). Deterministic pseudo-jitter (tests need no clock). */
export function retryDelayMs(attempt: number, status?: number, baseMs = 1000): number {
  const floor = status === 429 || status === 503 ? 5000 : baseMs;
  return floor * 2 ** (attempt - 1) + ((attempt * 137) % 250);
}

/** PURE: is this fault worth retrying? */
export function isRetryableFetchError(e: unknown): boolean {
  if (!(e instanceof ProviderFetchError)) return false;
  if (e.reason === "timeout") return true;
  if (e.reason === "http") return e.status === 429 || (e.status !== undefined && e.status >= 500);
  return false;
}

/**
 * fetchJson with up to `retries` re-attempts on transient faults. The forecast adapters default to
 * this; everything else stays on the bare fetchJson.
 */
export async function fetchJsonRetry(
  providerKey: WeatherSourceKey,
  url: string,
  opts: { retries?: number; baseMs?: number; init?: RequestInit; sleep?: (ms: number) => Promise<void> } = {},
): Promise<unknown> {
  const retries = opts.retries ?? 2;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchJson(providerKey, url, opts.init);
    } catch (e) {
      lastError = e;
      if (attempt === retries || !isRetryableFetchError(e)) throw e;
      const status = e instanceof ProviderFetchError ? e.status : undefined;
      await sleep(retryDelayMs(attempt + 1, status, opts.baseMs));
    }
  }
  throw lastError; // unreachable — the loop throws on its last attempt
}
