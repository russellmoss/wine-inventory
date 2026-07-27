import { describe, it, expect } from "vitest";
import { parsePestCategories, parseProductPests } from "@/lib/pesticide/pest-parse";

// Fixtures are verbatim bytes from the live CA DPR files, captured 2026-07-24
// (docs/spray_assistant/phases/S2b-cdpr-interval-probe.md). No live fetch in tests.
const TARGET_PEST = [
  "A0ALGAE (BROWN SCUM, POOL SCUM)",
  "C0FUNGI",
  "E0INSECTS",
  "E9BEETLES-COLEOPTERA (WEEVIL, BORER, WIREWORM)",
  "J0MITES/TICKS (MITES, TICKS, CHIGGERS, RED SPIDERS)",
  "M1ANNUAL BROADLEAF WEEDS",
].join("\r\n");

const PROD_TARGET_PEST = ["  11349E9", "  11349EC", "  11353J0", "  11355C0"].join("\r\n");

describe("S2b Unit 7b — DPR pest vocabulary parsers", () => {
  it("parses the 2-char code and the name from target_pest.dat", () => {
    const cats = parsePestCategories(TARGET_PEST);
    expect(cats).toHaveLength(6);
    expect(cats[1]).toEqual({ code: "C0", name: "FUNGI" });
    expect(cats.find((c) => c.code === "E9")?.name).toBe("BEETLES-COLEOPTERA (WEEVIL, BORER, WIREWORM)");
  });

  it("drops a malformed row rather than guessing at it", () => {
    // Genuinely malformed for a FIXED-WIDTH file: a code with no name, a short/blank code, a blank
    // line. Note that "XFUNGI" is NOT malformed here — it is code "XF", name "UNGI", which is what
    // fixed-width means. The parser cannot and must not second-guess the column boundaries.
    expect(parsePestCategories("C0\r\n 0FUNGI\r\n  \r\nD0VIRUS")).toEqual([{ code: "D0", name: "VIRUS" }]);
  });

  it("first code wins on a duplicate — a repeated code is a source defect, not a merge", () => {
    expect(parsePestCategories("C0FUNGI\r\nC0SOMETHING ELSE")).toEqual([{ code: "C0", name: "FUNGI" }]);
  });

  it("parses prodno + pest code from prod_target_pest.dat", () => {
    const codes = new Set(["E9", "EC", "J0", "C0"]);
    const { rows, droppedUnknownCode } = parseProductPests(PROD_TARGET_PEST, codes);
    expect(droppedUnknownCode).toBe(0);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({ prodno: "11349", pestCode: "E9" });
    // one product legitimately carries several categories
    expect(rows.filter((r) => r.prodno === "11349")).toHaveLength(2);
  });

  it("COUNTS a mapping to an unknown code instead of inserting it", () => {
    // Silently inserting would trade a countable drop here for an FK error at read time.
    const { rows, droppedUnknownCode } = parseProductPests(PROD_TARGET_PEST, new Set(["E9"]));
    expect(rows).toHaveLength(1);
    expect(droppedUnknownCode).toBe(3);
  });

  it("tolerates LF-only input — never depends on DPR shipping CRLF", () => {
    expect(parsePestCategories("C0FUNGI\nD0VIRUS")).toHaveLength(2);
  });
});
