/**
 * Phase 15 Unit 11 — prove the moat behavior: a D6 correction posts a REVERSING entry that nets to
 * zero, as a mirror-image (debit/credit swapped, positive QBO amounts), dated to the CURRENT OPEN
 * PERIOD (never the corrected op's original date). Runs offline against the pure builders, so it is a
 * always-runnable gate; the live sandbox net-zero round-trip is in `npm run verify:accounting` (U14).
 *
 *   npm run verify:accounting-reversal
 */
import { buildExportLines, accountKey, type AccountMap } from "@/lib/cost/export";
import { buildJournalFromExport, toTxnDate } from "@/lib/accounting/qbo/journal";

let passed = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT FAILED: ${msg}`);
  console.log(`  ✓ ${msg}`);
  passed++;
}

const MAP: AccountMap = new Map([[accountKey("FRUIT", null), { debit: "5000-COGS", credit: "1400-Inventory" }]]);

function main() {
  console.log("── D6 correction → current-period reversing journal (net zero) ──");

  const original = buildExportLines(
    { postingKey: "cogs:run9:sku9:-", componentBreakdown: { FRUIT: 300 }, taxClass: null, currency: "USD", basisCompleteness: "KNOWN" },
    MAP,
  );
  const reversal = buildExportLines(
    { postingKey: "cogs:run9:sku9:-", componentBreakdown: { FRUIT: 300 }, taxClass: null, currency: "USD", basisCompleteness: "KNOWN", isReversal: true },
    MAP,
  );
  assert(original.postable && reversal.postable, "both original and reversal are postable");

  const o = original.lines[0];
  const r = reversal.lines[0];
  assert(r.postingKey === `${o.postingKey}:rev`, "reversal carries the :rev idempotency suffix");
  assert(Math.abs(o.amount + r.amount) < 1e-9, `original + reversal net to ZERO (${o.amount} + ${r.amount})`);

  // Post-time: today = the current open period (never the corrected op's original observedAt).
  const openPeriod = new Date();
  const oJe = buildJournalFromExport({ ...o }, openPeriod);
  const rJe = buildJournalFromExport({ ...r }, openPeriod);
  assert(rJe.txnDate === toTxnDate(openPeriod), "the reversal posts to the current open period");

  // The reversal JE is the MIRROR of the original: debit/credit swapped, amounts still positive.
  assert(oJe.lines[0].posting === "Debit" && oJe.lines[0].accountKey === "5000-COGS", "original debits COGS");
  assert(rJe.lines[0].posting === "Debit" && rJe.lines[0].accountKey === "1400-Inventory", "reversal debits Inventory (mirror-image)");
  assert(oJe.lines.every((l) => l.amount > 0) && rJe.lines.every((l) => l.amount > 0), "all QBO amounts are positive (QBO rejects negatives)");

  console.log(`\nALL ${passed} REVERSAL ASSERTIONS PASSED`);
  process.exit(0);
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
