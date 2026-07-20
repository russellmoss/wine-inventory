import { describe, it, expect } from "vitest";
import { searchKnowledgeBaseTool, yearsSince } from "@/lib/assistant/tools/search-knowledge-base";

// Plan 084 U6 — the assistant resolves conflicting recommendations by recency, and a chunk of the
// Cornell corpus is year-stamped spray guidance that is revised every season. Age has to reach the model
// as a precomputed number: asking it to subtract dates is asking for a wrong answer on a decision that
// gets acted on in a vineyard.
describe("knowledge passage age", () => {
  const NOW = new Date("2026-07-20T00:00:00Z");

  it("reports whole years for an older document", () => {
    expect(yearsSince(new Date("2019-04-02T00:00:00Z"), NOW)).toBe(7);
    expect(yearsSince(new Date("2023-05-01T00:00:00Z"), NOW)).toBe(3);
  });

  it("reports 0 for a document published today or this year", () => {
    expect(yearsSince(new Date("2026-07-20T00:00:00Z"), NOW)).toBe(0);
    expect(yearsSince(new Date("2026-01-05T00:00:00Z"), NOW)).toBe(0);
  });

  it("floors rather than rounds, so an 11-month-old document is not called a year old", () => {
    expect(yearsSince(new Date("2025-09-01T00:00:00Z"), NOW)).toBe(0);
  });

  it("never returns a negative age for a slightly-future date", () => {
    // parseHtmlPublishedDate tolerates small clock skew, so a "tomorrow" date can reach here.
    expect(yearsSince(new Date("2026-07-21T00:00:00Z"), NOW)).toBe(0);
  });

  it("instructs the model on stale chemical guidance without telling it to refuse", () => {
    const d = searchKnowledgeBaseTool.description;
    // The distinction that matters: product/rate/limit guidance goes stale, biology does not.
    expect(d).toMatch(/ageYears/);
    expect(d.toLowerCase()).toMatch(/spray program|rates|registered/);
    // Age must inform the answer, never suppress it.
    expect(d.toLowerCase()).toContain("do not refuse to answer because a passage is old");
    // And it must not become a second, worse source of dates.
    expect(d.toLowerCase()).toContain("never use `ageyears` to compute or state a publication date");
  });
});
