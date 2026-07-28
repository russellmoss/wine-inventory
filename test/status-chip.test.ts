/**
 * StatusChip and the six-value status ramp (AC-C6).
 *
 * The point of the ramp is that six independent status→colour maps became one.
 * These assertions guard the two ways that regresses: a variant losing its
 * non-colour encoding (the glyph), and a mapping module quietly reintroducing a
 * seventh value or a Badge tone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STATUS_GLYPH, STATUS_VARIANTS, isStatusVariant } from "@/components/ui/status-variants";
import { blendTrialStatusTone, BLEND_TRIAL_TONE } from "@/lib/blend/trial-status";

const CHIP_SRC = readFileSync(
  fileURLToPath(new URL("../src/components/ui/StatusChip.tsx", import.meta.url)),
  "utf8",
);

describe("the status ramp", () => {
  it("has exactly six values, in spec order", () => {
    expect(STATUS_VARIANTS).toEqual(["neutral", "active", "held", "done", "attention", "review"]);
  });

  it("gives every variant a distinct glyph — greyscale must stay readable (AC-C6)", () => {
    const glyphs = STATUS_VARIANTS.map((v) => STATUS_GLYPH[v]);
    expect(glyphs.every(Boolean)).toBe(true);
    expect(new Set(glyphs).size).toBe(STATUS_VARIANTS.length);
  });

  it("recognises its own values and nothing else", () => {
    for (const v of STATUS_VARIANTS) expect(isStatusVariant(v)).toBe(true);
    for (const v of ["gold", "blue", "maroon", "", null, 3]) expect(isStatusVariant(v)).toBe(false);
  });
});

describe("StatusChip", () => {
  it("hides the glyph from assistive tech — the visible text carries the meaning", () => {
    expect(CHIP_SRC).toContain('aria-hidden="true"');
  });

  it("requires text: `children` is not optional", () => {
    expect(CHIP_SRC).toMatch(/children:\s*React\.ReactNode;/);
    expect(CHIP_SRC).not.toMatch(/children\?:/);
  });

  it("reads its colours from the status tokens, never a literal", () => {
    expect(CHIP_SRC).toContain("var(--status-${variant}-bg)");
    expect(CHIP_SRC).toContain("var(--status-${variant}-fg)");
  });

  it("never renders wine — wine means brand and primary action only", () => {
    expect(CHIP_SRC).not.toContain("--wine-primary");
    expect(CHIP_SRC).not.toContain("--accent");
  });
});

describe("blendTrialStatusTone", () => {
  it("covers every BlendTrialStatus — the bug it replaces was silent neutral fallthrough", () => {
    // TrialsClient used to call the WORK-ORDER statusTone() on a BlendTrialStatus.
    // None of CHOSEN/PROMOTED/DISCARDED is a key there, so every trial past DRAFT
    // rendered neutral and the screen showed no status colour at all.
    expect(blendTrialStatusTone("DRAFT")).toBe("neutral");
    expect(blendTrialStatusTone("CHOSEN")).toBe("active");
    expect(blendTrialStatusTone("PROMOTED")).toBe("done");
    expect(blendTrialStatusTone("DISCARDED")).toBe("neutral");
  });

  it("does not flag DISCARDED — discarding a losing trial is a normal terminal state", () => {
    // `attention` here would make routine blend-trial history read as a wall of errors.
    expect(blendTrialStatusTone("DISCARDED")).not.toBe("attention");
  });

  it("fails soft on an unknown status", () => {
    expect(blendTrialStatusTone("WHATEVER")).toBe("neutral");
    expect(blendTrialStatusTone("")).toBe("neutral");
  });

  it("only ever returns ramp variants", () => {
    for (const v of Object.values(BLEND_TRIAL_TONE)) expect(STATUS_VARIANTS).toContain(v);
  });
});
