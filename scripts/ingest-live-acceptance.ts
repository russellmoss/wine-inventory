/**
 * Plan 072 Unit 12 STEP 3 — gated LIVE acceptance. Re-extract the 8 real documents in docs/invoice examples/
 * and assert TOLERANT invariants against the captured snapshot (qa/ingest-fixtures/*.json): docType exact,
 * currency + line-count + lot-numbers exact, prices within a small tolerance. Catches extraction DRIFT without
 * brittle exact-match on every field. Needs ANTHROPIC_API_KEY; run before ship + on model changes, NOT in the
 * fast CI path.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/ingest-live-acceptance.ts
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { buildDocBlock } from "@/lib/ingest/document-blocks";
import { extractDocument, type ExtractedDocument } from "@/lib/ingest/extract-invoice";

const SRC = "docs/invoice examples";
const FIX = "qa/ingest-fixtures";
const PRICE_TOL = 0.02; // 2% price drift tolerance

type Snap = { result: { ok: boolean; document?: ExtractedDocument } };

let failures = 0;
function check(cond: boolean, msg: string) {
  console.log(`  ${cond ? "✓" : "✗"} ${msg}`);
  if (!cond) failures++;
}
function mimeFor(n: string) {
  return n.toLowerCase().endsWith(".pdf") ? "application/pdf" : n.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}
const sortedLots = (d: ExtractedDocument) => d.lines.map((l) => l.lotNo).filter(Boolean).sort();

async function main() {
  const files = readdirSync(SRC).filter((f) => /\.(pdf|png|jpe?g)$/i.test(f));
  for (const file of files) {
    const snapFile = join(FIX, basename(file).replace(/\.[^.]+$/, "") + ".json");
    if (!existsSync(snapFile)) {
      console.log(`\n${file}: no snapshot — run ingest-capture-snapshot.ts first`);
      failures++;
      continue;
    }
    const snap = (JSON.parse(readFileSync(snapFile, "utf8")) as Snap).result.document;
    const bytes = readFileSync(join(SRC, file));
    const block = buildDocBlock({ contentType: mimeFor(file), bytes });
    const live = await extractDocument({ blobUrl: `local://${file}`, fileName: file, mimeType: mimeFor(file) }, block);

    console.log(`\n${file}`);
    if (!live.ok || !snap) {
      check(false, `extracted + snapshot present (${live.ok ? "no snapshot doc" : live.error})`);
      continue;
    }
    const d = live.document;
    check(d.docType === snap.docType, `docType ${d.docType} == snapshot ${snap.docType}`);
    check((d.currency ?? null) === (snap.currency ?? null), `currency ${d.currency} == ${snap.currency}`);
    check(d.lines.length === snap.lines.length, `line count ${d.lines.length} == ${snap.lines.length}`);
    check(JSON.stringify(sortedLots(d)) === JSON.stringify(sortedLots(snap)), `lot numbers match`);
    // price tolerance on invoiceTotal
    if (snap.invoiceTotal != null && d.invoiceTotal != null) {
      const drift = Math.abs(d.invoiceTotal - snap.invoiceTotal) / Math.max(1, snap.invoiceTotal);
      check(drift <= PRICE_TOL, `invoiceTotal ${d.invoiceTotal} within ${PRICE_TOL * 100}% of ${snap.invoiceTotal} (drift ${(drift * 100).toFixed(1)}%)`);
    }
  }
  console.log(`\n${failures === 0 ? "LIVE ACCEPTANCE PASSED ✓" : `LIVE ACCEPTANCE FAILED — ${failures} invariant(s) drifted`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
