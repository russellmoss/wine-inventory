import { describe, it, expect } from "vitest";
import fieldmap from "@/lib/compliance/ttb-5000-24-fieldmap.json";

const fields = fieldmap.fields as Record<string, string>;

describe("ttb-5000-24 fieldmap (plan-026 Unit 7)", () => {
  it("maps the wine tax line + payment lines", () => {
    expect(fields.wineTaxLine10).toBe("Tax.10");
    expect(fields.amountToPay21).toBe("Tax.21");
    expect(fields.paymentAmount).toBe("Payment_Amount");
    expect(fields.adjDecreasing20).toBe("Tax.20");
  });

  it("maps the header + period fields", () => {
    for (const k of ["serialNumber", "employerId", "plantNo", "taxpayerAddress", "dateOnForm", "beginning", "ending"]) {
      expect(fields[k], k).toBeTruthy();
    }
  });

  it("maps the Schedule B CBMA credit cells (col (a) explanation + (b) TAX + total)", () => {
    expect(fields.schedBExplanation).toBe("Item30.a");
    expect(fields.schedBTaxCredit).toBe("Item30.b");
    expect(fields.schedBTotal34).toBe("Item34");
  });

  it("Return_Covers is a PERIOD radio + info mirror fields present", () => {
    expect((fieldmap.radio as Record<string, string>).returnCovers).toBe("Return_Covers");
    expect((fieldmap.radio as Record<string, string>).returnCoversPeriodOption).toBe("PERIOD");
    expect((fieldmap.info as Record<string, string>).employerId).toBe("info.Employer_ID");
  });

  it("has no duplicate field names across the mapped fields", () => {
    const names = Object.values(fields);
    expect(new Set(names).size).toBe(names.length);
  });
});
