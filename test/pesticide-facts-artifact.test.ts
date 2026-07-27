import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateArtifact, validateArtifactRow, type ProductFactsArtifactRow } from "@/lib/pesticide/product-facts-artifact";
import { TRUSTED_DOMAIN_SET } from "@/lib/knowledge/config";

// Spray S2b Unit 2 — the artifact-discipline test. "Every curated row carries source + as-of +
// reviewer" (the plan's acceptance-gate line) is unenforced until something asserts it against the
// REAL committed file — this is that something, plus the council S5 falsification case as synthetic
// fixtures (the committed artifact ships empty; these are what prove the RULE, not the content).

function baseRow(overrides: Partial<ProductFactsArtifactRow> = {}): ProductFactsArtifactRow {
  return {
    epaRegNumber: "7969-199",
    factGroup: "REGULATORY",
    labelVersionKey: "2026-01-01",
    sourceUrl: "https://files.cdpr.ca.gov/pub/outgoing/product/prod_site.dat",
    sourceTitle: "CA DPR product-site intervals",
    sourceAsOf: "2026-07-24",
    reviewedBy: null,
    reviewedAt: null,
    reviewDueAt: "2026-10-24",
    ...overrides,
  };
}

describe("validateArtifactRow", () => {
  it("a well-formed proposal (reviewedBy: null) passes — a proposal is a valid state, not an error", () => {
    expect(validateArtifactRow(baseRow(), TRUSTED_DOMAIN_SET)).toEqual([]);
  });

  it("a well-formed reviewed row passes", () => {
    expect(
      validateArtifactRow(baseRow({ reviewedBy: "russell@cellarhand.test", reviewedAt: "2026-07-27" }), TRUSTED_DOMAIN_SET),
    ).toEqual([]);
  });

  it("reviewedBy without reviewedAt is refused", () => {
    const errs = validateArtifactRow(baseRow({ reviewedBy: "russell@cellarhand.test", reviewedAt: null }), TRUSTED_DOMAIN_SET);
    expect(errs.some((e) => e.includes("reviewedBy without reviewedAt"))).toBe(true);
  });

  it("missing source metadata is refused, not silently allowed", () => {
    for (const field of ["sourceUrl", "sourceTitle", "sourceAsOf", "reviewDueAt", "labelVersionKey"] as const) {
      const row = baseRow({ [field]: "" } as Partial<ProductFactsArtifactRow>);
      const errs = validateArtifactRow(row, TRUSTED_DOMAIN_SET);
      expect(errs.length, `expected a violation for missing ${field}`).toBeGreaterThan(0);
    }
  });

  it("council S5 falsification case: a REGULATORY row cannot cite an extension source", () => {
    const row = baseRow({ sourceUrl: "https://ipm.ucanr.edu/agriculture/grape/some-page" });
    const errs = validateArtifactRow(row, TRUSTED_DOMAIN_SET);
    expect(errs.some((e) => e.includes("cannot cite an extension source"))).toBe(true);
  });

  it("council S5 falsification case: an AGRONOMIC row cannot claim an EPA/CDPR label as its source", () => {
    const row = baseRow({
      factGroup: "AGRONOMIC",
      rainfastHours: 4,
      sourceUrl: "https://files.cdpr.ca.gov/pub/outgoing/product/prod_site.dat",
    });
    const errs = validateArtifactRow(row, TRUSTED_DOMAIN_SET);
    expect(errs.some((e) => e.includes("cannot claim an EPA/CDPR label"))).toBe(true);
  });

  it("an AGRONOMIC row citing a real extension source passes", () => {
    const row = baseRow({
      factGroup: "AGRONOMIC",
      rainfastHours: 4,
      sourceUrl: "https://ipm.ucanr.edu/agriculture/grape/general-properties-of-fungicides-used-in-grapes",
    });
    expect(validateArtifactRow(row, TRUSTED_DOMAIN_SET)).toEqual([]);
  });

  it("no FRAC/HRAC/IRAC compilation host is ever permitted, even hypothetically", () => {
    const row = baseRow({ sourceUrl: "https://www.frac.info/some-page" });
    const errs = validateArtifactRow(row, TRUSTED_DOMAIN_SET);
    expect(errs.some((e) => e.includes("FRAC/HRAC/IRAC"))).toBe(true);
  });

  it("a host outside the trusted allowlist is refused", () => {
    const row = baseRow({ sourceUrl: "https://example.com/random-page" });
    const errs = validateArtifactRow(row, TRUSTED_DOMAIN_SET);
    expect(errs.some((e) => e.includes("not in the trusted allowlist"))).toBe(true);
  });

  it("a PHI of exactly 0 must carry a reviewNote — a bare zero is indistinguishable from a default", () => {
    const row = baseRow({ worstCasePhiDays: 0 });
    const errs = validateArtifactRow(row, TRUSTED_DOMAIN_SET);
    expect(errs.some((e) => e.includes("worstCasePhiDays=0"))).toBe(true);
    const withNote = baseRow({ worstCasePhiDays: 0, reviewNote: "label states 0-day PHI, apply up to harvest" });
    expect(validateArtifactRow(withNote, TRUSTED_DOMAIN_SET)).toEqual([]);
  });
});

describe("validateArtifact — whole-artifact checks", () => {
  it("two rows for the SAME (epaRegNumber, factGroup) is a duplicate — the artifact is a snapshot, not a history", () => {
    const errs = validateArtifact([baseRow(), baseRow({ labelVersionKey: "2026-02-01" })], TRUSTED_DOMAIN_SET);
    expect(errs.some((e) => e.includes("duplicate"))).toBe(true);
  });

  it("the SAME product with TWO DIFFERENT fact groups is fine — REGULATORY and AGRONOMIC are independent", () => {
    const errs = validateArtifact(
      [baseRow(), baseRow({ factGroup: "AGRONOMIC", rainfastHours: 4, sourceUrl: "https://ipm.ucanr.edu/agriculture/grape/x" })],
      TRUSTED_DOMAIN_SET,
    );
    expect(errs).toEqual([]);
  });
});

describe("the REAL committed artifact — every curated row carries source + as-of + reviewer, test-enforced", () => {
  const DATA_DIR = join(__dirname, "..", "src", "lib", "pesticide", "data");

  it("product-facts.json has zero discipline violations (vacuously true while it ships empty)", () => {
    const rows = JSON.parse(readFileSync(join(DATA_DIR, "product-facts.json"), "utf8")) as ProductFactsArtifactRow[];
    expect(Array.isArray(rows)).toBe(true);
    expect(validateArtifact(rows, TRUSTED_DOMAIN_SET)).toEqual([]);
  });

  it("separation-rules.json parses as an array (Unit 3's curated content — also empty until reviewed)", () => {
    const rows = JSON.parse(readFileSync(join(DATA_DIR, "separation-rules.json"), "utf8"));
    expect(Array.isArray(rows)).toBe(true);
  });
});
