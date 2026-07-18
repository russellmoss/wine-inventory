// Plan 073 — the Frankfurter (ECB) FX client. Keyless, free, ECB reference rates, historical-by-date.
// Mirrors the qbo/client.ts shape: injectable `fetchImpl` + full-jitter backoff on 429/5xx + a PURE parse.
// It NEVER fabricates a rate — a failure returns a typed { ok:false }, never a silent 1.0 (D14). The rate
// is returned exactly as the feed gives it: quote per 1 base (fetch base=<foreign>, symbols=<home> so the
// number is HOME per 1 FOREIGN — the QBO ExchangeRate convention, no inversion, council #5).
//
// API: GET https://api.frankfurter.dev/v1/{YYYY-MM-DD}?base={base}&symbols={quote}
//   → { "amount":1.0, "base":"EUR", "date":"2024-06-14", "rates": { "USD": 1.0712 } }
// `date` in the response is the date the feed ACTUALLY used — for a weekend/holiday it is the prior
// business day; the caller stores that as the audit rate-date.

export type FrankfurterDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
};

export type FrankfurterResult =
  | { ok: true; rate: number; rateDate: string; source: string }
  | { ok: false; reason: string };

const BASE_URL = "https://api.frankfurter.dev/v1";
const SOURCE = "ECB via Frankfurter";
const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 400;
const BACKOFF_CAP_MS = 6000;

/** Fetch the ECB rate of 1 `base` in `quote` for `date` (YYYY-MM-DD). Typed result; never throws for a
 *  well-formed miss (returns { ok:false }). `date` MUST already be the CET effective date (rate-service). */
export async function fetchFrankfurterRate(
  base: string,
  quote: string,
  date: string,
  deps: FrankfurterDeps = {},
): Promise<FrankfurterResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;

  const url = `${BASE_URL}/${date}?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(quote)}`;

  let lastReason = "unknown";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { headers: { Accept: "application/json" }, redirect: "error" });
    } catch (e) {
      lastReason = `network error: ${e instanceof Error ? e.message : String(e)}`;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleep(backoffMs(attempt, random));
        continue;
      }
      return { ok: false, reason: lastReason };
    }

    if (res.ok) {
      const parsed = parseRate(await res.json().catch(() => null), quote);
      return parsed ?? { ok: false, reason: `no ${quote} rate in response for ${date}` };
    }

    // 429 / 5xx are transient → back off + retry; other 4xx are terminal (bad date/currency).
    if ((res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS - 1) {
      lastReason = `HTTP ${res.status}`;
      await sleep(backoffMs(attempt, random));
      continue;
    }
    return { ok: false, reason: `HTTP ${res.status}` };
  }
  return { ok: false, reason: lastReason };
}

/** PURE: pull the quote rate out of a Frankfurter response body. null when the shape/rate is missing or
 *  non-positive (a zero/NaN rate is a miss, never fabricated). Exported for direct unit testing. */
export function parseRate(body: unknown, quote: string): { ok: true; rate: number; rateDate: string; source: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { date?: unknown; rates?: unknown };
  const rates = b.rates as Record<string, unknown> | undefined;
  const rate = rates ? Number(rates[quote]) : NaN;
  const rateDate = typeof b.date === "string" ? b.date : "";
  if (!Number.isFinite(rate) || rate <= 0 || !rateDate) return null;
  return { ok: true, rate, rateDate, source: SOURCE };
}

function backoffMs(attempt: number, random: () => number): number {
  const capped = Math.min(BACKOFF_CAP_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.floor(capped * random()); // full jitter
}
