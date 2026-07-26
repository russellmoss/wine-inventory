import { describe, it, expect } from "vitest";
import {
  parseModeOfAction,
  canonicalizeCode,
  parseCommonNameCell,
  extractUcIpmRows,
  extractUcIpmBiologicalProposals,
  toAiAssignments,
  resolutionOf,
  buildCoverageReport,
  isBiological,
} from "@/lib/pesticide/resistance-derive";

// Spray S2 Unit 9 — derivation over REAL cell shapes captured from the live UC IPM grape guidelines
// (2024-07 revision). The safety-relevant behaviours: a premix yields BOTH codes (never one), the
// trade-name parenthetical is never a product key (K4), siteType is independent of the code (K3),
// and anything the source does not cite lands in GAP rather than being inferred (K5).

const REAL_TABLE = `<table><tbody>
<tr><td>azoxystrobin (Quadris, Abound discontinued)</td><td>QoI <sup>5</sup></td><td>contact, systemic</td><td>single-site (11)</td><td>high</td><td></td></tr>
<tr><td>boscalid/pyraclostrobin (Pristine)</td><td>SDHI and QoI</td><td>contact, systemic</td><td>single-site/<br>single-site (7/11)</td><td>medium</td><td></td></tr>
<tr><td>captan</td><td>phthalimide</td><td>contact</td><td>multi-site (M 04)</td><td>low</td><td>highly toxic to honey bee larvae</td></tr>
<tr><td>cyprodinil/fludioxonil (Switch)</td><td>anilinopyrimidine and phenylpyrrole</td><td>contact</td><td>single-site/ single-site (9/12)</td><td>low</td><td></td></tr>
<tr><td><em>Bacillus subtilis</em> (Serenade)</td><td>biological-bacteria</td><td>contact</td><td>BM 02</td><td>low</td><td></td></tr>
<tr><td>trifloxystrobin (Flint Extra)</td><td>QoI</td><td>contact, systemic</td><td>single site (11)</td><td>high</td><td></td></tr>
<tr><td>sodium hypochlorite</td><td>inorganic</td><td>contact</td><td>NC</td><td>low</td><td></td></tr>
</tbody></table>`;

describe("mode-of-action cell parsing", () => {
  it("single-site with a numeric code", () => {
    expect(parseModeOfAction("single-site (11)")).toEqual({ codes: ["11"], siteType: "SINGLE", notCoded: false });
  });

  it("multi-site keeps BOTH facts — captan is coded M 04 AND multi-site (K3)", () => {
    expect(parseModeOfAction("multi-site (M 04)")).toEqual({ codes: ["M 04"], siteType: "MULTI", notCoded: false });
  });

  it("the un-hyphenated 'single site' spelling still yields SINGLE (the live table uses both)", () => {
    expect(parseModeOfAction("single site (11)").siteType).toBe("SINGLE");
  });

  it("a premix cell yields BOTH codes in order", () => {
    expect(parseModeOfAction("single-site/ single-site (9/12)").codes).toEqual(["9", "12"]);
  });

  it("a bare biological code parses without a site type", () => {
    expect(parseModeOfAction("BM 02")).toEqual({ codes: ["BM 02"], siteType: "UNKNOWN", notCoded: false });
  });

  it("'NC' is NOT-CODED (a real answer), not a gap", () => {
    expect(parseModeOfAction("NC")).toEqual({ codes: [], siteType: "UNKNOWN", notCoded: true });
    expect(resolutionOf(parseModeOfAction("NC"))).toBe("NO_CODE_EXISTS");
  });

  it("an empty cell is a GAP, never an assertion", () => {
    expect(resolutionOf(parseModeOfAction(""))).toBe("GAP");
    expect(resolutionOf(undefined)).toBe("GAP");
  });
});

describe("code canonicalization", () => {
  it("normalizes letter groups to one space and two digits", () => {
    expect(canonicalizeCode("m04")).toBe("M 04");
    expect(canonicalizeCode("BM2")).toBe("BM 02");
    expect(canonicalizeCode("U 06")).toBe("U 06");
  });
  it("numeric groups stay bare", () => {
    expect(canonicalizeCode("11")).toBe("11");
    expect(canonicalizeCode(" 7 ")).toBe("7");
  });
  it("NC and junk are not codes", () => {
    expect(canonicalizeCode("NC")).toBeNull();
    expect(canonicalizeCode("high")).toBeNull();
    expect(canonicalizeCode("")).toBeNull();
  });
});

describe("K4 — the trade-name parenthetical is never a product key", () => {
  it("the common-name cell drops the trade name entirely", () => {
    expect(parseCommonNameCell("cyprodinil/fludioxonil (Switch)").aiNames).toEqual(["cyprodinil", "fludioxonil"]);
    expect(parseCommonNameCell("azoxystrobin (Quadris, Abound discontinued)").aiNames).toEqual(["azoxystrobin"]);
  });

  it("no ASSIGNMENT keys on a trade name — the verbatim cell is kept as provenance only", () => {
    const rows = extractUcIpmRows(REAL_TABLE);
    expect(rows.every((r) => r.aiNames.length > 0)).toBe(true);
    // subjectRaw deliberately preserves "cyprodinil/fludioxonil (Switch)" so a reviewer can trace
    // the row; what must never happen is a trade name becoming a SUBJECT.
    const subjects = toAiAssignments(rows).map((a) => a.aiName);
    for (const trade of ["Switch", "Pristine", "Quadris", "Serenade", "Flint Extra"]) {
      expect(subjects.some((s) => s.toLowerCase().includes(trade.toLowerCase())), `${trade} must not be an assignment subject`).toBe(false);
    }
  });
});

describe("per-AI assignments from the real table", () => {
  const assignments = toAiAssignments(extractUcIpmRows(REAL_TABLE));
  const byName = (n: string) => assignments.find((a) => a.aiName.toLowerCase() === n);

  it("Switch's constituents resolve to 9 AND 12 — never 9 alone", () => {
    expect(byName("cyprodinil")?.codes).toEqual(["9"]);
    expect(byName("fludioxonil")?.codes).toEqual(["12"]);
  });

  it("Pristine's constituents resolve to 7 and 11", () => {
    expect(byName("boscalid")?.codes).toEqual(["7"]);
    expect(byName("pyraclostrobin")?.codes).toEqual(["11"]);
  });

  it("captan carries siteType MULTI regardless of which source supplied the code (K3)", () => {
    expect(byName("captan")).toEqual({ aiName: "captan", codes: ["M 04"], siteType: "MULTI", notCoded: false });
  });

  it("a known uncoded compound lands in NO_CODE_EXISTS, not GAP", () => {
    expect(resolutionOf(byName("sodium hypochlorite"))).toBe("NO_CODE_EXISTS");
  });

  it("a premix row whose code count does not match its AI count is SKIPPED, not guessed", () => {
    const mismatched = `<table><tbody><tr><td>alpha/beta/gamma</td><td>x</td><td>y</td><td>single-site (7/11)</td></tr></tbody></table>`;
    expect(extractUcIpmRows(mismatched)).toEqual([]);
  });
});

describe("K5 — biologicals: cited species only, never genus generalization", () => {
  it("the cited species row is extracted", () => {
    const a = toAiAssignments(extractUcIpmRows(REAL_TABLE)).find((x) => /bacillus subtilis/i.test(x.aiName));
    expect(a?.codes).toEqual(["BM 02"]);
  });

  it("an uncited organism has no assignment at all — it resolves GAP by construction", () => {
    const assignments = toAiAssignments(extractUcIpmRows(REAL_TABLE));
    expect(assignments.find((x) => /mycoides|cerevisane|amyloliquefaciens/i.test(x.aiName))).toBeUndefined();
  });

  it("biological detection drives the coverage report's decision number", () => {
    expect(isBiological("Bacillus mycoides isolate J")).toBe(true);
    expect(isBiological("Cerevisane")).toBe(true);
    expect(isBiological("Tebuconazole")).toBe(false);
  });
});

describe("G6 — the biologicals table yields trade-name PROPOSALS, never applied codes", () => {
  it("extracts the code from the risk cell and splits multi-name rows", () => {
    const html = `<table><tbody>
      <tr><td>Serenade</td><td>low (BM 02)</td><td>4</td></tr>
      <tr><td>Cinnacure, Seican, Cinnerate</td><td>low (BM 03)</td><td>4</td></tr>
      <tr><td>Kaligreen</td><td>low (NC)</td><td>4</td></tr>
      <tr><td>Rating: 5 = excellent</td><td>not a data row</td><td></td></tr>
    </tbody></table>`;
    const props = extractUcIpmBiologicalProposals(html);
    expect(props).toHaveLength(3);
    expect(props[0]).toEqual({ tradeNames: ["Serenade"], codes: ["BM 02"], notCoded: false });
    expect(props[1].tradeNames).toEqual(["Cinnacure", "Seican", "Cinnerate"]);
    expect(props[2]).toEqual({ tradeNames: ["Kaligreen"], codes: [], notCoded: true });
  });
});

describe("coverage report", () => {
  it("buckets everything with zero unclassified and reports the decision numbers", () => {
    const r = buildCoverageReport(
      [
        { name: "Cyprodinil", resolution: "CODED", viaNormalization: false, inFungicideProduct: true },
        { name: "Copper sulfate pentahydrate", resolution: "CODED", viaNormalization: true, inFungicideProduct: true },
        { name: "Sodium hypochlorite", resolution: "NO_CODE_EXISTS", viaNormalization: false, inFungicideProduct: true },
        { name: "Bacillus mycoides isolate J", resolution: "GAP", viaNormalization: false, inFungicideProduct: true },
        { name: "Imidacloprid", resolution: "GAP", viaNormalization: false, inFungicideProduct: false },
      ],
      3,
    );
    expect(r.unclassified).toBe(0);
    expect(r.totalAis).toBe(5);
    expect(r.coded).toBe(2);
    expect(r.gap).toBe(2);
    expect(r.biologicalsShareOfGap).toBe(1);
    expect(r.normalizationRecovered).toBe(1);
    expect(r.unattachedCitedSubjects).toBe(3);
    // FRAC-scoped: the insecticide is excluded from the denominator that rotation depends on.
    expect(r.fungicideScoped).toEqual({ total: 4, coded: 2, noCodeExists: 1, gap: 1, biologicalsInGap: 1 });
  });
});
