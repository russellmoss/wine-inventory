/**
 * Plan 073 Unit 2 — GATED live Frankfurter fetch (real network, kept out of the fast/CI path).
 *
 *   npx tsx scripts/verify-fx-live.ts
 *
 * Hits the real ECB feed for a fixed historical date (EUR→USD) and asserts a sane, positive rate in a
 * plausible band. Does NOT touch the DB (calls the client directly), so it needs no tenant/DB context —
 * just outbound network. Skips gracefully (exit 0) if the network is unavailable.
 */
import { fetchFrankfurterRate } from "@/lib/money/fx/frankfurter";

async function main() {
  // 12 Jun 2026 is arbitrary-but-fixed; any TARGET business day works. EUR→USD has sat ~0.9–1.6 for decades.
  const r = await fetchFrankfurterRate("EUR", "USD", "2026-06-12");
  if (!r.ok) {
    console.log(`SKIP - live Frankfurter unreachable (${r.reason}); the deterministic verify:fx still gates.`);
    process.exit(0);
  }
  if (!(r.rate > 0.5 && r.rate < 2.5)) throw new Error(`FAIL: EUR→USD rate ${r.rate} outside a sane band`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.rateDate)) throw new Error(`FAIL: bad rateDate ${r.rateDate}`);
  console.log(`  ok - live EUR→USD = ${r.rate} @ ${r.rateDate} (${r.source})`);
  console.log("\nLIVE FX FETCH OK ✓");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
