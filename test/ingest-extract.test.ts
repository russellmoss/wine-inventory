import { describe, it, expect } from "vitest";
import { normalizeExtraction } from "@/lib/ingest/extract-invoice";
import { buildDocBlock } from "@/lib/ingest/document-blocks";

// Plan 072 Unit 4: these mock the LLM (fixture JSON) — they prove schema-MAPPING + classification coercion,
// NOT that real PDFs extract. Real-PDF proof lives in Unit 12 (verified snapshots + a gated live run).

describe("normalizeExtraction — classification", () => {
  it("maps each known docType, and an unknown/absent docType falls back to 'other' (never auto-intaken)", () => {
    expect(normalizeExtraction({ docType: "invoice", lines: [] }).docType).toBe("invoice");
    expect(normalizeExtraction({ docType: "proforma", lines: [] }).docType).toBe("proforma");
    expect(normalizeExtraction({ docType: "coa", lines: [] }).docType).toBe("coa");
    expect(normalizeExtraction({ docType: "packing_slip", lines: [] }).docType).toBe("other");
    expect(normalizeExtraction({ lines: [] }).docType).toBe("other");
  });
});

describe("normalizeExtraction — money never fabricated (D14)", () => {
  it("unknown/absent numeric fields stay null, never 0", () => {
    const doc = normalizeExtraction({
      docType: "invoice",
      lines: [{ description: "Yeast EC-1118", qty: 5, unit: "kg", unitPrice: null, lotNo: "2230517" }],
    });
    expect(doc.lines[0].unitPrice).toBeNull();
    expect(doc.lines[0].qty).toBe(5);
    expect(doc.invoiceTotal).toBeNull();
  });

  it("coerces numeric strings (strips currency symbols + thousands separators)", () => {
    const doc = normalizeExtraction({
      docType: "invoice",
      invoiceTotal: "$1,234.56",
      lines: [{ description: "Bentonite", qty: "2", unit: "25 kg", unitPrice: "€40.00" }],
      charges: { shipping: "147.99" },
    });
    expect(doc.invoiceTotal).toBe(1234.56);
    expect(doc.lines[0].qty).toBe(2);
    expect(doc.lines[0].unitPrice).toBe(40);
    expect(doc.charges?.shipping).toBe(147.99);
  });
});

describe("normalizeExtraction — shape + vendor + coa + currency", () => {
  it("extracts vendor, uppercases currency, keeps lot numbers, parses charges + coa", () => {
    const doc = normalizeExtraction({
      docType: "coa",
      vendor: { name: "Scott Laboratories", email: "orders@scottlab.com", address: "Petaluma, CA" },
      currency: "usd",
      coa: { lotNo: "2230517", expiry: "2027-05-01", batch: "B-12" },
      lines: [],
    });
    expect(doc.vendor?.name).toBe("Scott Laboratories");
    expect(doc.vendor?.email).toBe("orders@scottlab.com");
    expect(doc.currency).toBe("USD");
    expect(doc.coa).toEqual({ lotNo: "2230517", expiry: "2027-05-01", batch: "B-12" });
  });

  it("drops fully-empty line rows but keeps partial ones; collects warnings", () => {
    const doc = normalizeExtraction({
      docType: "invoice",
      warnings: ["mixed currency", 42, "illegible lot"],
      lines: [
        { description: "" },
        { description: "Tannin", qty: 1 },
        { description: "", qty: null, unitPrice: 9.5 },
      ],
    });
    expect(doc.lines).toHaveLength(2); // the fully-empty row dropped; the price-only row kept
    expect(doc.warnings).toEqual(["mixed currency", "illegible lot"]); // non-strings filtered
  });

  it("vendor with no name → null (can't intake a nameless vendor)", () => {
    expect(normalizeExtraction({ docType: "invoice", vendor: { address: "x" }, lines: [] }).vendor).toBeNull();
  });
});

describe("buildDocBlock", () => {
  const pdf = Buffer.from("%PDF-1.7\n...body...");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  it("builds a native document block for a PDF", () => {
    const b = buildDocBlock({ contentType: "application/pdf", bytes: pdf });
    expect(b?.type).toBe("document");
    expect(b && b.type === "document" && b.source.media_type).toBe("application/pdf");
  });

  it("builds an image block for PNG/JPEG", () => {
    expect(buildDocBlock({ contentType: "image/png", bytes: png })?.type).toBe("image");
    expect(buildDocBlock({ contentType: "image/jpeg", bytes: png })?.type).toBe("image");
  });

  it("returns null for unsupported types and empty/oversize bytes", () => {
    expect(buildDocBlock({ contentType: "text/plain", bytes: pdf })).toBeNull();
    expect(buildDocBlock({ contentType: "application/pdf", bytes: Buffer.alloc(0) })).toBeNull();
    expect(buildDocBlock({ contentType: "application/pdf", bytes: pdf }, { maxPdfBytes: 2 })).toBeNull();
  });
});
