import { describe, it, expect } from "vitest";
import { sanitizeSearchQuery } from "@/lib/assistant/conversations";

const NUL = String.fromCharCode(0);
const US = String.fromCharCode(31);
const DEL = String.fromCharCode(127);

describe("sanitizeSearchQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(sanitizeSearchQuery("  brix   block 3 ")).toBe("brix block 3");
  });

  it("returns empty for empty/whitespace-only input", () => {
    expect(sanitizeSearchQuery("")).toBe("");
    expect(sanitizeSearchQuery("   ")).toBe("");
  });

  it("strips control characters", () => {
    expect(sanitizeSearchQuery(`a${NUL}b${US}c${DEL}d`)).toBe("a b c d");
    expect(sanitizeSearchQuery("line1\nline2\tend")).toBe("line1 line2 end");
  });

  it("caps length at 200 characters", () => {
    const out = sanitizeSearchQuery("x".repeat(500));
    expect(out.length).toBe(200);
  });

  it("preserves tsquery operator characters (Postgres parses them)", () => {
    expect(sanitizeSearchQuery('cabernet & "barrel topping"')).toBe(
      'cabernet & "barrel topping"',
    );
  });
});
