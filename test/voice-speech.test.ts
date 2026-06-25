import { describe, it, expect } from "vitest";
import { toSpeakable } from "@/lib/voice/speech";

describe("toSpeakable", () => {
  it("strips bold and inline code", () => {
    expect(toSpeakable("The **latest** reading is `24.5`.")).toBe("The latest reading is 24.5.");
  });

  it("strips italics and strikethrough", () => {
    expect(toSpeakable("That is _important_ and ~~wrong~~.")).toBe("That is important and wrong.");
  });

  it("flattens links to their label", () => {
    expect(toSpeakable("See [Block 3](https://example.com/b3) now.")).toBe("See Block 3 now.");
  });

  it("removes bullet markers and joins list items into sentences", () => {
    const md = "Readings:\n- Block 1 is ready\n- Block 2 needs time";
    expect(toSpeakable(md)).toBe("Readings:. Block 1 is ready. Block 2 needs time");
  });

  it("removes ordered list markers", () => {
    const md = "1. First step\n2) Second step";
    expect(toSpeakable(md)).toBe("First step. Second step");
  });

  it("strips heading and blockquote markers", () => {
    expect(toSpeakable("## Harvest\n> note here")).toBe("Harvest. note here");
  });

  it("normalizes Brix units (with and without degree symbol)", () => {
    expect(toSpeakable("Block 3 hit 24.5 °Bx today.")).toBe("Block 3 hit 24.5 Brix today.");
    expect(toSpeakable("Reading: 22°Bx")).toBe("Reading: 22 Brix");
    expect(toSpeakable("Logged 18 Bx")).toBe("Logged 18 Brix");
  });

  it("reads a bare temperature degree symbol as 'degrees'", () => {
    expect(toSpeakable("It was 35° at noon.")).toBe("It was 35 degrees at noon.");
  });

  it("removes fenced code blocks but keeps their contents", () => {
    const md = "Run this:\n```sql\nSELECT 1\n```";
    expect(toSpeakable(md)).toContain("SELECT 1");
    expect(toSpeakable(md)).not.toContain("```");
  });

  it("collapses whitespace and drops horizontal rules", () => {
    expect(toSpeakable("Hello   world\n---\nGoodbye")).toBe("Hello world. Goodbye");
  });

  it("returns empty string for empty input", () => {
    expect(toSpeakable("")).toBe("");
    expect(toSpeakable("   \n  ")).toBe("");
  });
});
