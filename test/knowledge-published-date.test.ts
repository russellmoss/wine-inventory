import { describe, expect, it } from "vitest";
import { parsePublishedDate, resolvePublishedDate } from "@/lib/knowledge/extract/published-date";

// A fixed "now" so these never rot: every case is evaluated against 2026-07-20.
const NOW = new Date(Date.UTC(2026, 6, 20));

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

describe("parsePublishedDate — the UC IPM shape that motivated this", () => {
  it("parses the real UC IPM stamp and takes the MOST RECENT of the two", () => {
    // Verbatim from ipm.ucanr.edu/agriculture/grape/powdery-mildew/ as extracted to markdown.
    const md = "Text Updated: 12/14  \nTreatment Table Updated: 07/15";
    const r = parsePublishedDate(md, NOW);
    expect(iso(r?.date)).toBe("2015-07-01"); // 07/15, not 12/14
  });

  it("expands two-digit years around the 80 pivot", () => {
    expect(iso(parsePublishedDate("Updated: 06/14", NOW)?.date)).toBe("2014-06-01");
    expect(iso(parsePublishedDate("Updated: 06/95", NOW)?.date)).toBe("1995-06-01");
  });
});

describe("parsePublishedDate — date shapes", () => {
  it.each([
    ["Last Updated: 2024-03-17", "2024-03-17"],
    ["Revised: March 17, 2024", "2024-03-17"],
    ["Revised: March 2024", "2024-03-01"],
    ["Published: 3/17/2024", "2024-03-17"],
    ["Updated: 3/17/24", "2024-03-17"],
    ["Reviewed: 03/2024", "2024-03-01"],
    ["Page Updated: 11/22", "2022-11-01"],
  ])("parses %s", (input, expected) => {
    expect(iso(parsePublishedDate(input, NOW)?.date)).toBe(expected);
  });
});

describe("parsePublishedDate — refuses to guess (a wrong date is worse than none)", () => {
  it("ignores an UNLABELLED date in prose", () => {
    // The whole point of the label anchor: a year in a sentence is not a revision stamp.
    expect(parsePublishedDate("A 2019 trial found powdery mildew pressure rose.", NOW)).toBeNull();
    expect(parsePublishedDate("Apply 3/17 kg per hectare.", NOW)).toBeNull();
  });

  it("rejects a future date (signals a mis-parse such as DD/MM order)", () => {
    expect(parsePublishedDate("Updated: 2031-01-01", NOW)).toBeNull();
    expect(parsePublishedDate("Updated: 06/30", NOW)).toBeNull(); // would be 2030
  });

  it("rejects pre-1980 and impossible dates", () => {
    expect(parsePublishedDate("Updated: 1975-06-01", NOW)).toBeNull();
    expect(parsePublishedDate("Updated: 13/24", NOW)).toBeNull(); // month 13
    expect(parsePublishedDate("Updated: 02/31/2024", NOW)).toBeNull(); // Feb 31 does not round-trip
  });

  it("returns null on empty / dateless input", () => {
    expect(parsePublishedDate("", NOW)).toBeNull();
    expect(parsePublishedDate("No date anywhere in this document.", NOW)).toBeNull();
  });

  it("does not treat a bare 'Date:' label as a revision stamp", () => {
    // "Date:" often marks an event (field day, webinar), not the document revision.
    expect(parsePublishedDate("Date: 03/17/2024", NOW)).toBeNull();
  });
});

describe("resolvePublishedDate — metadata wins, body text is the fallback", () => {
  it("prefers extractor metadata when present", () => {
    const d = resolvePublishedDate(
      { metadataDate: "2023-05-09T00:00:00Z", markdown: "Updated: 01/15" },
      NOW,
    );
    expect(iso(d)).toBe("2023-05-09");
  });

  it("falls back to the body scan when metadata is empty (the UC IPM case)", () => {
    // Defuddle returns published: "" for UC IPM — the date lives only in the body.
    const d = resolvePublishedDate({ metadataDate: "", markdown: "Text Updated: 12/14" }, NOW);
    expect(iso(d)).toBe("2014-12-01");
  });

  it("falls back when metadata is unparseable or implausible", () => {
    expect(iso(resolvePublishedDate({ metadataDate: "n/a", markdown: "Updated: 06/18" }, NOW))).toBe("2018-06-01");
    expect(iso(resolvePublishedDate({ metadataDate: "1930-01-01", markdown: "Updated: 06/18" }, NOW))).toBe("2018-06-01");
  });

  it("returns null when neither source yields a date", () => {
    expect(resolvePublishedDate({ metadataDate: null, markdown: "no dates here" }, NOW)).toBeNull();
  });
});

// Plan 085 — MSU Extension (canr.msu.edu) publishes JSON-LD, but in a shape no Date parser accepts:
// no zero-padding and the timezone jammed against the date with no separator. Verified live during
// recon: `new Date("2024-4-11EDT12:00AM")` is Invalid Date. Its byline ("Paolo Sabbatini, Michigan
// State University Department of Horticulture - April 11, 2024") carries no label word either, so
// the body-scan fallback also returns null. Result before this: MSU lands 100% undated, and every
// passage gets the `unknown` age warning -- exactly what the source was added to avoid.
//
// DELIBERATELY NOT FIXED BY LOOSENING THE LABEL ANCHOR. Matching a bare "Month D, YYYY" after a
// dash would admit event dates and prose dates across all 20 sources, against this module's stated
// posture that a wrong date is worse than none. The metadata path is where the real date is.
describe("resolvePublishedDate — non-ISO metadata (the MSU Extension shape)", () => {
  it.each([
    ["2024-4-11EDT12:00AM", "2024-04-11"],
    ["2024-4-12EDT8:42AM", "2024-04-12"],
    ["2026-7-17EDT11:09AM", "2026-07-17"],
    ["2015-11-02EST3:15PM", "2015-11-02"],
  ])("recovers the date from %s", (meta, expected) => {
    expect(iso(resolvePublishedDate({ metadataDate: meta, markdown: "" }, NOW))).toBe(expected);
  });

  it("confirms the premise: these are Invalid Date to the built-in parser", () => {
    expect(Number.isNaN(new Date("2024-4-11EDT12:00AM").getTime())).toBe(true);
  });

  it("still range-checks the salvaged date exactly like every other path", () => {
    expect(resolvePublishedDate({ metadataDate: "2031-4-11EDT12:00AM", markdown: "" }, NOW)).toBeNull(); // future
    expect(resolvePublishedDate({ metadataDate: "1975-4-11EDT12:00AM", markdown: "" }, NOW)).toBeNull(); // pre-1980
    expect(resolvePublishedDate({ metadataDate: "2024-13-11EDT12:00AM", markdown: "" }, NOW)).toBeNull(); // month 13
    expect(resolvePublishedDate({ metadataDate: "2024-2-31EDT12:00AM", markdown: "" }, NOW)).toBeNull(); // Feb 31
  });

  it("anchors at the START — a stray number sequence mid-string is not a date", () => {
    expect(resolvePublishedDate({ metadataDate: "order 2024-4-11 shipped", markdown: "" }, NOW)).toBeNull();
  });

  it("falls through to the body scan when the metadata is unsalvageable", () => {
    expect(iso(resolvePublishedDate({ metadataDate: "EDT12:00AM", markdown: "Updated: 06/18" }, NOW))).toBe(
      "2018-06-01",
    );
  });

  // The regression guard. Every shape that worked before must still take the ORIGINAL path.
  it.each([
    ["2023-05-09T00:00:00Z", "2023-05-09"],
    ["2023-05-09", "2023-05-09"],
    ["Tue, 09 May 2023 00:00:00 GMT", "2023-05-09"],
    ["May 9, 2023", "2023-05-09"],
  ])("leaves the already-working metadata shape %s unchanged", (meta, expected) => {
    expect(iso(resolvePublishedDate({ metadataDate: meta, markdown: "" }, NOW))).toBe(expected);
  });
});

// Plan 085 review — the salvage path's edges. These carry the actual wrong-date risk, which is the
// failure mode this module says it exists to prevent.
describe("resolvePublishedDate — salvage-path boundaries", () => {
  it("refuses a run-on digit sequence (the (?!\d) boundary is load-bearing)", () => {
    // Drop the lookahead and this silently starts resolving to 2024-04-11.
    expect(resolvePublishedDate({ metadataDate: "2024-4-1123", markdown: "" }, NOW)).toBeNull();
  });

  it("takes the FIRST date of an interval, not a blend of the two", () => {
    // Pinned rather than incidental: intervals returned null before the salvage existed.
    expect(iso(resolvePublishedDate({ metadataDate: "2024-04-11/2024-05-20", markdown: "" }, NOW))).toBe("2024-04-11");
  });

  it("salvages when the parser SUCCEEDED but the range check rejected the result", () => {
    // "2026-07-20T23:00-01:00" parses to the 21st UTC, which is future vs NOW and refused. The
    // salvage then reads the literal leading date. Documented, not accidental — see the comment on
    // LEADING_YMD's use site.
    expect(iso(resolvePublishedDate({ metadataDate: "2026-07-20T23:00-01:00", markdown: "" }, NOW))).toBe("2026-07-20");
  });

  it("still prefers the markdown scan over an unsalvageable metadata string", () => {
    expect(iso(resolvePublishedDate({ metadataDate: "Q3 FY24", markdown: "Updated: 06/18" }, NOW))).toBe("2018-06-01");
  });
});
