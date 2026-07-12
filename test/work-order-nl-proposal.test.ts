import { describe, expect, it } from "vitest";
import {
  canonicalizeNlWorkOrderDraft,
  normalizeDoseUnit,
  parseWorkOrderUtteranceForEval,
  NL_WORK_ORDER_MAX_TASKS,
  NL_WORK_ORDER_SCHEMA_VERSION,
} from "@/lib/work-orders/nl-proposal";

describe("natural-language work-order proposal parser", () => {
  it("parses the Phase 9.2 motivating utterance into ordered intents", () => {
    const intents = parseWorkOrderUtteranceForEval("Rack T12 to T15, add 30 ppm SO2, pull a juice panel.");
    expect(intents).toEqual([
      { kind: "RACK", from: "T12", to: "T15" },
      { kind: "ADDITION", vessel: "T15", material: "SO2", amount: 30, unit: "mg/L" },
      { kind: "PANEL", vessel: "T15", panelName: "juice panel" },
    ]);
  });

  it("keeps model structured input intent-ish and canonicalizes ppm", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "Make a work order to add 30 ppm KMBS to tank 12",
      tasks: [{ kind: "addition", vessel: "tank 12", material: "KMBS", amount: "30", unit: "ppm" }],
      dueDate: "2026-07-10",
      assigneeEmail: "cellar@demowinery.test",
    });
    expect(draft.intents).toEqual([{ kind: "ADDITION", vessel: "tank 12", material: "KMBS", amount: 30, unit: "mg/L" }]);
    expect(draft.dueDate).toBe("2026-07-10");
    expect(draft.assigneeEmail).toBe("cellar@demowinery.test");
    // Phase 9.3: canonical drafts stamp the current schema version (bumped 1 -> 2).
    expect(draft.schemaVersion).toBe(NL_WORK_ORDER_SCHEMA_VERSION);
    expect(NL_WORK_ORDER_SCHEMA_VERSION).toBe(2);
  });

  it("does not silently accept unsupported blend authoring", () => {
    expect(() => canonicalizeNlWorkOrderDraft({ sourceText: "Make a work order to blend T1 and T2" })).toThrow(/Blend authoring/);
  });

  it("bounds generated task count before signing", () => {
    const tasks = Array.from({ length: NL_WORK_ORDER_MAX_TASKS + 1 }, (_, i) => ({
      kind: "NOTE",
      title: `Check item ${i + 1}`,
    }));
    expect(() => canonicalizeNlWorkOrderDraft({ sourceText: "too much", tasks })).toThrow(/too much for one work order/i);
  });

  it("normalizes ppm to mg/L", () => {
    expect(normalizeDoseUnit("ppm")).toBe("mg/L");
    expect(normalizeDoseUnit("mg/L")).toBe("mg/L");
  });
});

describe("Phase 9.3 Unit 4 — expanded task-kind canonicalization", () => {
  it("canonicalizes maintenance / filtration / cap / temp / topping kinds", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "press day",
      tasks: [
        { kind: "topping", from: "T1", to: "T2", volumeL: 5 },
        { kind: "filtration", vessel: "T2", filterType: "pad", micron: 0.45 },
        { kind: "cap_mgmt", vessel: "T3", technique: "punchdown", durationMin: 10 },
        { kind: "temp_setpoint", vessel: "T3", targetValue: -2, targetUnit: "C" },
        { kind: "clean", vessel: "T4", material: "proxycarb", amount: 50 },
        { kind: "gas", vessel: "T2", gasType: "argon" },
        { kind: "so2", vessel: "B1", so2Method: "burned disc" },
      ],
    });
    expect(draft.intents.map((i) => i.kind)).toEqual([
      "TOPPING", "FILTRATION", "CAP_MGMT", "TEMP_SETPOINT", "CLEAN", "GAS", "SO2",
    ]);
    // A cold-settle setpoint can be a negative temperature (positiveNumber would drop it).
    expect(draft.intents[3]).toMatchObject({ kind: "TEMP_SETPOINT", vessel: "T3", targetValue: -2, targetUnit: "C" });
    expect(draft.intents[4]).toMatchObject({ kind: "CLEAN", vessel: "T4", material: "proxycarb", amount: 50 });
  });

  it("canonicalizes the runtime transform kinds and BRIX", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "crush day",
      tasks: [
        { kind: "crush", destVessel: "T12" },
        { kind: "press", op: "SAIGNEE" },
        { kind: "harvest_weigh_in", block: "Block 7" },
        { kind: "brix", vessel: "T12" },
      ],
    });
    expect(draft.intents).toEqual([
      { kind: "CRUSH", destVessel: "T12" },
      { kind: "PRESS", op: "SAIGNEE" },
      { kind: "HARVEST_WEIGH_IN", block: "Block 7" },
      { kind: "BRIX", vessel: "T12" },
    ]);
  });

  it("captures CRUSH process defaults (the '50% rollers on' fix) so they can prefill the execute form", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "crush the fruit 50% rollers on into tank 12",
      tasks: [
        { kind: "crush", destVessel: "T12", destemmed: true, crusherOn: true, crushedPct: 50, mustTempC: 14 },
      ],
    });
    expect(draft.intents[0]).toEqual({
      kind: "CRUSH",
      destVessel: "T12",
      destemmed: true,
      crusherOn: true,
      crushedPct: 50,
      mustTempC: 14,
    });
  });

  it("coerces string-ish CRUSH flags and drops crushedPct when the rollers are off (whole-cluster)", () => {
    const on = canonicalizeNlWorkOrderDraft({
      sourceText: "crush 50% rollers on",
      tasks: [{ kind: "CRUSH", crusherOn: "on", crushedPct: "50", destemmed: "yes" }],
    });
    expect(on.intents[0]).toEqual({ kind: "CRUSH", destemmed: true, crusherOn: true, crushedPct: 50 });

    const wholeCluster = canonicalizeNlWorkOrderDraft({
      sourceText: "whole cluster, rollers off",
      tasks: [{ kind: "CRUSH", crusherOn: "off", crushedPct: 50 }],
    });
    // crushedPct is meaningless when the rollers are off — it must be dropped, not carried at 50.
    expect(wholeCluster.intents[0]).toEqual({ kind: "CRUSH", crusherOn: false });

    const outOfRange = canonicalizeNlWorkOrderDraft({
      sourceText: "crush",
      tasks: [{ kind: "CRUSH", crushedPct: 150 }],
    });
    // 150 is out of the 0-100 range → dropped, no crushedPct key.
    expect(outOfRange.intents[0]).toEqual({ kind: "CRUSH" });
  });

  it("carries a named block onto CRUSH (title stamp) and HARVEST_WEIGH_IN (plus a pinned blockId)", () => {
    // plan 055: the assistant passes `block` when the user names the fruit. On CRUSH it is a free-text
    // label (stamped into the title downstream); on HARVEST_WEIGH_IN a pinned blockId (added by the tool
    // layer after vineyard-access-scoped resolution) rides alongside so it prefills the execute screen.
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "take in the RRV Pinot, weigh it, destem to T6",
      tasks: [
        { kind: "harvest_weigh_in", block: "Russian River Pinot Noir (Block 1)", blockId: "blk_rrv1" },
        { kind: "crush", destVessel: "T6", block: "Russian River Pinot Noir (Block 1)" },
      ],
    });
    expect(draft.intents[0]).toEqual({
      kind: "HARVEST_WEIGH_IN",
      block: "Russian River Pinot Noir (Block 1)",
      blockId: "blk_rrv1",
    });
    expect(draft.intents[1]).toEqual({
      kind: "CRUSH",
      destVessel: "T6",
      block: "Russian River Pinot Noir (Block 1)",
    });
  });

  it("canonicalizes PRESS source, destination guidance, and press cycle", () => {
    const structured = canonicalizeNlWorkOrderDraft({
      sourceText: "press tank 6 into tank 5",
      tasks: [{ kind: "press", sourceVessel: "tank 6", destVessel: "tank 5", pressCycle: "Champagne", note: "keep free-run separate" }],
    });
    expect(structured.intents[0]).toEqual({
      kind: "PRESS",
      sourceVessel: "tank 6",
      destVessel: "tank 5",
      pressCycle: "Champagne",
      note: "keep free-run separate",
    });

    const freeText = canonicalizeNlWorkOrderDraft({ sourceText: "Press tank 6 into tank 5" });
    expect(freeText.intents[0]).toMatchObject({ kind: "PRESS", sourceVessel: "tank 6", destVessel: "tank 5", op: "PRESS" });
  });

  it("defaults a following maintenance/observation vessel to the prior rack destination", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "rack then clean",
      tasks: [
        { kind: "rack", from: "T1", to: "T2" },
        { kind: "clean", material: "sanitizer" },
      ],
    });
    expect(draft.intents[1]).toMatchObject({ kind: "CLEAN", vessel: "T2" });
  });

  it("canonicalizes a sample-pull with lab + sendNow", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "pull samples",
      tasks: [{ kind: "sample_pull", vessel: "T12", lab: "ETS", sendNow: true }],
    });
    expect(draft.intents[0]).toEqual({ kind: "SAMPLE_PULL", vessel: "T12", lab: "ETS", sendNow: true });
  });

  it("still rejects a genuinely unsupported instruction", () => {
    expect(() => canonicalizeNlWorkOrderDraft({ sourceText: "x", tasks: [{ kind: "teleport", vessel: "T1" }] })).toThrow(/Unsupported work-order instruction/);
  });

  // Phase 9.4a: group barrel-down / rack-to-tank are now first-class intents (one reviewable task →
  // one balanced ledger op), no longer declined as future_phase.
  it("canonicalizes group barrel-down (structured + free-text) into a BARREL_DOWN intent", () => {
    const structured = canonicalizeNlWorkOrderDraft({ sourceText: "x", tasks: [{ kind: "barrel_down", from: "T12", toGroup: "B101-B110" }] });
    expect(structured.intents[0]).toEqual({ kind: "BARREL_DOWN", from: "T12", toGroup: "B101-B110" });
    const freeText = canonicalizeNlWorkOrderDraft({ sourceText: "Barrel down T12 into B101-B110" });
    expect(freeText.intents[0]).toMatchObject({ kind: "BARREL_DOWN", from: "T12", toGroup: "B101-B110" });
  });

  it("canonicalizes rack-barrels-to-tank into a RACK_TO_TANK intent", () => {
    const structured = canonicalizeNlWorkOrderDraft({ sourceText: "x", tasks: [{ kind: "rack_barrels_to_tank", fromGroup: "B101-B110", to: "T15" }] });
    expect(structured.intents[0]).toEqual({ kind: "RACK_TO_TANK", fromGroup: "B101-B110", to: "T15" });
    const freeText = canonicalizeNlWorkOrderDraft({ sourceText: "Rack barrels B101-B110 back to T15" });
    expect(freeText.intents[0]).toMatchObject({ kind: "RACK_TO_TANK", fromGroup: "B101-B110", to: "T15" });
  });

  it("still rejects a group barrel-down missing its group/source", () => {
    expect(() => canonicalizeNlWorkOrderDraft({ sourceText: "x", tasks: [{ kind: "barrel_down", from: "T12" }] })).toThrow(/barrel group or range/i);
  });
});


describe("Plan 055a — BOTTLE authoring canonicalization", () => {
  it("canonicalizes a structured BOTTLE intent with standard packaging", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "bottle it",
      tasks: [{ kind: "BOTTLE", vessel: "tank 6", skuName: "Estate Cab", skuVintage: 2024, cases: 500, standardPackaging: true }],
    });
    expect(draft.intents).toEqual([
      { kind: "BOTTLE", vessel: "tank 6", skuName: "Estate Cab", skuVintage: 2024, cases: 500, standardPackaging: true },
    ]);
  });

  it("canonicalizes named packaging + bottles (aliases wine/vintage)", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "x",
      tasks: [{ kind: "BOTTLE", wine: "Estate Cab", vintage: 2024, bottles: 6000, packaging: ["screwcap", "front label"] }],
    });
    expect(draft.intents[0]).toMatchObject({ kind: "BOTTLE", skuName: "Estate Cab", skuVintage: 2024, bottles: 6000, packaging: ["screwcap", "front label"] });
  });

  it("authoring-only: a BOTTLE with no sku/count/packaging is allowed (floor fills the rest)", () => {
    const draft = canonicalizeNlWorkOrderDraft({ sourceText: "x", tasks: [{ kind: "BOTTLE", vessel: "T6" }] });
    expect(draft.intents).toEqual([{ kind: "BOTTLE", vessel: "T6" }]);
  });

  it("parses the bottling utterance (cases + vintage + standard packaging)", () => {
    const intents = parseWorkOrderUtteranceForEval("bottle tank 6 into 500 cases of the 2024 Estate Cab with our standard packaging");
    expect(intents).toContainEqual(
      expect.objectContaining({ kind: "BOTTLE", vessel: "tank 6", cases: 500, skuVintage: 2024, standardPackaging: true }),
    );
  });
});

describe("Plan 055 U3 — EQUIPMENT_SERVICE canonicalization", () => {
  it("canonicalizes an equipment-service intent + validates setStatus", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "service the press",
      tasks: [{ kind: "equipment_service", equipment: "basket press", setStatus: "maintenance", note: "annual" }],
    });
    expect(draft.intents[0]).toEqual({ kind: "EQUIPMENT_SERVICE", equipment: "basket press", setStatus: "maintenance", note: "annual" });
  });

  it("normalizes a spaced/uppercased status ('In Use' -> 'in_use')", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "x",
      tasks: [{ kind: "EQUIPMENT_SERVICE", equipment: "pump P2", setStatus: "In Use" }],
    });
    expect(draft.intents[0]).toMatchObject({ kind: "EQUIPMENT_SERVICE", equipment: "pump P2", setStatus: "in_use" });
  });

  it("rejects an invalid equipment status", () => {
    expect(() =>
      canonicalizeNlWorkOrderDraft({ sourceText: "x", tasks: [{ kind: "EQUIPMENT_SERVICE", equipment: "press", setStatus: "broken" }] }),
    ).toThrow(/not a valid equipment status/i);
  });

  it("requires the equipment (or a pinned id) to service", () => {
    expect(() =>
      canonicalizeNlWorkOrderDraft({ sourceText: "x", tasks: [{ kind: "EQUIPMENT_SERVICE", setStatus: "available" }] }),
    ).toThrow(/needs the equipment to service/i);
  });
});

describe("Plan 055 U7/U8/D3 — per-task assignee / priority / groupSeq meta", () => {
  it("carries assignee, priority, and groupSeq onto ANY task kind", () => {
    const draft = canonicalizeNlWorkOrderDraft({
      sourceText: "rack then add, sequenced, assigned",
      tasks: [
        { kind: "rack", from: "T1", to: "T2", assignee: "Russell", priority: "HIGH", groupSeq: 0 },
        { kind: "addition", vessel: "T2", material: "KMBS", amount: 30, unit: "ppm", assignee: "sam@winery.test", priority: "URGENT", groupSeq: 1 },
      ],
    });
    expect(draft.intents[0]).toMatchObject({ kind: "RACK", from: "T1", to: "T2", assignee: "Russell", priority: "HIGH", groupSeq: 0 });
    expect(draft.intents[1]).toMatchObject({ kind: "ADDITION", vessel: "T2", assignee: "sam@winery.test", priority: "URGENT", groupSeq: 1 });
  });

  it("omits meta fields when absent (no spurious keys — existing exact-shape tests stay green)", () => {
    const draft = canonicalizeNlWorkOrderDraft({ sourceText: "x", tasks: [{ kind: "rack", from: "T1", to: "T2" }] });
    expect(draft.intents[0]).toEqual({ kind: "RACK", from: "T1", to: "T2" });
    expect("assignee" in draft.intents[0]).toBe(false);
    expect("priority" in draft.intents[0]).toBe(false);
    expect("groupSeq" in draft.intents[0]).toBe(false);
  });
});
