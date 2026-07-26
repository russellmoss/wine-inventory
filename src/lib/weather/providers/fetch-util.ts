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
    throw new ProviderFetchError(providerKey, "http", `HTTP ${res.status} from ${url}`);
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
