import { describe, it, expect } from "vitest";
import { fallbackTitle } from "@/lib/assistant/title";

describe("fallbackTitle", () => {
  it("returns a short message unchanged", () => {
    expect(fallbackTitle("Latest Brix for Block 3?")).toBe("Latest Brix for Block 3?");
  });

  it("collapses whitespace", () => {
    expect(fallbackTitle("  log   22.4   Brix  ")).toBe("log 22.4 Brix");
  });

  it("truncates long input on a word boundary with an ellipsis", () => {
    const long =
      "What is the latest sugar reading across every block in the northern vineyard this week";
    const out = fallbackTitle(long);
    expect(out.length).toBeLessThanOrEqual(61); // 60 + ellipsis char
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toContain("  ");
    // truncation should not split mid-word (char before ellipsis is part of a word)
    expect(/\s…$/.test(out)).toBe(false);
  });

  it("falls back to a default for empty input", () => {
    expect(fallbackTitle("")).toBe("New conversation");
    expect(fallbackTitle("    ")).toBe("New conversation");
  });
});
