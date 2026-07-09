import { describe, it, expect } from "vitest";
import {
  vesselLabel,
  formatL,
  timeLabel,
  describeOperation,
  buildTimeline,
  currentState,
  describeMeasurementPanel,
  describeTastingNote,
  describeSample,
  describeVesselActivity,
  describeWorkOrder,
  mergeTimeline,
  type RawLine,
  type RawOperation,
  type RawPanel,
  type RawVesselActivity,
  type RawWorkOrder,
} from "@/lib/lot/timeline";
import { VESSEL_ACTIVITY_KINDS } from "@/lib/cellar/vessel-activity-vocab";

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

  it("LOSS reads 'Dumped <vol> L from <src>' (loss = dump; evaporation is derived from topping)", () => {
    const ev = describeOperation(op({ id: 8, type: "LOSS" }), [
      inVessel("14", -3, "BARREL"),
      external(3, "dump"),
    ]);
    expect(ev.summary).toBe("Dumped 3 L from Barrel 14");
  });

  it("LOSS can display a controlled long-tail/custom label without changing the op type", () => {
    const ev = describeOperation(op({ id: 81, type: "LOSS", displayLabel: "Drain to waste" }), [
      inVessel("1", -12, "TANK"),
      external(12, "dump"),
    ]);
    expect(ev.summary).toBe("Drain to waste: 12 L from Tank 1");
    expect(ev.type).toBe("LOSS");
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

  it("CAP_MGMT uses the canonical CAP_LABELS incl. BATONNAGE (drift fix)", () => {
    const ev = describeOperation(
      op({ id: 35, type: "CAP_MGMT", treatments: [{ kind: "BATONNAGE", materialName: null, rateValue: null, rateBasis: null, computedTotal: null, computedUnit: null, durationMin: null, medium: null, micron: null }] }),
      [],
    );
    expect(ev.summary).toBe("Bâtonnage (lees stir)");
  });

  it("CAP_MGMT labels PULSE_AIR from the canonical map", () => {
    const ev = describeOperation(
      op({ id: 36, type: "CAP_MGMT", treatments: [{ kind: "PULSE_AIR", materialName: null, rateValue: null, rateBasis: null, computedTotal: null, computedUnit: null, durationMin: 5, medium: null, micron: null }] }),
      [],
    );
    expect(ev.summary).toBe("Pulse-air (5 min)");
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

// ── Phase 4: standalone-record describe + hybrid merge ──

function panel(over: Partial<RawPanel> = {}): RawPanel {
  return {
    id: "panel-1",
    observedAt: new Date("2026-03-07T10:00:00.000Z"),
    enteredByEmail: "cellar@bwc.bt",
    captureMethod: "MANUAL",
    note: null,
    sampleId: null,
    createdAt: new Date("2026-03-07T10:00:00.000Z"),
    readings: [],
    ...over,
  };
}

describe("describeMeasurementPanel", () => {
  it("summarizes readings with registry labels + precision and derives molecular SO₂", () => {
    const item = describeMeasurementPanel(
      panel({
        readings: [
          { analyte: "PH", value: 3.5, unit: "pH" },
          { analyte: "FREE_SO2", value: 40, unit: "mg/L" },
        ],
      }),
    );
    expect(item.kind).toBe("MEASUREMENT");
    expect(item.summary).toBe("pH 3.50 · Free SO₂ 40 mg/L");
    expect(item.molecular).not.toBeNull();
    expect(item.molecular!.molecularSO2).toBeCloseTo(0.8, 2);
  });

  it("derives no molecular SO₂ without both free SO₂ and pH in the panel", () => {
    const item = describeMeasurementPanel(panel({ readings: [{ analyte: "PH", value: 3.5, unit: "pH" }] }));
    expect(item.molecular).toBeNull();
  });

  it("falls back to the raw key for an unknown stored analyte (append-only safety)", () => {
    const item = describeMeasurementPanel(panel({ readings: [{ analyte: "MYSTERY", value: 1.23, unit: "x" }] }));
    expect(item.readings[0].label).toBe("MYSTERY");
    expect(item.summary).toBe("MYSTERY 1.23 x");
  });
});

describe("describeTastingNote / describeSample", () => {
  it("tasting summary reads score + readiness", () => {
    const t = describeTastingNote({
      id: "t1",
      observedAt: new Date("2026-03-07T10:00:00.000Z"),
      enteredByEmail: "cellar@bwc.bt",
      captureMethod: "MANUAL",
      note: null,
      createdAt: new Date("2026-03-07T10:00:00.000Z"),
      appearance: null,
      aroma: "ripe cherry",
      flavor: null,
      tannin: 4,
      acidity: 3,
      body: null,
      finish: null,
      score: 92,
      scoreScale: "HUNDRED_POINT",
      readiness: "READY_TO_BOTTLE",
    });
    expect(t.summary).toBe("Tasting · 92/100 · ready to bottle");
    expect(t.structure.tannin).toBe(4);
  });

  it("sample summary reads status + source + lab", () => {
    const s = describeSample({
      id: "s1",
      pulledAt: new Date("2026-03-07T10:00:00.000Z"),
      enteredByEmail: "cellar@bwc.bt",
      captureMethod: "MANUAL",
      note: null,
      createdAt: new Date("2026-03-07T10:00:00.000Z"),
      status: "PENDING",
      source: "Barrel A3",
      lab: "ETS",
    });
    expect(s.summary).toBe("Sample pending result · Barrel A3 (ETS)");
    expect(s.observedAt).toBe("2026-03-07T10:00:00.000Z");
  });
});

describe("mergeTimeline — hybrid ordering", () => {
  // Loader passes ops newest-first by id (the fold order). observedAt is display-only.
  const ops = buildTimeline([
    { op: op({ id: 3, type: "ADDITION", observedAt: new Date("2026-03-10T00:00:00Z"), treatments: [{ kind: "ADDITION", materialName: "DAP", rateValue: 1, rateBasis: "G_HL", computedTotal: 1, computedUnit: "g", durationMin: null, medium: null, micron: null }] }), lines: [] },
    { op: op({ id: 2, type: "SEED", observedAt: new Date("2026-03-05T00:00:00Z") }), lines: [inVessel("1", 100, "TANK"), external(-100, "seed")] },
    { op: op({ id: 1, type: "SEED", observedAt: new Date("2026-03-01T00:00:00Z") }), lines: [inVessel("1", 50, "TANK"), external(-50, "seed")] },
  ]);

  it("D14 regression: an ops-only lot is byte-identical in order to buildTimeline", () => {
    const merged = mergeTimeline(ops, []);
    expect(merged.map((e) => e.id)).toEqual([3, 2, 1]);
    expect(merged.every((e) => e.kind === "OP")).toBe(true);
  });

  it("slots a backdated panel between the correct ops by observedAt", () => {
    const p = describeMeasurementPanel(panel({ id: "p", observedAt: new Date("2026-03-07T00:00:00Z"), readings: [{ analyte: "PH", value: 3.4, unit: "pH" }] }));
    const merged = mergeTimeline(ops, [p]);
    // Mar07 is newer than op2(Mar05) and op1(Mar01), older than op3(Mar10) → between op3 and op2.
    expect(merged.map((e) => (e.kind === "OP" ? `op${e.id}` : e.id))).toEqual(["op3", "p", "op2", "op1"]);
  });

  it("keeps op id-order even when observedAt is non-monotonic with id; records still slot", () => {
    const nm = buildTimeline([
      { op: op({ id: 5, type: "SEED", observedAt: new Date("2026-03-01T00:00:00Z") }), lines: [inVessel("1", 50, "TANK"), external(-50, "seed")] },
      { op: op({ id: 4, type: "ADDITION", observedAt: new Date("2026-03-20T00:00:00Z"), treatments: [{ kind: "ADDITION", materialName: "DAP", rateValue: 1, rateBasis: "G_HL", computedTotal: 1, computedUnit: "g", durationMin: null, medium: null, micron: null }] }), lines: [] },
      { op: op({ id: 3, type: "ADDITION", observedAt: new Date("2026-03-10T00:00:00Z"), treatments: [{ kind: "ADDITION", materialName: "DAP", rateValue: 1, rateBasis: "G_HL", computedTotal: 1, computedUnit: "g", durationMin: null, medium: null, micron: null }] }), lines: [] },
    ]);
    expect(mergeTimeline(nm, []).map((e) => e.id)).toEqual([5, 4, 3]); // ops never reorder
    const p = describeMeasurementPanel(panel({ id: "p", observedAt: new Date("2026-03-15T00:00:00Z"), readings: [{ analyte: "PH", value: 3.4, unit: "pH" }] }));
    const merged = mergeTimeline(nm, [p]);
    // op5(Mar01) is the first op older-or-equal to Mar15 → panel slots before op5.
    expect(merged.map((e) => (e.kind === "OP" ? `op${e.id}` : e.id))).toEqual(["p", "op5", "op4", "op3"]);
  });

  it("orders records sharing a slot by observedAt desc then createdAt desc", () => {
    const older = describeMeasurementPanel(panel({ id: "older", observedAt: new Date("2026-03-07T00:00:00Z"), createdAt: new Date("2026-03-07T09:00:00Z"), readings: [{ analyte: "PH", value: 3.4, unit: "pH" }] }));
    const newer = describeMeasurementPanel(panel({ id: "newer", observedAt: new Date("2026-03-08T00:00:00Z"), createdAt: new Date("2026-03-08T09:00:00Z"), readings: [{ analyte: "PH", value: 3.4, unit: "pH" }] }));
    const merged = mergeTimeline(ops, [older, newer]);
    // Both newer than op2(Mar05), older than op3(Mar10) → same slot, newer observedAt first.
    expect(merged.map((e) => (e.kind === "OP" ? `op${e.id}` : e.id))).toEqual(["op3", "newer", "older", "op2", "op1"]);
  });
});

describe("timeLabel", () => {
  it("renders HH:MM 24-hour from an ISO instant", () => {
    // Assert the shape (HH:MM); exact hour is TZ-dependent, so don't pin it.
    expect(timeLabel("2026-03-01T14:05:00.000Z")).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("describeVesselActivity", () => {
  function va(over: Partial<RawVesselActivity> = {}): RawVesselActivity {
    return {
      id: "va-1",
      kind: "OTHER",
      observedAt: new Date("2026-03-01T10:00:00.000Z"),
      enteredByEmail: "cellar@bwc.bt",
      captureMethod: "MANUAL",
      note: null,
      createdAt: new Date("2026-03-01T10:00:00.000Z"),
      targetValue: null,
      targetUnit: null,
      ...over,
    };
  }

  it("labels every VESSEL_ACTIVITY_KINDS value (no raw enum leaks into the summary)", () => {
    for (const kind of VESSEL_ACTIVITY_KINDS) {
      const item = describeVesselActivity(va({ kind }));
      expect(item.kind).toBe("VESSEL_ACTIVITY");
      expect(item.summary.length).toBeGreaterThan(0);
      // A raw enum token (all-caps with underscores) must never survive into the label.
      expect(item.summary).not.toMatch(/[A-Z]{2,}_[A-Z]/);
    }
  });

  it("reads the setpoint value + unit for TEMP_SETPOINT", () => {
    expect(describeVesselActivity(va({ kind: "TEMP_SETPOINT", targetValue: 4, targetUnit: "°C" })).summary).toBe("Temp setpoint → 4 °C");
  });

  it("reads the gas type off targetUnit for GAS", () => {
    expect(describeVesselActivity(va({ kind: "GAS", targetUnit: "Argon" })).summary).toBe("Gas: Argon blanket");
  });

  it("reads the SO₂ delivery method off targetUnit for SO2", () => {
    expect(describeVesselActivity(va({ kind: "SO2", targetUnit: "Burned sulfur strip" })).summary).toBe("SO₂ — burned sulfur strip");
  });

  it("labels the barrel-maintenance kinds (post-#73)", () => {
    expect(describeVesselActivity(va({ kind: "OZONE" })).summary).toBe("Ozone treatment");
    expect(describeVesselActivity(va({ kind: "WET_STORAGE" })).summary).toBe("Wet storage");
    expect(describeVesselActivity(va({ kind: "CLEAN" })).summary).toBe("Cleaned");
    expect(describeVesselActivity(va({ kind: "SANITIZE" })).summary).toBe("Sanitized");
    expect(describeVesselActivity(va({ kind: "STEAM" })).summary).toBe("Steamed");
  });
});

describe("describeWorkOrder", () => {
  function wo(over: Partial<RawWorkOrder> = {}): RawWorkOrder {
    return {
      workOrderId: "wo-1",
      number: 12,
      title: "Cap management",
      taskStatus: "ISSUED",
      woStatus: "ISSUED",
      issuedByEmail: "chef@bwc.bt",
      issuedAt: new Date("2026-03-02T08:00:00.000Z"),
      createdAt: new Date("2026-03-02T08:00:00.000Z"),
      enteredByEmail: "chef@bwc.bt",
      captureMethod: "MANUAL",
      note: null,
      ...over,
    };
  }

  it("summarizes as 'Work order #N — {title}' and resolves tone/label from the task status", () => {
    const item = describeWorkOrder(wo());
    expect(item.kind).toBe("WORK_ORDER");
    expect(item.summary).toBe("Work order #12 — Cap management");
    expect(item.tone).toBe("blue");
    expect(item.statusLabel).toBe("Issued");
    expect(item.observedAt).toBe("2026-03-02T08:00:00.000Z");
    expect(item.workOrderId).toBe("wo-1");
  });

  it("prefers the per-vessel task status over the WO status for the badge", () => {
    const item = describeWorkOrder(wo({ taskStatus: "DONE", woStatus: "IN_PROGRESS" }));
    expect(item.tone).toBe("green");
    expect(item.statusLabel).toBe("Done");
  });

  it("falls back to createdAt when issuedAt is null", () => {
    const item = describeWorkOrder(wo({ issuedAt: null, createdAt: new Date("2026-03-01T00:00:00.000Z") }));
    expect(item.issuedAt).toBeNull();
    expect(item.observedAt).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("mergeTimeline — interleaves VESSEL_ACTIVITY + WORK_ORDER items", () => {
  const ops = buildTimeline([
    { op: op({ id: 3, type: "ADDITION", observedAt: new Date("2026-03-10T00:00:00Z"), treatments: [{ kind: "ADDITION", materialName: "DAP", rateValue: 1, rateBasis: "G_HL", computedTotal: 1, computedUnit: "g", durationMin: null, medium: null, micron: null }] }), lines: [] },
    { op: op({ id: 2, type: "SEED", observedAt: new Date("2026-03-05T00:00:00Z") }), lines: [inVessel("1", 100, "TANK"), external(-100, "seed")] },
    { op: op({ id: 1, type: "SEED", observedAt: new Date("2026-03-01T00:00:00Z") }), lines: [inVessel("1", 50, "TANK"), external(-50, "seed")] },
  ]);

  it("slots a maintenance event and a work order by observedAt alongside ops", () => {
    const setpoint = describeVesselActivity({
      id: "va-1", kind: "TEMP_SETPOINT", observedAt: new Date("2026-03-07T00:00:00Z"),
      enteredByEmail: "c@bwc.bt", captureMethod: "MANUAL", note: null,
      createdAt: new Date("2026-03-07T00:00:00Z"), targetValue: 12, targetUnit: "°C",
    });
    const workOrder = describeWorkOrder({
      workOrderId: "wo-1", number: 7, title: "Pump-over", taskStatus: "ISSUED", woStatus: "ISSUED",
      issuedByEmail: "chef@bwc.bt", issuedAt: new Date("2026-03-08T00:00:00Z"),
      createdAt: new Date("2026-03-08T00:00:00Z"), enteredByEmail: "chef@bwc.bt", captureMethod: "MANUAL", note: null,
    });
    const merged = mergeTimeline(ops, [setpoint, workOrder]);
    // wo(Mar08) + setpoint(Mar07) both between op3(Mar10) and op2(Mar05); newer first.
    expect(merged.map((e) => (e.kind === "OP" ? `op${e.id}` : e.id))).toEqual(["op3", "wo-1", "va-1", "op2", "op1"]);
    const woItem = merged.find((e) => e.id === "wo-1");
    expect(woItem?.kind).toBe("WORK_ORDER");
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
