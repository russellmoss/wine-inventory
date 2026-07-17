import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { allocateLandedCost, allocatableCharges } from "@/lib/ingest/landed-cost";
import type { ExtractedDocument } from "@/lib/ingest/extract-invoice";

// Plan 072 Unit 12 STEP 2 — deterministic acceptance over the REAL supplier documents in docs/invoice
// examples/, driven from the captured snapshots (qa/ingest-fixtures/*.json). No API key, no DB: this proves
// the classification + the money MATH (charge allocation conservation) on real-doc-derived data every CI run.
// The full DB end-state (apply → lots + A/P) is proven by `npm run verify:ingest`; the gated live extraction
// drift check is `scripts/ingest-live-acceptance.ts`. Once a human signs off the snapshots (_verified:true in
// SNAPSHOT-VERIFIED.md), those become the authoritative fixtures; the structural + math assertions here hold
// regardless of sign-off because they check invariants (conservation, classification), not exact prices.

const DIR = "qa/ingest-fixtures";

type Fixture = { _verified?: boolean; source: string; result: { ok: boolean; error?: string; document?: ExtractedDocument } };

function load(file: string): Fixture {
  return JSON.parse(readFileSync(join(DIR, file), "utf8")) as Fixture;
}

// The plan's acceptance matrix (planning-time human inspection of the PDFs).
const EXPECTED_DOCTYPE: Record<string, ExtractedDocument["docType"]> = {
  "Sales Invoice SIV535475.json": "invoice",
  "Proforma-W583.1869.json": "proforma",
  "2230517_COAFILE_20260714.json": "coa",
  "2025030373_COAFILE_20260714.json": "coa",
  "2240110_COAFILE_20260714.json": "coa",
  "NexaParts General Terms and Conditions B2B.json": "other",
  "crush to cellar.json": "invoice",
  "Laffort test strips.json": "invoice",
};

describe("Unit 12 STEP 2 — real-document acceptance (deterministic)", () => {
  it("all 8 example documents have a captured snapshot", () => {
    for (const f of Object.keys(EXPECTED_DOCTYPE)) {
      expect(existsSync(join(DIR, f)), `missing snapshot ${f}`).toBe(true);
    }
  });

  for (const [file, docType] of Object.entries(EXPECTED_DOCTYPE)) {
    it(`${file} → classified as ${docType}`, () => {
      const fx = load(file);
      expect(fx.result.ok, `extraction failed: ${fx.result.error}`).toBe(true);
      expect(fx.result.document?.docType).toBe(docType);
    });
  }

  it("every invoice/proforma with charges allocates with EXACT conservation (Σ landed = Σ subtotal + charges)", () => {
    for (const file of Object.keys(EXPECTED_DOCTYPE)) {
      const doc = load(file).result.document;
      if (!doc || (doc.docType !== "invoice" && doc.docType !== "proforma")) continue;
      const subtotals = doc.lines.map((l) => (l.lineTotal != null ? l.lineTotal : l.qty != null && l.unitPrice != null ? l.qty * l.unitPrice : null));
      const charges = doc.charges ?? {};
      const alloc = allocateLandedCost(subtotals, charges);
      const knownSubtotal = subtotals.reduce<number>((a, s) => a + (typeof s === "number" && s >= 0 ? s : 0), 0);
      const landedSum = alloc.reduce<number>((a, x) => a + (x.landedLineTotal ?? 0), 0);
      // conservation: within a cent (residual on the last priced line)
      expect(Math.abs(landedSum - (knownSubtotal + allocatableCharges(charges)))).toBeLessThanOrEqual(0.01);
    }
  });

  it("Sales Invoice SIV535475 matches the pinned acceptance matrix (4 lines, USD, lots, shipping, total)", () => {
    const doc = load("Sales Invoice SIV535475.json").result.document!;
    expect(doc.currency).toBe("USD");
    expect(doc.lines).toHaveLength(4);
    expect(doc.invoiceTotal).toBeCloseTo(533.78, 2);
    expect(doc.charges?.shipping).toBeCloseTo(147.99, 2);
    const lots = doc.lines.map((l) => l.lotNo);
    expect(lots).toEqual(expect.arrayContaining(["2230517", "2025030373", "2250423", "2240110"]));
    // line goods subtotal + shipping reconciles to the invoice total
    const subtotal = doc.lines.reduce((a, l) => a + (l.lineTotal ?? 0), 0);
    expect(subtotal + (doc.charges?.shipping ?? 0)).toBeCloseTo(533.78, 1);
  });

  it("Proforma-W583.1869 is EUR and the T&C doc is not a receipt", () => {
    const pf = load("Proforma-W583.1869.json").result.document!;
    expect(pf.currency).toBe("EUR");
    const tc = load("NexaParts General Terms and Conditions B2B.json").result.document!;
    expect(tc.docType).toBe("other");
    expect(tc.lines).toHaveLength(0); // never intaken
  });
});
