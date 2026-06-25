import { describe, it, expect } from "vitest";
import { resolveExactlyOne } from "@/lib/assistant/tools/resolve";

const opts = {
  describe: (r: { name: string }) => r.name,
  noneMsg: "Nothing matched.",
  manyMsg: "Too many matched",
};

describe("resolveExactlyOne", () => {
  it("returns the single match", () => {
    expect(resolveExactlyOne([{ name: "Block A" }], opts)).toEqual({ name: "Block A" });
  });

  it("throws the none message on an empty list", () => {
    expect(() => resolveExactlyOne([], opts)).toThrow("Nothing matched.");
  });

  it("throws the many message listing candidates", () => {
    expect(() => resolveExactlyOne([{ name: "Block A" }, { name: "Block B" }], opts)).toThrow(
      /Too many matched: Block A; Block B/,
    );
  });
});
