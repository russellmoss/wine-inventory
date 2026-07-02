import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { fillExcisePdf } from "@/lib/compliance/fill-5000-24-pdf";
import type { ExciseComputed } from "@/lib/compliance/excise";

// A synthetic period: 10,000 gal class a removed, YTD start 25,000 → straddles the 30k tier.
//   gross = 10,000 × $1.07 = $10,700
//   credit: 5,000 @ $1.00 (to 30k) + 5,000 @ $0.90 = 5,000 + 4,500 = $9,500
//   net (amount to pay) = 10,700 − 9,500 = $1,200
const computed: ExciseComputed = {
  formType: "TTB_5000_24",
  classRows: [{ taxClass: "A_LE16", gallons: 10_000, rate: 1.07, grossTax: 10_700, cbmaCredit: 9_500, netTax: 1_200 }],
  grossTax: 10_700,
  cbmaCredit: 9_500,
  netTax: 1_200,
  cbmaLines: [
    { taxClass: "A_LE16", tier: 1, gallons: 5_000, creditRate: 1.0, creditAmount: 5_000 },
    { taxClass: "A_LE16", tier: 2, gallons: 5_000, creditRate: 0.9, creditAmount: 4_500 },
  ],
  ladder: {
    ytdRemovedStart: 25_000,
    periodRemovedGal: 10_000,
    ytdRemovedEnd: 35_000,
    annualCap: 750_000,
    tiers: [
      { tier: 1, limit: 30_000, consumed: 30_000, remaining: 0 },
      { tier: 2, limit: 100_000, consumed: 5_000, remaining: 95_000 },
      { tier: 3, limit: 620_000, consumed: 0, remaining: 620_000 },
    ],
    totalCredit: 9_500,
    over750k: false,
  },
  perLot: [],
  cadence: "SEMIMONTHLY",
  isEftPayer: false,
};

describe("fillExcisePdf (plan-026 Unit 8) — round-trip", () => {
  it("fills line 10 (gross), Schedule B credit, and line 21 (net) — re-read matches", async () => {
    const { bytes, unmapped } = await fillExcisePdf({
      computed,
      periodStart: new Date(Date.UTC(2026, 1, 16)),
      periodEnd: new Date(Date.UTC(2026, 1, 28, 23, 59, 59, 999)),
      profile: { ein: "12-3456789", registryNumber: "BWN-CA-99999", operatedBy: "ZZ Test Winery" },
    });
    expect(bytes.length).toBeGreaterThan(1000);
    expect(unmapped).toEqual([]);

    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    expect(form.getTextField("Tax.10").getText()).toBe("10700.00"); // line 10 gross wine tax
    expect(form.getTextField("Tax.20").getText()).toBe("9500.00"); // Schedule B credit → line 20
    expect(form.getTextField("Item30.b").getText()).toBe("9500.00"); // Schedule B col (b) TAX
    expect(form.getTextField("Tax.21").getText()).toBe("1200.00"); // amount to be paid = net
    expect(form.getTextField("Payment_Amount").getText()).toBe("1200.00");
    expect(form.getTextField("Employer_ID").getText()).toBe("12-3456789");
    expect(form.getTextField("Beginning").getText()).toBe("02/16/2026");
    expect(form.getTextField("Ending").getText()).toBe("02/28/2026");
    expect(form.getRadioGroup("Return_Covers").getSelected()).toBe("PERIOD");
  });

  it("zero-tax period fills $0.00 with no Schedule B credit", async () => {
    const empty: ExciseComputed = {
      ...computed,
      classRows: [],
      grossTax: 0,
      cbmaCredit: 0,
      netTax: 0,
      cbmaLines: [],
      ladder: { ...computed.ladder, periodRemovedGal: 0, totalCredit: 0 },
    };
    const { bytes } = await fillExcisePdf({
      computed: empty,
      periodStart: new Date(Date.UTC(2026, 5, 1)),
      periodEnd: new Date(Date.UTC(2026, 5, 15, 23, 59, 59, 999)),
      profile: { ein: null, registryNumber: null, operatedBy: null },
    });
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const form = doc.getForm();
    expect(form.getTextField("Tax.10").getText()).toBe("0.00");
    expect(form.getTextField("Tax.21").getText()).toBe("0.00");
    expect(form.getTextField("Item30.b").getText() ?? "").toBe(""); // no credit line
  });
});
