import { describe, it, expect } from "vitest";
import { parseProductLine, parseProdSiteLine, parseSiteLine, CDPR_GRAPE_SITE_CODES } from "@/lib/pesticide/cdpr-parse";

// Spray S2 Unit 6 — fixed-width CDPR parsing pinned by REAL captured lines (2026-07-25 files).
// The two counter-intuitive verified products are committed as fixtures because plan 086 mis-decoded
// the status column once already: liveness is product.dat PRODSTAT_IND, NOT prod_site's site status
// (a product dead since 2004 still carries site-status 'A').

// Real lines, verbatim (trailing content beyond col ~150 trimmed — offsets under test all sit before it).
const GAVEL_LINE =
  "  61549     10163     10163 6414AA     10163AGAVEL FUNGICIDE 75DF                                                                                  10163- 6414-AA        C         R0";
const FUSILADE_LIVE_LINE =
  "  62562       100       100 1070ZA       100AFUSILADE DX HERBICIDE                                                                                   100- 1070-ZA        C    8.200B0";
const FUSILADE_DEAD_LINE =
  "  30117     10182     10182  367AA         0BFUSILADE DX HERBICIDE                                                                                 10182-  367-AA        C    8.246B0";
const DISTRIBUTOR_DEAD_LINE =
  "  29283      9688      8220   63ZB         0BVICTORY FLEA & TICK FOGGER (WATER-BASED)                                                               9688-   63-ZB-   8220B    8.290M0";

describe("product.dat parsing (the verified cases)", () => {
  it("Gavel 75DF: prodno 61549, ACTIVE, EPA 10163-6414 (the number APPRIL itself carries)", () => {
    const r = parseProductLine(GAVEL_LINE);
    expect(r).toEqual({
      ok: true,
      prodno: 61549,
      isActive: true,
      productName: "GAVEL FUNGICIDE 75DF",
      registration: { kind: "epa", regNumberRaw: "10163-6414" },
    });
  });

  it("Fusilade DX: the LIVE prodno (62562, EPA 100-1070) is active; the DEAD one (30117) is not — the status-column trap", () => {
    const live = parseProductLine(FUSILADE_LIVE_LINE);
    expect(live.ok && live.isActive).toBe(true);
    if (live.ok && live.registration.kind === "epa") expect(live.registration.regNumberRaw).toBe("100-1070");

    const dead = parseProductLine(FUSILADE_DEAD_LINE);
    expect(dead.ok).toBe(true);
    if (dead.ok) {
      expect(dead.isActive).toBe(false); // PRODSTAT_IND 'B' — even though its prod_site rows say 'A'
      expect(dead.productName).toBe("FUSILADE DX HERBICIDE");
    }
  });

  it("a distributor product reconstructs the three-segment EPA number", () => {
    const r = parseProductLine(DISTRIBUTOR_DEAD_LINE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.isActive).toBe(false);
      expect(r.registration).toEqual({ kind: "epa", regNumberRaw: "9688-63-8220" });
    }
  });

  it("a LABEL_SEQ ≥ 50000 is CA-state-only — counted for S2b, never called malformed (G4)", () => {
    const caOnly = GAVEL_LINE.replace(" 6414", "50001");
    const r = parseProductLine(caOnly);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.registration).toEqual({ kind: "ca-state-only" });
  });

  it("an unparseable line is a typed error, never a guess", () => {
    expect(parseProductLine("garbage").ok).toBe(false);
    expect(parseProductLine("").ok).toBe(false);
  });
});

describe("prod_site.dat parsing", () => {
  it("parses real grape rows (site status at col 34)", () => {
    expect(parseProdSiteLine("  62562 29143  0A00 0308  50D 12H A                                 ")).toEqual({
      ok: true,
      prodno: 62562,
      siteCode: 29143,
      siteActive: true,
    });
    expect(parseProdSiteLine("     37 77000  0A00        0   0  I                                 ")).toEqual({
      ok: true,
      prodno: 37,
      siteCode: 77000,
      siteActive: false,
    });
  });

  it("grape site-code set matches the verified vocabulary and excludes the traps", () => {
    for (const c of [1014, 1020, 1021, 1022, 1501, 29141, 29143]) expect(CDPR_GRAPE_SITE_CODES.has(c)).toBe(true);
    for (const trap of [2002, 29012, 34198, 13049]) expect(CDPR_GRAPE_SITE_CODES.has(trap)).toBe(false);
  });
});

describe("site.dat parsing", () => {
  it("parses the grape site rows", () => {
    const r = parseSiteLine("  29143     422-DEC-1989  1GRAPES, WINE                                       290");
    expect(r).toEqual({ ok: true, code: 29143, name: "GRAPES, WINE" });
  });
  it("an unparseable line is a typed error", () => {
    expect(parseSiteLine("").ok).toBe(false);
  });
});
