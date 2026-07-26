import { describe, expect, it } from "vitest";
import { summarizePhenology } from "@/lib/assistant/tools/query-field-reports";
import { composePhenologyBlockCore, type PhenologyBlockDTO } from "@/lib/phenology/dto";
import type { PhenologyEstimate, PhenologySource } from "@/lib/phenology/stage-core";
import type { GrowthEstimate } from "@/lib/phenology/growth-core";

// COUNCIL S2. `verify:ai-native` builds an import graph and proves a core is REACHABLE from a
// tool. It cannot prove the tool SERIALIZES anything — a tool can import the read seam, never
// touch it, and the check still passes. This file is the missing half: it asserts the provenance
// fields actually reach the model, so the assistant can never present an estimate as an
// observation because the payload simply did not carry the distinction.

function dto(over: {
  stage?: Partial<PhenologyEstimate>;
  growth?: Partial<GrowthEstimate>;
} = {}): PhenologyBlockDTO {
  return composePhenologyBlockCore({
    blockId: "b1",
    blockLabel: "Block 4",
    stage: {
      stage: "VERAISON", stagePct: 50, source: "INTERPOLATED", anchorDate: "2026-08-01",
      anchorAgeDays: 9, biofixDate: "2026-04-15", gddSinceBiofix: 980, daysCounted: 130,
      confidence: "MEDIUM", reasonCode: null, reason: null, spanCompleteness: 0.99,
      seasonCompletenessFraction: 0.95, ...over.stage,
    },
    growth: {
      cmPerWeek: 5, cmPerWeekRange: null, unprotectedNewLeafFraction: 0.12,
      unprotectedNewLeafRange: null, shootsAtLeast10cm: true, basis: "MEASURED",
      confidence: "HIGH", spanDays: 7, fromDate: "2026-08-03", toDate: "2026-08-10",
      reasonCode: null, reason: null, ...over.growth,
    },
    trellisSystem: "VSP",
    blockCompactness: null,
    varietyCompactness: "TIGHT",
    fruitZoneLeafRemoval: "PARTIAL",
    hedgedThisWeek: false,
    clusterDamage: "TRACE",
    vinegarFlyPressure: "NOT_ASSESSED",
  });
}

describe("the query_field_reports phenology payload carries its provenance", () => {
  it("serializes the four fields the reachability check cannot prove", () => {
    const p = summarizePhenology(dto());
    expect(p.source).toBe("INTERPOLATED");
    expect(p.anchorAgeDays).toBe(9);
    expect(p.fruitPresent).toBe(true);
    expect(p.boundaryRisk).toBe(false);
  });

  it("every stage value ships beside a source — no bare stage reaches the model", () => {
    for (const source of ["OBSERVED", "INTERPOLATED", "MODELED"] as PhenologySource[]) {
      const p = summarizePhenology(dto({ stage: { source } }));
      expect(p.stage, source).not.toBeNull();
      expect(p.source, source).toBe(source);
      expect(p.sourceExplanation, source).toBeTruthy();
    }
  });

  it("the explanation string spells out 'estimated' for both derived tiers", () => {
    for (const source of ["INTERPOLATED", "MODELED"] as PhenologySource[]) {
      expect(summarizePhenology(dto({ stage: { source } })).sourceExplanation.toLowerCase()).toContain("estimated");
    }
    expect(summarizePhenology(dto({ stage: { source: "OBSERVED" } })).sourceExplanation.toLowerCase()).not.toContain("estimated");
  });

  it("fruitPresent inherits the stage's source, so an interlock cannot read a guess as fact", () => {
    const p = summarizePhenology(dto({ stage: { source: "MODELED" } }));
    expect(p.fruitPresentSource).toBe("MODELED");
    expect(p.fruitPresentSource).toBe(p.source);
  });

  it("boundaryRisk ships with an instruction, not just a boolean the model may ignore", () => {
    const near = summarizePhenology(dto({ stage: { stage: "FLOWERING", stagePct: 100, source: "MODELED" } }));
    expect(near.boundaryRisk).toBe(true);
    expect(near.boundaryRiskNote).toContain("confirming in the field");
    expect(near.boundaryRiskNote).toContain("ESTIMATE");
  });

  it("an unknown stage carries the REASON, never a bare null the model can gloss over", () => {
    const p = summarizePhenology(
      dto({ stage: { stage: null, stagePct: null, source: null, confidence: null, reasonCode: "NO_BIOFIX", reason: "No bud-break observation for this block." } }),
    );
    expect(p.stage).toBeNull();
    expect(p.source).toBeNull();
    expect(p.stageUnknownReason).toContain("bud-break");
    expect(p.sourceExplanation.toLowerCase()).toContain("not known");
  });

  it("an unknown GROWTH figure carries its reason too", () => {
    const p = summarizePhenology(
      dto({ growth: { cmPerWeek: null, unprotectedNewLeafFraction: null, basis: "UNKNOWN", reasonCode: "HEDGE_IN_SPAN", reason: "The canopy was hedged on 2026-08-05." } }),
    );
    expect(p.cmPerWeek).toBeNull();
    expect(p.growthUnknownReason).toContain("hedged");
  });

  it("a band-derived growth figure reaches the model as a RANGE, never as a point", () => {
    const p = summarizePhenology(
      dto({ growth: { cmPerWeek: null, cmPerWeekRange: { min: 0, max: 50 }, unprotectedNewLeafFraction: null, unprotectedNewLeafRange: { min: 0, max: 0.66 }, basis: "BAND_RANGE" } }),
    );
    expect(p.cmPerWeek).toBeNull();
    expect(p.cmPerWeekRange).toEqual({ min: 0, max: 50 });
    expect(p.unprotectedNewLeafFraction).toBeNull();
    expect(p.unprotectedNewLeafRange).toEqual({ min: 0, max: 0.66 });
  });

  it("the honesty block reaches the model intact", () => {
    const p = summarizePhenology(dto());
    expect(p.honesty.stageIsEstimated).toBe(true);
    expect(p.honesty.scoutingGap).toBe(true); // vinegar fly is NOT_ASSESSED
  });

  it("the ≥10 cm threshold — S5b's actual input — is present and exact", () => {
    expect(summarizePhenology(dto()).shootsAtLeast10cm).toBe(true);
  });

  it("survives JSON round-tripping, which is how it actually reaches the model", () => {
    const p = JSON.parse(JSON.stringify(summarizePhenology(dto())));
    expect(p.source).toBe("INTERPOLATED");
    expect(p.anchorAgeDays).toBe(9);
    expect(p.fruitPresent).toBe(true);
    expect(p.boundaryRisk).toBe(false);
  });
});
