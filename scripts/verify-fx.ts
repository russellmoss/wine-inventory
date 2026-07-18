/**
 * Plan 073 Unit 2 — DB-backed proof for the FX rate service, run against Neon (fx_rate is GLOBAL — no
 * tenant context needed).
 *
 *   npm run verify:fx
 *
 * Proves the read-through cache with a STUBBED feed (deterministic, no real network): same-currency
 * short-circuit (no fetch), first-miss fetch + upsert, L1 memo hit, DB hit after a memo reset, the
 * weekend actual-rate-date passthrough, and a typed miss that is NOT cached and writes no row. Uses
 * sentinel currency codes + a sentinel source so cleanup can't touch real cache rows; cleans up before
 * AND after.
 */
import { prisma } from "@/lib/prisma";
import { getRate, __resetFxMemo, cetEffectiveDate } from "@/lib/money/fx/rate-service";

const BASE = "XBASE"; // sentinel home code (never a real ISO code)
const FGN = "XFGN"; // sentinel foreign code
// The feed tags every row with its real provenance ("ECB via Frankfurter") — the stub can't change that —
// so cleanup keys on the sentinel currency PAIR, which can never collide with a real cache row.

let passed = 0;
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  console.log(`  ok - ${msg}`);
  passed++;
}

async function cleanup() {
  await prisma.fxRate.deleteMany({ where: { base: FGN, quote: BASE } });
}

/** A counting stubbed feed that returns a fixed rate + a controllable actual quote date. */
function stubFeed(rate: number, actualDate: string) {
  const state = { calls: 0 };
  const fetchImpl = (async () => {
    state.calls++;
    return { ok: true, status: 200, json: async () => ({ date: actualDate, rates: { [BASE]: rate } }) } as unknown as Response;
  }) as unknown as typeof fetch;
  return { state, deps: { fetchImpl, sleep: async () => {}, random: () => 0.5 } };
}

function missFeed() {
  const state = { calls: 0 };
  const fetchImpl = (async () => {
    state.calls++;
    return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
  return { state, deps: { fetchImpl, sleep: async () => {}, random: () => 0.5 } };
}

async function main() {
  await cleanup();
  __resetFxMemo();

  // 1) Same-currency short-circuits to 1.0 with NO fetch.
  {
    const feed = stubFeed(9.99, "2026-06-12");
    const r = await getRate(BASE, BASE, new Date("2026-06-12T12:00:00Z"), feed.deps);
    assert(r.ok && r.rate === 1, "same-currency → rate 1.0");
    assert(feed.state.calls === 0, "same-currency made no feed call");
  }

  // 2) First lookup misses the cache → one fetch → returns the rate → upserts a row.
  const at = new Date("2026-06-12T12:00:00Z"); // a Friday, CET date == 2026-06-12
  const feed1 = stubFeed(1.085, "2026-06-12");
  {
    const r = await getRate(BASE, FGN, at, feed1.deps);
    assert(r.ok && r.rate === 1.085, "first lookup returns the fetched rate (1.085)");
    assert(feed1.state.calls === 1, "first lookup made exactly one feed call");
    const row = await prisma.fxRate.findUnique({
      where: { base_quote_rateDate: { base: FGN, quote: BASE, rateDate: new Date("2026-06-12T00:00:00.000Z") } },
    });
    assert(row != null && Number(row.rate) === 1.085 && row.source === "ECB via Frankfurter", "upserted a fx_rate row keyed by the effective date");
  }

  // 3) Second identical lookup is served from the L1 memo → NO further fetch.
  {
    const r = await getRate(BASE, FGN, at, feed1.deps);
    assert(r.ok && r.rate === 1.085, "memo hit returns the same rate");
    assert(feed1.state.calls === 1, "memo hit made no additional feed call");
  }

  // 4) After a memo reset, the same lookup is served from the DB cache → still NO fetch.
  {
    __resetFxMemo();
    const feed2 = stubFeed(2.222, "2026-06-12"); // a DIFFERENT rate proves we read the cache, not the feed
    const r = await getRate(BASE, FGN, at, feed2.deps);
    assert(r.ok && r.rate === 1.085, "DB cache hit returns the ORIGINAL cached rate, not the feed's new one");
    assert(feed2.state.calls === 0, "DB cache hit made no feed call");
  }

  // 5) Weekend: request a Saturday; the feed's ACTUAL quote date is the prior Friday → that's what the
  //    service returns for the lot audit trail (the cache row is keyed by the Saturday effective date).
  {
    __resetFxMemo();
    const satAt = new Date("2026-06-13T12:00:00Z"); // Saturday
    const satEffective = cetEffectiveDate(satAt); // "2026-06-13"
    const feed = stubFeed(1.09, "2026-06-12"); // ECB actual = prior Friday
    const r = await getRate(BASE, FGN, satAt, feed.deps);
    assert(r.ok && r.rate === 1.09, "weekend lookup resolves the prior-business-day rate");
    assert(r.ok && r.rateDate.toISOString().slice(0, 10) === "2026-06-12", "weekend returns the ACTUAL ECB quote date (prior Friday)");
    const row = await prisma.fxRate.findUnique({
      where: { base_quote_rateDate: { base: FGN, quote: BASE, rateDate: new Date(`${satEffective}T00:00:00.000Z`) } },
    });
    assert(row != null, "weekend cached under the effective (Saturday) date");
  }

  // 6) A feed miss returns a typed { ok:false }, is NOT memoized, and writes no row (fail loud, never $0).
  {
    __resetFxMemo();
    const missAt = new Date("2026-06-15T12:00:00Z"); // Monday, fresh date
    const miss = missFeed();
    const r = await getRate(BASE, FGN, missAt, miss.deps);
    assert(!r.ok, "feed miss → typed { ok:false } (never a fabricated rate)");
    const row = await prisma.fxRate.findUnique({
      where: { base_quote_rateDate: { base: FGN, quote: BASE, rateDate: new Date("2026-06-15T00:00:00.000Z") } },
    });
    assert(row == null, "feed miss wrote no cache row");
    // A retry with a working feed still resolves (the miss was not memoized).
    const ok = stubFeed(1.07, "2026-06-15");
    const r2 = await getRate(BASE, FGN, missAt, ok.deps);
    assert(r2.ok && ok.state.calls === 1, "retry after a miss re-fetches and resolves");
  }

  await cleanup();
  console.log(`\nALL FX SERVICE CHECKS PASSED ✓  (${passed} assertions)`);
}

main()
  .catch(async (e) => {
    console.error(e instanceof Error ? e.message : e);
    await cleanup().catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
