import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fillTtbPdf } from "@/lib/compliance/fill-pdf";
import type { ComputedSnapshot } from "@/lib/compliance/generate";

const snapshot: ComputedSnapshot = {
  cells: [
    { section: "A", line: 2, column: "A_LE16", sub: null, gallons: 264.17 },
    { section: "A", line: 13, column: "A_LE16", sub: null, gallons: 105.67 },
    { section: "A", line: 14, column: "A_LE16", sub: null, gallons: 26.42 },
    { section: "A", line: 31, column: "A_LE16", sub: null, gallons: 129.44 },
    { section: "B", line: 2, column: "A_LE16", sub: null, gallons: 105.67 },
    { section: "B", line: 20, column: "A_LE16", sub: null, gallons: 105.67 },
  ],
  footings: [{ section: "A", column: "A_LE16", sub: null, addSideTotal: 264.17, removeSideTotal: 264.17, foots: true }],
  balanced: true,
  a13EqualsB2: true,
  partX: [],
  perLot: [],
  needsAbvLotIds: [],
};

describe("fillTtbPdf (Unit 10) — round-trip", () => {
  it("fills the form and the re-read values equal the snapshot", async () => {
    const { bytes, unmappedCells } = await fillTtbPdf({
      computed: snapshot,
      periodStart: new Date("2026-06-01T00:00:00Z"),
      periodEnd: new Date("2026-06-30T00:00:00Z"),
      cadence: "MONTHLY",
      version: "ORIGINAL",
      isFinalBusinessReport: false,
      remarks: "Test remarks.",
      profile: { ein: "12-3456789", registryNumber: "BWN-CA-99999", operatedBy: "Test Winery" },
    });
    expect(bytes.length).toBeGreaterThan(1000);
    expect(unmappedCells).toEqual([]); // every snapshot cell had a mapped field

    // Re-read the filled AcroForm.
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    expect(form.getTextField("a1.13").getText()).toBe("105.67"); // §A bottled
    expect(form.getTextField("a2.2").getText()).toBe("105.67"); // §B bottled (== A13, ftn 3)
    expect(form.getTextField("a1.31").getText()).toBe("129.44"); // §A on hand end
    expect(form.getTextField("YEAR").getText()).toBe("2026");
    expect(form.getTextField("EIN").getText()).toBe("12-3456789");
    expect(form.getTextField("REMARKS").getText()).toBe("Test remarks.");
  });
});

// Sanity: the committed fillable PDF exists and is a real AcroForm.
describe("fillable PDF asset", () => {
  it("loads with the expected grid fields", async () => {
    const bytes = readFileSync(join(process.cwd(), "docs/ttb-5120-17/TTB-5120.17-fillable.pdf"));
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const names = doc.getForm().getFields().map((f) => f.getName());
    expect(names).toContain("a1.13");
    expect(names).toContain("a2.2");
    expect(names).toContain("YEAR");
  });
});
