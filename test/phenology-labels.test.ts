import { describe, expect, it } from "vitest";
import {
  formatAnchorAge,
  growthLabel,
  phenologyChips,
  scoutingLabel,
  stageLabel,
  stageSourceBadge,
  stageSourceLabel,
  unprotectedLabel,
} from "@/lib/phenology/labels";
import { composePhenologyBlockCore, type PhenologyBlockDTO } from "@/lib/phenology/dto";
import type { PhenologyEstimate, PhenologySource } from "@/lib/phenology/stage-core";
import type { GrowthEstimate } from "@/lib/phenology/growth-core";

// This repo has no jsdom and no RTL, so the honesty COPY would otherwise be untestable and left
// to a human remembering to look. These are the rules §3.5 and §3.6 as ordinary assertions.

/** Words that read as an all-clear. None of them may appear in an unknown/gap string. */
const ALL_CLEAR_WORDS = ["clear", "none seen", "no restriction", "no damage", "healthy", "fine"];

function dto(over: {
  stage?: Partial<PhenologyEstimate>;
  growth?: Partial<GrowthEstimate>;
  clusterDamage?: PhenologyBlockDTO["clusterDamage"];
  vinegarFlyPressure?: PhenologyBlockDTO["vinegarFlyPressure"];
} = {}): PhenologyBlockDTO {
  return composePhenologyBlockCore({
    blockId: "b1",
    blockLabel: "Block 1",
    stage: {
      stage: "FRUIT_SET", stagePct: null, source: "OBSERVED", anchorDate: "2026-06-20",
      anchorAgeDays: 0, biofixDate: "2026-04-15", gddSinceBiofix: 480, daysCounted: 66,
      confidence: "HIGH", reasonCode: null, reason: null, spanCompleteness: 1,
      seasonCompletenessFraction: 0.9, ...over.stage,
    },
    growth: {
      cmPerWeek: 7, cmPerWeekRange: null, unprotectedNewLeafFraction: 0.33,
      unprotectedNewLeafRange: null, shootsAtLeast10cm: true, basis: "MEASURED",
      confidence: "HIGH", spanDays: 7, fromDate: "2026-06-13", toDate: "2026-06-20",
      reasonCode: null, reason: null, ...over.growth,
    },
    trellisSystem: "VSP",
    blockCompactness: null,
    varietyCompactness: "TIGHT",
    fruitZoneLeafRemoval: "PARTIAL",
    hedgedThisWeek: false,
    clusterDamage: over.clusterDamage ?? "NONE",
    vinegarFlyPressure: over.vinegarFlyPressure ?? "NONE",
  });
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §3.5 — estimated is labelled estimated, WITH THE ESTIMATOR NAMED.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("provenance labels (rule §3.5)", () => {
  it("BOTH derived tiers contain the word 'estimated'", () => {
    for (const source of ["INTERPOLATED", "MODELED"] as PhenologySource[]) {
      expect(stageSourceLabel(source, 5).toLowerCase(), source).toContain("estimated");
      expect(stageSourceBadge(source, 5).toLowerCase(), source).toContain("estimated");
    }
  });

  it("BOTH derived tiers NAME the estimator", () => {
    expect(stageSourceLabel("INTERPOLATED", 5)).toContain("degree-day");
    expect(stageSourceLabel("INTERPOLATED", 5)).toContain("interpolation");
    expect(stageSourceLabel("MODELED", 5)).toContain("degree-day");
    expect(stageSourceLabel("MODELED", 5)).toContain("model");
  });

  it("the two derived tiers are DISTINGUISHABLE — interpolated is not extrapolated", () => {
    expect(stageSourceLabel("INTERPOLATED", 5)).not.toBe(stageSourceLabel("MODELED", 5));
    expect(stageSourceLabel("MODELED", 5)).toContain("past the last field observation");
  });

  it("an observation is never called estimated", () => {
    expect(stageSourceLabel("OBSERVED", 0).toLowerCase()).not.toContain("estimated");
    expect(stageSourceLabel("OBSERVED", 0).toLowerCase()).toContain("observed");
  });

  it("the badge carries the ANCHOR AGE (council S8) — a nudge, not just a label", () => {
    expect(stageSourceBadge("INTERPOLATED", 12)).toContain("12 days ago");
    expect(stageSourceLabel("MODELED", 12)).toContain("12 days ago");
  });

  it("formats the age in plain words", () => {
    expect(formatAnchorAge(0)).toBe("today");
    expect(formatAnchorAge(1)).toBe("yesterday");
    expect(formatAnchorAge(12)).toBe("12 days ago");
    expect(formatAnchorAge(null)).toBe("date unknown");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// §3.6 — a gap renders as UNKNOWN, never as clear.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("an unknown stage renders as its own state (rule §3.6)", () => {
  const unknown = dto({
    stage: { stage: null, stagePct: null, source: null, confidence: null, reasonCode: "NO_BIOFIX", reason: "No bud-break observation for this block." },
  });

  it("renders a distinct 'not known' string", () => {
    expect(stageLabel(unknown).toLowerCase()).toContain("not known");
    expect(stageSourceLabel(null, null).toLowerCase()).toContain("not known");
  });

  it("contains NONE of the words that read as an all-clear", () => {
    const text = `${stageLabel(unknown)} ${stageSourceLabel(null, null)}`.toLowerCase();
    for (const word of ALL_CLEAR_WORDS) {
      expect(text, `"${word}" must not appear in an unknown string`).not.toContain(word);
    }
  });

  it("carries the REASON, so the grower knows what to do about it", () => {
    expect(stageLabel(unknown)).toContain("bud-break");
  });
});

describe("the three scouting states are three different sentences", () => {
  it("null says nobody checked", () => {
    const s = scoutingLabel("clusterDamage", null).toLowerCase();
    expect(s).toContain("nobody has checked");
    expect(s).not.toContain("none");
  });

  it("NOT_ASSESSED says the block was visited but this was not checked", () => {
    const s = scoutingLabel("clusterDamage", "NOT_ASSESSED").toLowerCase();
    expect(s).toContain("not assessed");
    expect(s).not.toContain("none seen");
  });

  it("NONE says someone looked and saw nothing — the ONLY clean reading", () => {
    expect(scoutingLabel("clusterDamage", "NONE").toLowerCase()).toContain("none seen (checked)");
  });

  it("all three strings are distinct", () => {
    const set = new Set([
      scoutingLabel("vinegarFlyPressure", null),
      scoutingLabel("vinegarFlyPressure", "NOT_ASSESSED"),
      scoutingLabel("vinegarFlyPressure", "NONE"),
    ]);
    expect(set.size).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Growth copy.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("growth copy", () => {
  it("a measured rate says measured", () => {
    expect(growthLabel(dto(), "METRIC")).toContain("measured");
    expect(growthLabel(dto(), "METRIC")).toContain("7 cm/week");
  });

  it("a band-derived rate renders as a RANGE and says it is a range, not a figure", () => {
    const banded = dto({
      growth: { cmPerWeek: null, cmPerWeekRange: { min: 0, max: 50 }, basis: "BAND_RANGE" },
    });
    const text = growthLabel(banded, "METRIC");
    expect(text).toContain("0–50 cm/week");
    expect(text).toContain("range not a figure");
    expect(text).toContain("estimated");
  });

  it("an unknown rate says not known and names why — never 'no growth'", () => {
    const refused = dto({
      growth: { cmPerWeek: null, cmPerWeekRange: null, basis: "UNKNOWN", reasonCode: "HEDGE_IN_SPAN", reason: "The canopy was hedged on 2026-06-08." },
    });
    const text = growthLabel(refused, "METRIC");
    expect(text.toLowerCase()).toContain("not known");
    expect(text).toContain("hedged");
    expect(text.toLowerCase()).not.toContain("no growth");
    expect(text).not.toContain("0 cm");
  });

  it("the leaf-expansion tail is labelled as an estimate AND explains itself", () => {
    const tail = dto({
      growth: { unprotectedNewLeafFraction: 0.05, basis: "LEAF_EXPANSION_TAIL" },
    });
    const text = unprotectedLabel(tail);
    expect(text).toContain("estimated");
    expect(text).toContain("after the shoot tip stops");
  });

  it("an unknown unprotected fraction never renders as zero", () => {
    const refused = dto({
      growth: { unprotectedNewLeafFraction: null, unprotectedNewLeafRange: null, basis: "UNKNOWN" },
    });
    const text = unprotectedLabel(refused);
    expect(text.toLowerCase()).toContain("not known");
    expect(text).not.toContain("0%");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The chips the UI actually renders.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("read-back chips", () => {
  it("an estimated stage always ships a chip containing 'estimated' — never colour alone", () => {
    const est = dto({ stage: { source: "INTERPOLATED", anchorAgeDays: 9 } });
    const chips = phenologyChips(est, "METRIC");
    const text = chips.map((c) => c.text).join(" | ").toLowerCase();
    expect(text).toContain("estimated");
    // And it is not carried by tone alone: strip every tone and the word is still there.
    expect(chips.some((c) => c.text.toLowerCase().includes("estimated"))).toBe(true);
  });

  it("an unknown stage produces an amber 'not known' chip, never a green one", () => {
    const unknown = dto({ stage: { stage: null, source: null, reasonCode: "NO_BIOFIX", reason: "No bud break recorded." } });
    const chips = phenologyChips(unknown, "METRIC");
    const stageChip = chips[0];
    expect(stageChip.text.toLowerCase()).toContain("not known");
    expect(stageChip.tone).toBe("amber");
    expect(chips.every((c) => c.tone !== "green" || !c.text.toLowerCase().includes("not known"))).toBe(true);
  });

  it("boundaryRisk surfaces as a 'confirm before acting' chip", () => {
    const near = dto({ stage: { stage: "FLOWERING", stagePct: 100, source: "MODELED", anchorAgeDays: 6 } });
    const text = phenologyChips(near, "METRIC").map((c) => c.text).join(" | ");
    expect(text).toContain("confirm before acting");
  });

  it("the ≥10 cm threshold renders as a plain yes/no, because it IS exact", () => {
    expect(phenologyChips(dto(), "METRIC").some((c) => c.text === "Shoots ≥ 10 cm")).toBe(true);
    const short = dto({ growth: { shootsAtLeast10cm: false } });
    expect(phenologyChips(short, "METRIC").some((c) => c.text === "Shoots under 10 cm")).toBe(true);
  });

  it("a NOT_ASSESSED scouting chip is amber and says so — never green", () => {
    const gap = dto({ clusterDamage: "NOT_ASSESSED" });
    const chip = phenologyChips(gap, "METRIC").find((c) => c.text.includes("Cluster damage"))!;
    expect(chip.tone).toBe("amber");
    expect(chip.text).toContain("not assessed");
  });

  it("a genuinely-checked clean scouting chip IS green", () => {
    const chip = phenologyChips(dto(), "METRIC").find((c) => c.text.includes("Cluster damage"))!;
    expect(chip.tone).toBe("green");
    expect(chip.text).toContain("checked");
  });
});
