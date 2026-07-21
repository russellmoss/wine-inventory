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

  // The written reply keeps clickable citations (the chat renders them); the SPOKEN
  // reply must drop them entirely. Previously the link rule kept the label, so the
  // voice read "AWRI: Recommended YAN levels" aloud — the exact reported complaint.
  describe("citations are written but never spoken", () => {
    it("removes a kb citation link entirely, label and all", () => {
      expect(
        toSpeakable("AWRI puts the red minimum near 100 [AWRI: Recommended YAN levels](/kb/source/abc123)."),
      ).toBe("AWRI puts the red minimum near 100.");
    });

    it("removes an ABSOLUTE kb citation url too (same origin, full url form)", () => {
      expect(
        toSpeakable("OSU suggests 100 [OSU/OWRI Newsletter](http://localhost:3100/kb/source/xyz)."),
      ).toBe("OSU suggests 100.");
    });

    it("does NOT drop a non-citation external link — its label carries the sentence", () => {
      expect(toSpeakable("See [Block 3](https://example.com/b3) now.")).toBe("See Block 3 now.");
    });

    it("removes a bare URL", () => {
      expect(toSpeakable("See https://example.org/thing for detail.")).toBe("See for detail.");
    });

    it("KEEPS the label of an in-app deep link (it's part of the sentence)", () => {
      // Dropping this one would leave "Block 3 is ready" as " is ready".
      expect(toSpeakable("[Block 3](/vineyards/block-3) is ready to pick.")).toBe(
        "Block 3 is ready to pick.",
      );
    });

    it("handles several citations in one reply without leaving gaps", () => {
      expect(
        toSpeakable(
          "Reds sit near 100 [AWRI](/kb/source/a), but Pinot tolerates less [OSU](/kb/source/b).",
        ),
      ).toBe("Reds sit near 100, but Pinot tolerates less.");
    });
  });

  // Spoken replies must never contain a slashed unit or an initialism — TTS reads
  // "mg/L" as "em gee slash el", which is exactly the complaint that prompted this.
  it("spells out concentration units", () => {
    expect(toSpeakable("Target 140 mg/L YAN.")).toBe("Target 140 milligrams per liter YAN.");
    expect(toSpeakable("About 0.8 g/L.")).toBe("About 0.8 grams per liter.");
    expect(toSpeakable("Add 25 g/hL.")).toBe("Add 25 grams per hectoliter.");
  });

  it("handles the more specific mg N/L before the g/L rule (no half-eaten unit)", () => {
    expect(toSpeakable("OSU suggests 100 mg N/L.")).toBe(
      "OSU suggests 100 milligrams of nitrogen per liter.",
    );
    // The generic rule must not have chewed the "m" off "mg/L".
    expect(toSpeakable("140 mg/L")).not.toContain("m grams");
  });

  it("spells out ppm, percent and sulfur dioxide", () => {
    expect(toSpeakable("Copper at 0.5 ppm.")).toBe("Copper at 0.5 parts per million.");
    expect(toSpeakable("Alcohol is 13.5%.")).toBe("Alcohol is 13.5 percent.");
    expect(toSpeakable("Molecular SO2 target.")).toBe("Molecular sulfur dioxide target.");
    expect(toSpeakable("Molecular SO₂ target.")).toBe("Molecular sulfur dioxide target.");
  });

  it("reads temperatures with their scale", () => {
    expect(toSpeakable("Ferment at 28°C.")).toBe("Ferment at 28 degrees Celsius.");
    expect(toSpeakable("Held at 60°F.")).toBe("Held at 60 degrees Fahrenheit.");
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
