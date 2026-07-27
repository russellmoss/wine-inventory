import { describe, expect, it } from "vitest";
import {
  BOUNDARY_RISK_MARGIN,
  FRUIT_PRESENT_STAGES,
  composePhenologyBlockCore,
  type ComposeBlockInput,
  type PhenologyBlockDTO,
} from "@/lib/phenology/dto";
import type { PhenologyEstimate, PhenologySource } from "@/lib/phenology/stage-core";
import type { GrowthEstimate } from "@/lib/phenology/growth-core";
import type { PhenoStage } from "@/lib/fieldnotes/types";

function stageEstimate(over: Partial<PhenologyEstimate> = {}): PhenologyEstimate {
  return {
    stage: "FRUIT_SET",
    stagePct: null,
    source: "OBSERVED",
    anchorDate: "2026-06-20",
    anchorAgeDays: 0,
    biofixDate: "2026-04-15",
    gddSinceBiofix: 480,
    daysCounted: 66,
    confidence: "HIGH",
    reasonCode: null,
    reason: null,
    spanCompleteness: 1,
    seasonCompletenessFraction: 0.9,
    ...over,
  };
}

function growthEstimate(over: Partial<GrowthEstimate> = {}): GrowthEstimate {
  return {
    cmPerWeek: 7,
    cmPerWeekRange: null,
    unprotectedNewLeafFraction: 0.33,
    unprotectedNewLeafRange: null,
    shootsAtLeast10cm: true,
    basis: "MEASURED",
    confidence: "HIGH",
    spanDays: 7,
    fromDate: "2026-06-13",
    toDate: "2026-06-20",
    reasonCode: null,
    reason: null,
    ...over,
  };
}

function compose(over: Partial<ComposeBlockInput> = {}): PhenologyBlockDTO {
  return composePhenologyBlockCore({
    blockId: "b1",
    blockLabel: "Block 1",
    stage: stageEstimate(),
    growth: growthEstimate(),
    trellisSystem: "VSP",
    blockCompactness: null,
    varietyCompactness: "TIGHT",
    fruitZoneLeafRemoval: "PARTIAL",
    hedgedThisWeek: false,
    clusterDamage: "NONE",
    vinegarFlyPressure: "NOT_ASSESSED",
    ...over,
  });
}

describe("fruitPresent inherits the stage's provenance", () => {
  it("is derived from the stage, never independently asserted", () => {
    for (const stage of FRUIT_PRESENT_STAGES) {
      expect(compose({ stage: stageEstimate({ stage }) }).fruitPresent, stage).toBe(true);
    }
    for (const stage of ["DORMANT", "BUD_BREAK", "FLOWERING"] as PhenoStage[]) {
      expect(compose({ stage: stageEstimate({ stage }) }).fruitPresent, stage).toBe(false);
    }
  });

  it("carries the SAME source as the stage it came from", () => {
    for (const source of ["OBSERVED", "INTERPOLATED", "MODELED"] as PhenologySource[]) {
      const dto = compose({ stage: stageEstimate({ source }) });
      expect(dto.fruitPresentSource).toBe(dto.stageSource);
      expect(dto.fruitPresentSource).toBe(source);
    }
  });

  it("is null — not false — when the stage is unknown", () => {
    // `false` would tell an interlock there is no fruit on the vine. There might be.
    const dto = compose({ stage: stageEstimate({ stage: null, source: null, reasonCode: "NO_BIOFIX" }) });
    expect(dto.fruitPresent).toBeNull();
    expect(dto.fruitPresent).not.toBe(false);
  });
});

describe("boundaryRisk", () => {
  it("fires near a transition when the stage is an ESTIMATE", () => {
    // FLOWERING 100% sits on the FRUIT_SET edge.
    const dto = compose({ stage: stageEstimate({ stage: "FLOWERING", stagePct: 100, source: "INTERPOLATED" }) });
    expect(dto.boundaryRisk).toBe(true);
  });

  it("NEVER fires on an OBSERVED stage — a human actually looked", () => {
    const dto = compose({ stage: stageEstimate({ stage: "FLOWERING", stagePct: 100, source: "OBSERVED" }) });
    expect(dto.boundaryRisk).toBe(false);
  });

  it("does not fire mid-stage", () => {
    const dto = compose({ stage: stageEstimate({ stage: "FLOWERING", stagePct: 50, source: "MODELED" }) });
    expect(dto.boundaryRisk).toBe(false);
  });

  it("is false, not null, when the stage is unknown — the refusal already says everything", () => {
    const dto = compose({ stage: stageEstimate({ stage: null, source: null }) });
    expect(dto.boundaryRisk).toBe(false);
    expect(dto.stage).toBeNull();
  });

  it("the margin is a named constant, not a literal buried in a condition", () => {
    expect(BOUNDARY_RISK_MARGIN).toBeGreaterThan(0);
    expect(BOUNDARY_RISK_MARGIN).toBeLessThan(0.5);
  });
});

describe("cluster compactness resolves through D12, with its source", () => {
  it("block override beats variety default", () => {
    const dto = compose({ blockCompactness: "LOOSE", varietyCompactness: "TIGHT" });
    expect(dto.clusterCompactness).toBe("LOOSE");
    expect(dto.clusterCompactnessSource).toBe("BLOCK");
  });

  it("falls back to the variety default and says so", () => {
    expect(compose().clusterCompactness).toBe("TIGHT");
    expect(compose().clusterCompactnessSource).toBe("VARIETY");
  });

  it("is null + UNKNOWN when nothing is recorded", () => {
    const dto = compose({ blockCompactness: null, varietyCompactness: null });
    expect(dto.clusterCompactness).toBeNull();
    expect(dto.clusterCompactnessSource).toBe("UNKNOWN");
  });
});

describe("scouting state is carried through as three values, never two", () => {
  it("marks a NOT_ASSESSED field as unscouted while keeping the raw value", () => {
    const dto = compose();
    expect(dto.vinegarFlyPressure).toBe("NOT_ASSESSED");
    expect(dto.vinegarFlyScouted).toBe(false);
    expect(dto.clusterDamage).toBe("NONE");
    expect(dto.clusterDamageScouted).toBe(true);
    expect(dto.honesty.scoutingGap).toBe(true);
  });

  it("a null scouting field is also a gap, distinct from NONE", () => {
    const dto = compose({ clusterDamage: null, vinegarFlyPressure: null });
    expect(dto.clusterDamageScouted).toBe(false);
    expect(dto.honesty.scoutingGap).toBe(true);
  });

  it("no gap only when BOTH were genuinely checked", () => {
    const dto = compose({ clusterDamage: "TRACE", vinegarFlyPressure: "NONE" });
    expect(dto.honesty.scoutingGap).toBe(false);
  });
});

describe("the honesty block", () => {
  it("flags a derived stage", () => {
    expect(compose().honesty.stageIsEstimated).toBe(false);
    expect(compose({ stage: stageEstimate({ source: "INTERPOLATED" }) }).honesty.stageIsEstimated).toBe(true);
    expect(compose({ stage: stageEstimate({ source: "MODELED" }) }).honesty.stageIsEstimated).toBe(true);
  });

  it("flags a derived growth figure — including the leaf-expansion tail", () => {
    expect(compose().honesty.growthIsEstimated).toBe(false);
    expect(compose({ growth: growthEstimate({ basis: "BAND_RANGE" }) }).honesty.growthIsEstimated).toBe(true);
    expect(compose({ growth: growthEstimate({ basis: "LEAF_EXPANSION_TAIL" }) }).honesty.growthIsEstimated).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The negative assertion (test/weather-contract.test.ts style): nothing in this DTO lets a
// consumer read an estimate as an observation.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("no field conflates measured with estimated", () => {
  it("every derived value ships with a provenance field beside it", () => {
    const dto = compose({ stage: stageEstimate({ source: "MODELED" }) });
    expect(dto.stageSource).not.toBeUndefined();
    expect(dto.fruitPresentSource).not.toBeUndefined();
    expect(dto.growthBasis).not.toBeUndefined();
    expect(dto.stageConfidence).not.toBeUndefined();
    expect(dto.growthConfidence).not.toBeUndefined();
    expect(dto.clusterCompactnessSource).not.toBeUndefined();
  });

  it("carries NO bare aggregate that a consumer could read without its provenance", () => {
    // If someone later adds e.g. `summary: string` or `stageText`, this fails and they have to
    // justify it — which is the point. Provenance travels WITH the value, never separately.
    const allowed = new Set([
      "blockId", "blockLabel",
      "stage", "stagePct", "stageSource", "stageConfidence", "anchorDate", "anchorAgeDays",
      "biofixDate", "gddSinceBiofix", "stageReasonCode", "stageReason",
      "fruitPresent", "fruitPresentSource", "boundaryRisk",
      "cmPerWeek", "cmPerWeekRange", "unprotectedNewLeafFraction", "unprotectedNewLeafRange",
      "shootsAtLeast10cm", "growthBasis", "growthConfidence", "growthReasonCode", "growthReason",
      "trellisSystem", "clusterCompactness", "clusterCompactnessSource", "fruitZoneLeafRemoval",
      "hedgedThisWeek",
      "clusterDamage", "vinegarFlyPressure", "clusterDamageScouted", "vinegarFlyScouted",
      "honesty",
    ]);
    for (const key of Object.keys(compose())) {
      expect(allowed.has(key), `unexpected DTO field "${key}" — does it carry its provenance?`).toBe(true);
    }
  });

  it("a refusal never leaks a stale stage value alongside the reason", () => {
    const dto = compose({
      stage: stageEstimate({ stage: null, stagePct: null, source: null, confidence: null, reasonCode: "ANCHOR_TOO_OLD", reason: "too old" }),
    });
    expect(dto.stage).toBeNull();
    expect(dto.stagePct).toBeNull();
    expect(dto.stageSource).toBeNull();
    expect(dto.stageConfidence).toBeNull();
    expect(dto.stageReason).toBe("too old");
  });
});
