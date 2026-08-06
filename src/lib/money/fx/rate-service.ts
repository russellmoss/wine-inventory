// Plan 073 — the dated FX-rate service: the ONE place the app resolves a base-per-foreign rate. Read-through
// the global `fx_rate` cache (one DB row per base/quote/effective-date) with an L1 in-memory memo, then the
// Frankfurter feed on a miss. NEVER fabricates a rate: same-currency short-circuits to 1.0 (no fetch); a
// true feed miss returns a typed { ok:false } so the caller fails loud (D14), never $0 or 1.0.
//
// Rate direction: BASE per 1 FOREIGN (== HOME per 1 FOREIGN when base=home) — the QBO ExchangeRate
// convention. We fetch Frankfurter base=<foreign>, symbols=<home> so the number needs no inversion.
//
// Dates: the ingest timestamp is normalized to the CET calendar day (ECB publishes ~16:00 CET) BEFORE the
// lookup, so a late-day PST ingest can't ask for "tomorrow's" European rate (council #6). The cache row is
// keyed by that effective date; the feed's ACTUAL quote date (prior business day for a weekend) is returned
// as `rateDate` for the lot's audit trail.

import { prisma } from "@/lib/prisma";
import { fetchFrankfurterRate, type FrankfurterDeps } from "@/lib/money/fx/frankfurter";
import { FxQuote } from "@/lib/money/fx/quote";

export type ResolvedRate =
  | {
      ok: true;
      rate: number;
      rateDate: Date;
      source: string;
      /** The rate as an EXACT decimal string, when the source can give one (the `fx_rate` Decimal column,
       *  or the feed's own text). `rate` is a float for the legacy callers; this is what `getQuote` uses so
       *  the quote never depends on a float round-trip. Optional so injected test stubs stay valid. */
      rateExact?: string;
    }
  | { ok: false; reason: string };

export type RateServiceDeps = FrankfurterDeps & {
  /** injectable clock for the CET normalization in tests (defaults to `at`). */
};

// L1 process memo keyed by base|quote|effectiveDate — collapses repeat lookups within one request/script.
const memo = new Map<string, ResolvedRate>();

/** Reset the in-memory memo (tests only — the DB cache is the durable layer). */
export function __resetFxMemo(): void {
  memo.clear();
}

/** The CET (Europe/Berlin) calendar date, "YYYY-MM-DD", for an instant — the ECB publication day. */
export function cetEffectiveDate(at: Date): string {
  // en-CA formats as YYYY-MM-DD; Europe/Berlin carries CET/CEST DST automatically.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** "YYYY-MM-DD" → a UTC-midnight Date, the storage shape for a Prisma @db.Date column. */
function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

/**
 * Resolve `base` per 1 `foreign` as of the instant `at` (normalized to the CET day). Order: same-currency
 * short-circuit → memo → `fx_rate` DB cache → Frankfurter (then upsert). A feed miss returns { ok:false }.
 *
 * NOTE the argument order: `getRate(base, foreign, at)` returns BASE per 1 FOREIGN. Internally we fetch
 * Frankfurter with base=foreign, symbols=base so the raw number already IS base-per-foreign.
 */
export async function getRate(
  base: string,
  foreign: string,
  at: Date,
  deps: RateServiceDeps = {},
): Promise<ResolvedRate> {
  const effective = cetEffectiveDate(at);

  // Same currency: rate is exactly 1.0, no cache, no fetch.
  if (base === foreign) {
    return { ok: true, rate: 1, rateDate: dateOnly(effective), source: "same-currency" };
  }

  const key = `${base}|${foreign}|${effective}`;
  const cached = memo.get(key);
  if (cached) return cached;

  const effectiveDate = dateOnly(effective);

  // DB cache (global fx_rate — passes through the tenant extension untouched).
  const row = await prisma.fxRate.findUnique({
    where: { base_quote_rateDate: { base: foreign, quote: base, rateDate: effectiveDate } },
  });
  if (row) {
    const hit: ResolvedRate = {
      ok: true,
      rate: Number(row.rate),
      rateExact: row.rate.toString(),
      rateDate: effectiveDate,
      source: row.source,
    };
    memo.set(key, hit);
    return hit;
  }

  // Miss → hit the feed (base=foreign, symbols=base ⇒ number is base-per-foreign).
  const fetched = await fetchFrankfurterRate(foreign, base, effective, deps);
  if (!fetched.ok) {
    const miss: ResolvedRate = { ok: false, reason: fetched.reason };
    // Do NOT memo a miss — a later retry (or a manual override) should be able to resolve.
    return miss;
  }

  // Upsert keyed by the EFFECTIVE date (the cache key) so repeat lookups hit; the feed's actual quote date
  // (fetched.rateDate) is what we RETURN for the lot audit trail.
  await prisma.fxRate
    .upsert({
      where: { base_quote_rateDate: { base: foreign, quote: base, rateDate: effectiveDate } },
      create: { base: foreign, quote: base, rateDate: effectiveDate, rate: fetched.rate.toString(), source: fetched.source },
      update: {}, // first writer wins; a concurrent upsert is a no-op (same ECB rate)
    })
    .catch(() => {
      // A concurrent insert can race the unique — the read path still returns the fetched value below.
    });

  const actualRateDate = /^\d{4}-\d{2}-\d{2}$/.test(fetched.rateDate) ? dateOnly(fetched.rateDate) : effectiveDate;
  const resolved: ResolvedRate = {
    ok: true,
    rate: fetched.rate,
    rateExact: String(fetched.rate),
    rateDate: actualRateDate,
    source: fetched.source,
  };
  memo.set(key, resolved);
  return resolved;
}

/** A resolved rate promoted to an `FxQuote` — currency-tagged, so conversion can refuse a mismatch. */
export type ResolvedQuote = { ok: true; quote: FxQuote } | { ok: false; reason: string };

/** The `getRate` signature, as injected by `ApplyDeps` and the verify stubs. */
export type RateResolver = (base: string, foreign: string, at: Date) => Promise<ResolvedRate>;

/**
 * `getRate`, then promoted to an `FxQuote`. THIS is what callers doing arithmetic should use — the bare
 * number cannot say what currency it is in, and `FxQuote.convert` refuses an Amount that isn't in the
 * quote's foreign currency (MONEY-1).
 *
 * `resolve` is injectable so the ingest path can keep passing its deterministic stub. A stub that omits
 * `rateExact` falls back to the float, which is exactly as good as the stub's own input.
 *
 * An unsupported currency code raises here rather than defaulting to USD — `FxQuote.of` parses strictly.
 * That is a THROW, not an `{ ok: false }`, because it means the caller passed a code it never validated,
 * which is a bug and not a feed miss.
 */
export async function getQuote(
  base: string,
  foreign: string,
  at: Date,
  deps: RateServiceDeps = {},
  resolve: RateResolver = (b, f, t) => getRate(b, f, t, deps),
): Promise<ResolvedQuote> {
  const resolved = await resolve(base, foreign, at);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  return {
    ok: true,
    quote: FxQuote.of({
      base,
      foreign,
      rate: resolved.rateExact ?? resolved.rate,
      rateDate: resolved.rateDate,
      source: resolved.source,
    }),
  };
}
