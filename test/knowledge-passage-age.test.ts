import { describe, expect, it } from "vitest";
import { assessPassageAge, summarizeCorpusAge, AGING_YEARS, STALE_YEARS } from "@/lib/knowledge/passage-age";

const NOW = new Date(Date.UTC(2026, 6, 20));
const at = (y: number, m = 7, d = 1) => new Date(Date.UTC(y, m - 1, d));

describe("assessPassageAge — levels", () => {
  it("treats recent content as current, with no warning", () => {
    const r = assessPassageAge(at(2024), NOW);
    expect(r.level).toBe("current");
    expect(r.warning).toBeNull();
  });

  it("flags 5-10 year old content as aging", () => {
    const r = assessPassageAge(at(2020, 3), NOW);
    expect(r.level).toBe("aging");
    expect(r.ageYears).toBe(6);
    expect(r.warning).toContain("2020-03");
  });

  it("flags 10+ year old content as stale", () => {
    // The real UC IPM powdery-mildew case: treatment table stamped 07/15.
    const r = assessPassageAge(at(2015, 7), NOW);
    expect(r.level).toBe("stale");
    expect(r.ageYears).toBe(11);
    expect(r.warning).toContain("STALE");
  });

  it("warns the stale case specifically about registrations, rates, REIs and limits", () => {
    // This is the whole point: a stale PESTICIDE passage must not be read as current practice.
    const w = assessPassageAge(at(2015, 7), NOW).warning ?? "";
    expect(w).toMatch(/registration/i);
    expect(w).toMatch(/re-entry|pre-harvest/i);
    expect(w).toMatch(/verify/i);
  });
});

describe("assessPassageAge — boundaries", () => {
  it("is current just under the aging threshold and aging just over it", () => {
    expect(assessPassageAge(at(2026 - AGING_YEARS, 8), NOW).level).toBe("current"); // not yet 5 full years
    expect(assessPassageAge(at(2026 - AGING_YEARS, 6), NOW).level).toBe("aging");
  });

  it("is aging just under the stale threshold and stale just over it", () => {
    expect(assessPassageAge(at(2026 - STALE_YEARS, 8), NOW).level).toBe("aging");
    expect(assessPassageAge(at(2026 - STALE_YEARS, 6), NOW).level).toBe("stale");
  });

  it("does not warn on a slightly future stamp (timezone / post-dated issue)", () => {
    const r = assessPassageAge(at(2026, 12), NOW);
    expect(r.level).toBe("current");
    expect(r.ageYears).toBe(0);
  });
});

describe("assessPassageAge — an undated passage is NOT treated as fresh", () => {
  it.each([[null], [undefined]])("warns on %s", (input) => {
    const r = assessPassageAge(input as Date | null, NOW);
    expect(r.level).toBe("unknown");
    expect(r.ageYears).toBeNull();
    expect(r.warning).toMatch(/unknown/i);
  });

  it("handles an invalid date object without throwing", () => {
    expect(assessPassageAge(new Date("nonsense"), NOW).level).toBe("unknown");
  });
});

describe("summarizeCorpusAge", () => {
  it("returns null when every passage is current", () => {
    expect(summarizeCorpusAge([at(2024), at(2025)].map((d) => assessPassageAge(d, NOW)))).toBeNull();
  });

  it("counts each bucket", () => {
    const s = summarizeCorpusAge([
      assessPassageAge(at(2015), NOW), // stale
      assessPassageAge(at(2014), NOW), // stale
      assessPassageAge(at(2020), NOW), // aging
      assessPassageAge(null, NOW), // undated
      assessPassageAge(at(2025), NOW), // current
    ]);
    expect(s).toContain("2 stale");
    expect(s).toContain("1 aging");
    expect(s).toContain("1 undated");
    expect(s).toContain("of 5 passage(s)");
  });
});
