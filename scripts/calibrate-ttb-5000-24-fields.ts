/**
 * plan-026 Unit 7 — build/verify the committed field map for TTB F 5000.24sm (the wine excise return).
 *
 * Unlike the 5120.17 (a positional a–f × line grid needing clustering), the 5000.24 AcroForm uses
 * SEMANTIC field names (Tax.10, Serial_Number, Employer_ID, Return_Covers, Item30.*, …), so this
 * script is a verifier: it loads the pypdf-normalized fillable copy, asserts every name the fill uses
 * exists (no silent drift on a form-version bump — risk R3), and re-emits the committed JSON. The raw
 * TTB PDF is NOT pdf-lib-loadable (object-stream/xref quirk — risk R2); normalize it first with pypdf
 * (see docs/ttb-5000-24/README.md), then run this against the normalized copy.
 *
 * Run: npx tsx scripts/calibrate-ttb-5000-24-fields.ts
 */
import { PDFDocument } from "pdf-lib";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const PDF_PATH = join(ROOT, "docs/ttb-5000-24/TTB-5000.24-fillable.pdf");
const OUT_PATH = join(ROOT, "src/lib/compliance/ttb-5000-24-fieldmap.json");

// The map the fill uses (Unit 8). Combo A: line 10 = GROSS wine tax; the CBMA small-producer credit
// is a Schedule B decreasing adjustment (col (b) TAX) → line 34 → line 20; line 21 = amount to pay.
const FIELDS = {
  wineTaxLine10: "Tax.10", // line 10 WINE — gross wine excise tax
  totalTaxLiability17: "Tax.17", // line 17 TOTAL TAX LIABILITY (wine-only: == line 10)
  adjIncreasing18: "Tax.18", // line 18 (from Schedule A line 29)
  grossDue19: "Tax.19", // line 19 GROSS AMOUNT DUE (17 + 18)
  adjDecreasing20: "Tax.20", // line 20 (from Schedule B line 34) — the CBMA credit
  amountToPay21: "Tax.21", // line 21 AMOUNT TO BE PAID (19 − 20) — the net
  paymentAmount: "Payment_Amount",
  serialNumber: "Serial_Number",
  employerId: "Employer_ID",
  plantNo: "Plant_No",
  taxpayerAddress: "Taxpayer_Address",
  dateOnForm: "Date_On_Form",
  beginning: "Beginning", // return-period start (Return_Covers = PERIOD)
  ending: "Ending", // return-period end
  schedBExplanation: "Item30.a", // Schedule B line 30 col (a) — explanation text
  schedBTaxCredit: "Item30.b", // Schedule B line 30 col (b) TAX — the CBMA credit $
  schedBSubtotalTax: "Item33.b", // line 33 subtotal of col (b)
  schedBTotal34: "Item34", // line 34 TOTAL decreasing → line 20
} as const;

// Radio/checkbox + the "REQUIRED! …" scaffolding mirror/hint fields (cleared at fill, like the 5120.17
// info.* fields) so the hint text doesn't print. pdf-lib can't run the form's own clearing script.
const RADIO = { returnCovers: "Return_Covers", returnCoversPeriodOption: "PERIOD" } as const;
const INFO = {
  employerId: "info.Employer_ID",
  plantNo: "info.Plant_No",
  serialNumber: "info.Serial_Number",
  dateOnForm: "info.Date_On_Form",
  title: "info.Title",
} as const;
const REQ_CLEAR = ["req.Beginning", "req.Ending", "req.Other", "req.Product_Removal_Date"] as const;

async function main() {
  const doc = await PDFDocument.load(readFileSync(PDF_PATH), { ignoreEncryption: true });
  const form = doc.getForm();
  const names = new Set(form.getFields().map((f) => f.getName()));

  const missing: string[] = [];
  const check = (name: string) => {
    if (!names.has(name)) missing.push(name);
  };
  Object.values(FIELDS).forEach(check);
  check(RADIO.returnCovers);
  Object.values(INFO).forEach(check);
  // req.* are optional (present only on some revisions) — clear when present, don't fail if absent.

  const map = {
    source: "TTB-5000.24-fillable.pdf",
    generatedNote: "committed artifact — do not hand-edit; regenerate via scripts/calibrate-ttb-5000-24-fields.ts",
    fields: FIELDS,
    radio: RADIO,
    info: INFO,
    reqClear: REQ_CLEAR.filter((n) => names.has(n)),
  };
  writeFileSync(OUT_PATH, JSON.stringify(map, null, 2) + "\n");

  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Fields mapped: ${Object.keys(FIELDS).length}; info mirrors: ${Object.keys(INFO).length}; req-clear present: ${map.reqClear.length}`);
  console.log(`Return_Covers options: ${(form.getRadioGroup(RADIO.returnCovers).getOptions() ?? []).join(", ")}`);
  if (missing.length) {
    console.error(`\n❌ MISSING FIELDS (form drift — fix the map or re-normalize): ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("\n✅ every mapped field exists in the normalized PDF.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
