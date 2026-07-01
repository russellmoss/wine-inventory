/**
 * Unit 9 — build the committed line×column→AcroForm-field map for the TTB F 5120.17.
 *
 * The normalized fillable PDF (docs/ttb-5120-17/TTB-5120.17-fillable.pdf, produced once by pypdf from
 * the encrypted original) has a SEMANTIC grid naming: `{col}{block}.{line}` where col ∈ a..f,
 * block 1 = §A (bulk), block 2 = §B (bottled). Columns a–f are mapped straight from the name. Column
 * e (sparkling) has an irregular BF/BP split, so its cells are mapped by POSITION: each e-field is
 * clustered to the nearest §-line row (using the a-column field y as the row reference) and, when two
 * e-fields share a row, the higher one is BF and the lower BP. Header fields are mapped by their
 * (already semantic) names.
 *
 * Emits src/lib/compliance/ttb-5120-17-fieldmap.json (committed) and prints anchor cells for a human
 * spot-check against docs/ttb-5120-17/page-1.png / page-2.png. Runtime never re-derives this.
 *
 * Run: npx tsx scripts/calibrate-ttb-fields.ts
 */
import { PDFDocument } from "pdf-lib";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PDF_PATH = join(ROOT, "docs/ttb-5120-17/TTB-5120.17-fillable.pdf");
const OUT_PATH = join(ROOT, "src/lib/compliance/ttb-5120-17-fieldmap.json");

const A_LINES = 32; // §A lines 1..31 + 32 total
const B_LINES = 21; // §B lines 1..20 + 21 total
const COLS = ["a", "b", "c", "d", "f"] as const; // e handled separately (BF/BP split)

type Widget = { name: string; page: number; x: number; y: number };

async function main() {
  const doc = await PDFDocument.load(readFileSync(PDF_PATH), { ignoreEncryption: true });
  const pages = doc.getPages();
  const form = doc.getForm();
  const widgets: Widget[] = [];
  const names = new Set<string>();
  for (const f of form.getFields()) {
    names.add(f.getName());
    for (const w of f.acroField.getWidgets()) {
      const r = w.getRectangle();
      let page = -1;
      for (let i = 0; i < pages.length; i++) if (pages[i].ref === w.P()) page = i;
      widgets.push({ name: f.getName(), page, x: Math.round(r.x), y: Math.round(r.y) });
    }
  }

  const cells: Record<string, string> = {};
  const missing: string[] = [];

  // Columns a–f (no sub): trust the naming convention where the field exists.
  const put = (section: "A" | "B", line: number, col: string, field: string) => {
    if (names.has(field)) cells[`${section}.${line}.${col}`] = field;
  };
  for (const col of COLS) {
    for (let line = 1; line <= A_LINES; line++) put("A", line, col, `${col}1.${line}`);
    for (let line = 1; line <= B_LINES; line++) put("B", line, col, `${col}2.${line}`);
  }

  // Row reference: the y of each a-column line field (per section, per page).
  const rowY = (section: "A" | "B", line: number): { y: number; page: number } | null => {
    const nm = `a${section === "A" ? 1 : 2}.${line}`;
    const w = widgets.find((x) => x.name === nm);
    return w ? { y: w.y, page: w.page } : null;
  };

  // Column e (sparkling): assign each e-field to its SINGLE nearest §-line row (argmin |Δy| on the
  // same page), so no field is double-claimed. Then per line: 1 field → single; 2 → BF (upper) / BP.
  const eFor = (section: "A" | "B") => {
    const block = section === "A" ? 1 : 2;
    const efields = widgets.filter((w) => new RegExp(`^e${block}\\.`).test(w.name));
    const refs: { line: number; y: number; page: number }[] = [];
    const lines = section === "A" ? A_LINES : B_LINES;
    for (let line = 1; line <= lines; line++) {
      const r = rowY(section, line);
      if (r) refs.push({ line, y: r.y, page: r.page });
    }
    const byLine = new Map<number, Widget[]>();
    for (const w of efields) {
      let best: { line: number; d: number } | null = null;
      for (const r of refs) {
        if (r.page !== w.page) continue;
        const d = Math.abs(w.y - r.y);
        if (!best || d < best.d) best = { line: r.line, d };
      }
      if (!best || best.d > 20) continue; // beyond a row height → not a grid cell
      if (!byLine.has(best.line)) byLine.set(best.line, []);
      byLine.get(best.line)!.push(w);
    }
    for (const [line, ws] of byLine) {
      ws.sort((p, q) => q.y - p.y); // higher y first = BF
      if (ws.length === 1) cells[`${section}.${line}.e`] = ws[0].name;
      else {
        cells[`${section}.${line}.e.BF`] = ws[0].name;
        cells[`${section}.${line}.e.BP`] = ws[1].name;
      }
    }
  };
  eFor("A");
  eFor("B");

  // Header + version fields (semantic names).
  const header: Record<string, string> = {};
  const headerCandidates: Record<string, string[]> = {
    year: ["YEAR"],
    month: ["MONTH"],
    ein: ["EIN"],
    registry: ["REGISTRY_NUMBER"],
    operatedBy: ["OPERATED_BY"],
    proprietor: ["PROPRIETOR"],
    date: ["DATE"],
    remarks: ["REMARKS"],
  };
  for (const [k, opts] of Object.entries(headerCandidates)) {
    const found = opts.find((o) => names.has(o));
    if (found) header[k] = found;
    else missing.push(`header.${k}`);
  }

  const map = { source: "TTB-5120.17-fillable.pdf", generatedNote: "committed artifact — do not hand-edit; regenerate via scripts/calibrate-ttb-fields.ts", header, cells };
  writeFileSync(OUT_PATH, JSON.stringify(map, null, 2));

  // Report.
  const cellCount = Object.keys(cells).length;
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Header fields: ${Object.keys(header).length} (${Object.keys(header).join(", ")})`);
  console.log(`Grid cells mapped: ${cellCount}`);
  if (missing.length) console.log(`MISSING: ${missing.join(", ")}`);
  console.log("\nAnchor cells for visual spot-check (vs page-1.png / page-2.png):");
  for (const k of ["A.1.a", "A.2.a", "A.13.a", "A.14.a", "A.31.a", "A.32.a", "B.1.a", "B.2.a", "B.8.a", "B.20.a", "B.21.a", "A.13.e.BF", "A.13.e.BP"]) {
    console.log(`  ${k} -> ${cells[k] ?? "(none)"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
