import { describe, it, expect } from "vitest";
import { chunkMarkdown, estimateTokens } from "@/lib/knowledge/chunk";

const DOC = `# Barrel sanitation
Hot water is the most effective and practical sanitation method for controlling Brett in oak.

## Hot-water regimes
Two hot-water regimes are effective for barrel sanitation:

| Water temperature | Minimum hold time |
| --- | --- |
| 70 degrees C | 30 minutes |
| 85 degrees C | 15 minutes |

Reverse osmosis is the most effective way to remove Brett aromas once a wine is affected.`;

describe("chunkMarkdown", () => {
  it("keeps a markdown table whole in a single chunk (dose-table safety)", () => {
    const chunks = chunkMarkdown(DOC, "Brett");
    const tableChunk = chunks.find((c) => c.text.includes("70 degrees C"));
    expect(tableChunk).toBeTruthy();
    // every table cell must be in the SAME chunk — the table was not split
    for (const cell of ["70 degrees C", "30 minutes", "85 degrees C", "15 minutes"]) {
      expect(tableChunk!.text).toContain(cell);
    }
  });

  it("prepends the section breadcrumb to each chunk", () => {
    const chunks = chunkMarkdown(DOC, "Brett");
    for (const c of chunks) {
      expect(c.sectionPath).toContain("Brett");
      expect(c.text.startsWith(c.sectionPath)).toBe(true);
    }
    // the regimes section carries the nested breadcrumb
    expect(chunks.some((c) => c.sectionPath.includes("Hot-water regimes"))).toBe(true);
  });

  it("assigns sequential ordinals from 0", () => {
    const chunks = chunkMarkdown(DOC, "Brett");
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i));
  });

  it("force-splits a very long paragraph into multiple chunks", () => {
    const sentence = "This is a long fact sheet sentence about fermentation nitrogen and yeast health. ";
    const longPara = sentence.repeat(80); // ~6400 chars ~ 1600 tokens, well over MAX
    const chunks = chunkMarkdown(`# Nutrition\n${longPara}`, "YAN");
    expect(chunks.length).toBeGreaterThan(1);
    // no chunk is absurdly large
    for (const c of chunks) expect(c.tokenCount).toBeLessThan(1100);
  });

  it("is deterministic", () => {
    expect(chunkMarkdown(DOC, "Brett").map((c) => c.text)).toEqual(
      chunkMarkdown(DOC, "Brett").map((c) => c.text),
    );
  });

  it("estimateTokens is chars/4", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
  });
});
