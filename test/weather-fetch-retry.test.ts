import { afterEach, describe, expect, it } from "vitest";
import { fetchJsonRetry, isRetryableFetchError, retryDelayMs } from "@/lib/weather/providers/fetch-util";
import { ProviderFetchError } from "@/lib/weather/providers/types";

// Plan 096 U24 — retry with backoff on the FORECAST fetch path. Transient-only: network/timeout,
// 429, 5xx retry; a 404 (the NWS coverage signal) falls through INSTANTLY; parse never retries.

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function fetchSequence(responses: Array<number | "netfail">): { calls: () => number } {
  let i = 0;
  globalThis.fetch = (async () => {
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r === "netfail") throw new Error("socket hang up");
    return new Response(r === 200 ? "{\"ok\":true}" : "err", { status: r });
  }) as typeof fetch;
  return { calls: () => i };
}

describe("isRetryableFetchError", () => {
  it("timeout/429/5xx retry; other 4xx and parse do not", () => {
    expect(isRetryableFetchError(new ProviderFetchError("nws", "timeout", "x"))).toBe(true);
    expect(isRetryableFetchError(new ProviderFetchError("nws", "http", "x", 429))).toBe(true);
    expect(isRetryableFetchError(new ProviderFetchError("nws", "http", "x", 503))).toBe(true);
    expect(isRetryableFetchError(new ProviderFetchError("nws", "http", "x", 404))).toBe(false); // coverage signal — instant fallthrough
    expect(isRetryableFetchError(new ProviderFetchError("nws", "http", "x", 400))).toBe(false);
    expect(isRetryableFetchError(new ProviderFetchError("nws", "parse", "x"))).toBe(false);
    expect(isRetryableFetchError(new Error("random"))).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("doubles per attempt with deterministic jitter; 429/503 get the NWS ~5s floor", () => {
    expect(retryDelayMs(1)).toBe(1000 + 137);
    expect(retryDelayMs(2)).toBe(2000 + 24); // (2*137)%250
    expect(retryDelayMs(1, 429)).toBe(5000 + 137);
    expect(retryDelayMs(1, 503)).toBe(5000 + 137);
    expect(retryDelayMs(1, 500)).toBe(1000 + 137); // plain 5xx keeps the base
  });
});

describe("fetchJsonRetry", () => {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };

  it("fail(503) → fail(net) → succeed: two retries, both slept", async () => {
    sleeps.length = 0;
    const seq = fetchSequence([503, "netfail", 200]);
    const out = await fetchJsonRetry("nws", "https://api.weather.gov/points/1,1", { sleep });
    expect(out).toEqual({ ok: true });
    expect(seq.calls()).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[0]).toBe(5000 + 137); // 503 floor
  });

  it("a 404 throws IMMEDIATELY — no retry, no sleep", async () => {
    sleeps.length = 0;
    const seq = fetchSequence([404, 200]);
    await expect(fetchJsonRetry("nws", "https://api.weather.gov/points/1,1", { sleep })).rejects.toThrow(/HTTP 404/);
    expect(seq.calls()).toBe(1);
    expect(sleeps).toHaveLength(0);
  });

  it("exhausted retries rethrow the last transient fault", async () => {
    sleeps.length = 0;
    const seq = fetchSequence([503, 503, 503, 200]);
    await expect(fetchJsonRetry("open_meteo", "https://api.open-meteo.com/v1/forecast", { retries: 2, sleep })).rejects.toThrow(/HTTP 503/);
    expect(seq.calls()).toBe(3); // initial + 2 retries — never a fourth
    expect(sleeps).toHaveLength(2);
  });
});
