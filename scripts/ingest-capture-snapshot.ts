/**
 * Plan 072 Unit 12 STEP 1 (+ the Unit 4 de-risking spike): run the REAL extractor over the actual supplier
 * documents in `docs/invoice examples/` and write each raw result to `qa/ingest-fixtures/<file>.json`.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/ingest-capture-snapshot.ts            # all files
 *   npx tsx --conditions=react-server --env-file=.env scripts/ingest-capture-snapshot.ts "Sales Invoice SIV535475.pdf"  # one (spike)
 *
 * STOP after running — a human must verify every snapshot against the real PDF (docType, vendor, each line's
 * qty/unit/price, lot numbers, currency, shipping) and record sign-off in qa/ingest-fixtures/SNAPSHOT-VERIFIED.md.
 * The VERIFIED snapshots become the source-of-truth fixtures that Units 5/6/7/10 deterministic tests assert
 * against — so the real docs drive the money path, not invented fixtures. Read-only: writes NO DB rows.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { buildDocBlock } from "@/lib/ingest/document-blocks";
import { extractDocument, type ExtractionResult } from "@/lib/ingest/extract-invoice";

const SRC_DIR = "docs/invoice examples";
const OUT_DIR = "qa/ingest-fixtures";

function mimeFor(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

function summarize(r: ExtractionResult): string {
  if (!r.ok) return `  ✗ ${r.fileName}: ${r.error}`;
  const d = r.document;
  const lots = d.lines.map((l) => l.lotNo).filter(Boolean).join(", ") || (d.coa?.lotNo ?? "—");
  const ship = d.charges?.shipping ?? "—";
  return [
    `  ✓ ${r.fileName}`,
    `      docType=${d.docType}  currency=${d.currency ?? "—"}  vendor=${d.vendor?.name ?? "—"}`,
    `      lines=${d.lines.length}  invoice#=${d.invoiceNumber ?? "—"}  total=${d.invoiceTotal ?? "—"}  shipping=${ship}`,
    `      lots=[${lots}]${d.warnings.length ? `  warnings=${JSON.stringify(d.warnings)}` : ""}`,
  ].join("\n");
}

async function main() {
  const only = process.argv[2];
  mkdirSync(OUT_DIR, { recursive: true });
  const files = (only ? [only] : readdirSync(SRC_DIR)).filter((f) => /\.(pdf|png|jpe?g)$/i.test(f));
  if (files.length === 0) {
    console.error(`No documents found in ${SRC_DIR}`);
    process.exit(1);
  }
  console.log(`Extracting ${files.length} document(s) from ${SRC_DIR}\n`);

  for (const file of files) {
    const bytes = readFileSync(join(SRC_DIR, file));
    const mimeType = mimeFor(file);
    const block = buildDocBlock({ contentType: mimeType, bytes });
    const result = await extractDocument({ blobUrl: `local://${file}`, fileName: file, mimeType }, block);
    console.log(summarize(result));
    const outName = basename(file).replace(/\.[^.]+$/, "") + ".json";
    writeFileSync(join(OUT_DIR, outName), JSON.stringify({ _verified: false, source: file, result }, null, 2) + "\n");
  }

  console.log(`\nWrote raw snapshots to ${OUT_DIR}/. NEXT: human-verify each against its PDF, flip _verified:true,`);
  console.log(`and log sign-off in ${OUT_DIR}/SNAPSHOT-VERIFIED.md before trusting them as test fixtures.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
