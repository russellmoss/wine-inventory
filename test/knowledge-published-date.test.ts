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
