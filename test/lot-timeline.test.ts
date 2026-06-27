import { describe, it, expect } from "vitest";
import {
  vesselLabel,
  formatL,
  describeOperation,
  buildTimeline,
  currentState,
  type RawLine,
  type RawOperation,
} from "@/lib/lot/timeline";

// A minimal operation stub; tests override `type`/`correctsOperationId` as needed.
function op(over: Partial<RawOperation> = {}): RawOperation {
  return {
    id: 1,
    type: "SEED",
    observedAt: new Date("2026-03-01T10:00:00.000Z"),
    enteredBy: "cellar@bwc.bt",
    captureMethod: "MANUAL",
    note: null,
    correctsOperationId: null,
    ...over,
  };
}

// In-vessel leg (durable code snapshot present).
function inVessel(code: string, deltaL: number, type: "BARREL" | "TANK" = "BARREL", vesselId = `v-${code}`): RawLine {
  return { vesselId, vesselCode: code, vesselType: type, deltaL };
}
// External counter-account leg (vesselCode null).
function external(deltaL: number, reason: string): RawLine {
  return { vesselId: null, vesselCode: null, vesselType: null, deltaL, reason };
}

describe("vesselLabel", () => {
  it("labels barrels and tanks, falls back to bare code", () => {
    expect(vesselLabel("BARREL", "14")).toBe("Barrel 14");
    expect(vesselLabel("TANK", "1")).toBe("Tank 1");
    expect(vesselLabel(null, "X-9")).toBe("X-9");
    expect(vesselLabel(undefined, "X-9")).toBe("X-9");
  });
});

describe("formatL", () => {
  it("rounds to 2dp and trims trailing zeros", () => {
    expect(formatL(40)).toBe("40");
    expect(formatL(0.75)).toBe("0.75");
    expect(formatL(39.5)).toBe("39.5");
    expect(formatL(2.004)).toBe("2");
  });
});

describe("describeOperation — summaries", () => {
  it("SEED reads 'Seeded <vol> L into <vessel>'", () => {
    const ev = describeOperation(op({ type: "SEED" }), [
      inVessel("14", 225, "BARREL"),
      external(-225, "seed"),
    ]);
    expect(ev.summary).toBe("Seeded 225 L into Barrel 14");
    expect(ev.type).toBe("SEED");
  });

  it("SEED with legacy cutover is honest about Day-Zero", () => {
    const ev = describeOperation(
      op({ type: "SEED" }),
      [inVessel("14", 225, "BARREL"), external(-225, "seed")],
      { legacyCutover: true },
    );
    expect(ev.summary).toBe("Seeded 225 L into Barrel 14 at cutover (Day-Zero)");
  });

  it("RACK reads 'Racked <added> L from <src> to <dest>'", () => {
    const ev = describeOperation(op({ id: 5, type: "RACK" }), [
      inVessel("14", -40, "BARREL"),
      inVessel("1", 40, "TANK"),
    ]);
    expect(ev.summary).toBe("Racked 40 L from Barrel 14 to Tank 1");
  });

  it("RACK with loss appends the loss clause and uses the into-dest volume", () => {
    const ev = describeOperation(op({ id: 6, type: "RACK" }), [
      inVessel("14", -42, "BARREL"),
      inVessel("1", 40, "TANK"),
      external(2, "loss"),
    ]);
    expect(ev.summary).toBe("Racked 40 L from Barrel 14 to Tank 1 (2 L lost)");
  });

  it("BOTTLE reads 'Bottled <vol> L'", () => {
    const ev = describeOperation(op({ id: 7, type: "BOTTLE" }), [
      inVessel("14", -0.75, "BARREL"),
      external(0.75, "bottle"),
    ]);
    expect(ev.summary).toBe("Bottled 0.75 L");
  });

  it("LOSS reads 'Lost <vol> L from <src>'", () => {
    const ev = describeOperation(op({ id: 8, type: "LOSS" }), [
      inVessel("14", -3, "BARREL"),
      external(3, "loss"),
    ]);
    expect(ev.summary).toBe("Lost 3 L from Barrel 14");
  });

  it("DEPLETE reads 'Depleted <vol> L from <src>'", () => {
    const ev = describeOperation(op({ id: 9, type: "DEPLETE" }), [
      inVessel("1", -120, "TANK"),
      external(120, "deplete"),
    ]);
    expect(ev.summary).toBe("Depleted 120 L from Tank 1");
  });

  it("ADJUST reads up or down by the signed net", () => {
    const up = describeOperation(op({ id: 10, type: "ADJUST" }), [
      inVessel("14", 5, "BARREL"),
      external(-5, "adjust"),
    ]);
    expect(up.summary).toBe("Adjusted Barrel 14 up by 5 L");
    const down = describeOperation(op({ id: 11, type: "ADJUST" }), [
      inVessel("14", -5, "BARREL"),
      external(5, "adjust"),
    ]);
    expect(down.summary).toBe("Adjusted Barrel 14 down by 5 L");
  });

  it("CORRECTION reads 'Reverted operation #N'", () => {
    const ev = describeOperation(op({ id: 12, type: "CORRECTION", correctsOperationId: 6 }), [
      inVessel("14", 40, "BARREL"),
      inVessel("1", -40, "TANK"),
    ]);
    expect(ev.summary).toBe("Reverted operation #6");
    expect(ev.isCorrection).toBe(true);
    expect(ev.correctsId).toBe(6);
  });

  it("ADDITION reads the dose from its treatment (no lines)", () => {
    const ev = describeOperation(
      op({ id: 30, type: "ADDITION", treatments: [{ kind: "ADDITION", materialName: "DAP", rateValue: 30, rateBasis: "G_HL", computedTotal: 135, computedUnit: "g", durationMin: null, medium: null, micron: null }] }),
      [],
    );
    expect(ev.summary).toBe("Added 30 g/hL DAP → 135 g");
    expect(ev.legs).toHaveLength(0);
  });

  it("FINING reads 'Fined: rate material → grams'", () => {
    const ev = describeOperation(
      op({ id: 31, type: "FINING", treatments: [{ kind: "FINING", materialName: "BENTONITE", rateValue: 50, rateBasis: "G_HL", computedTotal: 11.25, computedUnit: "g", durationMin: null, medium: null, micron: null }] }),
      [],
    );
    expect(ev.summary).toBe("Fined: 50 g/hL BENTONITE → 11.25 g");
  });

  it("CAP_MGMT reads the cap kind + duration", () => {
    const ev = describeOperation(
      op({ id: 32, type: "CAP_MGMT", treatments: [{ kind: "PUMPOVER", materialName: null, rateValue: null, rateBasis: null, computedTotal: null, computedUnit: null, durationMin: 20, medium: null, micron: null }] }),
      [],
    );
    expect(ev.summary).toBe("Pump-over (20 min)");
  });

  it("FILTRATION reads medium/micron + the loss", () => {
    const ev = describeOperation(
      op({ id: 33, type: "FILTRATION", treatments: [{ kind: "FILTRATION", materialName: null, rateValue: null, rateBasis: null, computedTotal: null, computedUnit: null, durationMin: null, medium: "pad", micron: 0.45 }] }),
      [inVessel("1", -1, "TANK"), external(1, "filtration")],
    );
    expect(ev.summary).toBe("Filtered (pad, 0.45 µm) (1 L loss)");
  });

  it("TOPPING reads as a transfer into the target", () => {
    const ev = describeOperation(op({ id: 34, type: "TOPPING" }), [
      inVessel("KEG", -1.5, "BARREL"),
      inVessel("14", 1.5, "BARREL"),
    ]);
    expect(ev.summary).toBe("Topped 1.5 L from Barrel KEG into Barrel 14");
  });
});

describe("buildTimeline — neutral void pill", () => {
  it("marks a corrected neutral op as voided (pill text differs from a volumetric correction)", () => {
    const rawOps = [
      { op: op({ id: 40, type: "ADDITION", treatments: [{ kind: "ADDITION", materialName: "DAP", rateValue: 30, rateBasis: "G_HL", computedTotal: 135, computedUnit: "g", durationMin: null, medium: null, micron: null }] }), lines: [] },
    ];
    // The void CORRECTION has no lines/treatments → its id is supplied by the loader.
    const events = buildTimeline(rawOps, { correctedIds: new Set([40]) });
    expect(events[0].corrected).toBe(true);
    expect(events[0].voided).toBe(true);
  });
});

describe("describeOperation — legs", () => {
  it("external (vesselCode null) leg is labeled 'outside the cellar' and is not linkable", () => {
    const ev = describeOperation(op({ id: 7, type: "BOTTLE" }), [
      inVessel("14", -0.75, "BARREL"),
      external(0.75, "bottle"),
    ]);
    const ext = ev.legs.find((l) => l.isExternal)!;
    expect(ext.label).toBe("outside the cellar");
    expect(ext.vesselId).toBe(null);
    expect(ext.direction).toBe("in"); // +0.75 into the external account
    const src = ev.legs.find((l) => !l.isExternal)!;
    expect(src.label).toBe("Barrel 14");
    expect(src.vesselId).toBe("v-14");
    expect(src.direction).toBe("out");
  });

  it("a deleted vessel keeps its code snapshot but is not external and not linkable", () => {
    // vesselId SetNull on delete, but vesselCode snapshot survives.
    const deletedLeg: RawLine = { vesselId: null, vesselCode: "9", vesselType: null, deltaL: -10 };
    const ev = describeOperation(op({ id: 20, type: "RACK" }), [
      deletedLeg,
      inVessel("1", 10, "TANK"),
    ]);
    const leg = ev.legs.find((l) => l.vesselCode === "9")!;
    expect(leg.isExternal).toBe(false); // has a code -> real vessel, just deleted
    expect(leg.vesselId).toBe(null); // not linkable
    expect(leg.label).toBe("9"); // no type -> bare code fallback
  });
});

describe("buildTimeline", () => {
  it("flags an op that a later CORRECTION reverted (corrected, order-independent)", () => {
    // Loader passes newest-first (desc by id).
    const rawOps = [
      { op: op({ id: 6, type: "CORRECTION", correctsOperationId: 5 }), lines: [inVessel("14", 40), inVessel("1", -40, "TANK")] },
      { op: op({ id: 5, type: "RACK" }), lines: [inVessel("14", -40), inVessel("1", 40, "TANK")] },
      { op: op({ id: 1, type: "SEED" }), lines: [inVessel("14", 225), external(-225, "seed")] },
    ];
    const events = buildTimeline(rawOps);
    const rack = events.find((e) => e.id === 5)!;
    const corr = events.find((e) => e.id === 6)!;
    const seed = events.find((e) => e.id === 1)!;
    expect(rack.corrected).toBe(true);
    expect(corr.corrected).toBe(false);
    expect(corr.isCorrection).toBe(true);
    expect(seed.corrected).toBe(false);
    // order preserved (newest-first as passed)
    expect(events.map((e) => e.id)).toEqual([6, 5, 1]);
  });

  it("marks only the genesis SEED as the cutover when the lot is legacy", () => {
    const rawOps = [
      { op: op({ id: 3, type: "SEED" }), lines: [inVessel("2", 50, "TANK"), external(-50, "seed")] },
      { op: op({ id: 1, type: "SEED" }), lines: [inVessel("14", 225), external(-225, "seed")] },
    ];
    const events = buildTimeline(rawOps, { legacy: true });
    expect(events.find((e) => e.id === 1)!.summary).toContain("at cutover (Day-Zero)");
    expect(events.find((e) => e.id === 3)!.summary).not.toContain("cutover");
  });

  it("returns [] for a lot with no operations", () => {
    expect(buildTimeline([])).toEqual([]);
  });
});

describe("currentState", () => {
  it("sums volume across vessels and labels + sorts locations", () => {
    const cs = currentState([
      { vesselId: "v-1", vesselCode: "1", vesselType: "TANK", volumeL: 120.5 },
      { vesselId: "v-14", vesselCode: "14", vesselType: "BARREL", volumeL: 40 },
    ]);
    expect(cs.totalL).toBe(160.5);
    expect(cs.locations.map((l) => l.label)).toEqual(["Barrel 14", "Tank 1"]);
    expect(cs.locations[0].volumeL).toBe(40);
  });

  it("empty holdings -> 0 L and no locations", () => {
    const cs = currentState([]);
    expect(cs.totalL).toBe(0);
    expect(cs.locations).toEqual([]);
  });
});
