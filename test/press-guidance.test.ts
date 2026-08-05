import { describe, expect, it } from "vitest";
import { buildPressGuidance, initialPressFractionDestination, oversizedFractionMessage, stalePinnedPressSource } from "@/lib/work-orders/press-guidance";

const positions = [
  { vesselId: "v1", vesselCode: "T6", lotId: "l1", lotCode: "24-RS-M", form: "MUST", status: "ACTIVE", volumeL: 1200 },
  { vesselId: "v2", vesselCode: "T8", lotId: "l2", lotCode: "24-PN-M", form: "MUST", status: "ACTIVE", volumeL: 800 },
];
const vessels = [{ id: "v5", code: "T5" }, { id: "v9", code: "T9" }];

describe("press guidance helpers", () => {
  it("derives planned guidance from pinned source and destination hint", () => {
    const guidance = buildPressGuidance(
      {
        lotId: "l1",
        sourceVesselId: "v1",
        plannedPayload: { plannedDestVesselId: "v5", pressCycle: "Champagne", note: "Keep free-run separate" },
      },
      positions,
      vessels,
    );
    expect(guidance.plannedDestVesselId).toBe("v5");
    expect(guidance.items).toEqual([
      { label: "Pinned source", value: "T6 / 24-RS-M" },
      { label: "Destination hint", value: "T5" },
      { label: "Press cycle", value: "Champagne" },
      { label: "Note", value: "Keep free-run separate" },
    ]);
  });

  it("detects a stale pinned source and lists current pressable positions", () => {
    const stale = stalePinnedPressSource({
      lotId: "gone",
      sourceVesselId: "old",
      plannedPayload: { plannedSourceVesselLabel: "Tank 6", plannedSourceLotCode: "24-RS-M" },
    }, positions);
    expect(stale.stale).toBe(true);
    expect(stale.expected).toBe("Tank 6 / 24-RS-M");
    expect(stale.current).toContain("T6 / 24-RS-M (1200 L)");
  });

  it("can show a planned pinned source even after it is stale", () => {
    const guidance = buildPressGuidance(
      {
        lotId: "gone",
        sourceVesselId: "old",
        plannedPayload: { plannedSourceVesselLabel: "Tank 6", plannedSourceLotCode: "24-RS-M" },
      },
      positions,
      vessels,
    );
    expect(guidance.items).toEqual([{ label: "Pinned source", value: "Tank 6 / 24-RS-M" }]);
  });

  it("seeds a planned destination only when it still exists", () => {
    expect(initialPressFractionDestination(vessels, "v5")).toBe("v5");
    // Previously "v5" — i.e. vessels[0]. This assertion used to encode the bug: it asserted the
    // fallback existed instead of asking whether guessing a destination was safe. See below.
    expect(initialPressFractionDestination(vessels, "missing")).toBe("");
  });
});

/**
 * Feedback cmsf3y8090000l1049jg251nx — "capacity": a press work order on a ~8,000 L tank was
 * rejected for exceeding "225 litres", and the reporter concluded the system thought his tank was
 * a barrel. It didn't. It had silently picked a barrel FOR him.
 *
 * `initialPressFractionDestination` fell back to `vessels[0]`, and `loadPressFormData` orders
 * vessels by `code asc`, so the first ACTIVE vessel in a real cellar is barrel B1 (225 L). The
 * picker rendered nothing but "B1" — no capacity, no placeholder — so there was nothing on screen
 * to contradict it, and the only component that ever objected was the ledger capacity guard, one
 * server round-trip later, phrased in terms of a vessel he never chose.
 *
 * Both halves are locked here: never guess the destination, and catch an impossible cut client-side.
 */
describe("press destination — never silently pick a vessel (feedback cmsf3y809)", () => {
  // Demo Winery's real ACTIVE vessels, in the order loadPressFormData returns them (code asc).
  const cellar = [
    { id: "b1", code: "B1", capacityL: 225 },
    { id: "b2", code: "B2", capacityL: 225 },
    { id: "t5", code: "T5", capacityL: 12000 },
    { id: "wvp1", code: "WV-P1 primary ferment", capacityL: 10000 },
  ];

  it("does NOT default to the first vessel when the task pinned no destination", () => {
    // Mike's actual task payload: { op: "PRESS", taskKey: "t5_4f5m47" } — no plannedDestVesselId.
    const guidance = buildPressGuidance({ lotId: null, sourceVesselId: null, plannedPayload: { op: "PRESS", taskKey: "t5_4f5m47" } }, [], cellar);
    expect(guidance.plannedDestVesselId).toBeNull();

    const initial = initialPressFractionDestination(cellar, guidance.plannedDestVesselId);
    expect(initial).toBe("");
    // The precise regression: the old code returned "b1", a 225 L barrel.
    expect(cellar.find((v) => v.id === initial)).toBeUndefined();
  });

  it("still honours a destination the manager actually pinned", () => {
    expect(initialPressFractionDestination(cellar, "t5")).toBe("t5");
  });

  it("flags a cut larger than its destination before the server has to", () => {
    const msg = oversizedFractionMessage([{ label: "free-run", destVesselId: "b1", volumeL: 6000 }], cellar);
    expect(msg).toBe('Fraction "free-run" is 6000 L, but B1 only holds 225 L. Pick a bigger destination.');
  });

  it("passes a cut that fits, and one with no destination yet", () => {
    expect(oversizedFractionMessage([{ label: "free-run", destVesselId: "t5", volumeL: 6000 }], cellar)).toBeNull();
    expect(oversizedFractionMessage([{ label: "free-run", destVesselId: "", volumeL: 6000 }], cellar)).toBeNull();
    expect(oversizedFractionMessage([{ label: "free-run", destVesselId: "b1", volumeL: 0 }], cellar)).toBeNull();
  });

  it("never rejects a cut the ledger would accept — it only checks TOTAL capacity", () => {
    // Exactly at capacity must pass here; whether it FITS depends on what the vessel already holds,
    // and that is the server's call. This guard is a strict subset of the ledger's, by design.
    expect(oversizedFractionMessage([{ destVesselId: "b1", volumeL: 225 }], cellar)).toBeNull();
    // An unknown vessel is not this function's business either.
    expect(oversizedFractionMessage([{ destVesselId: "ghost", volumeL: 99999 }], cellar)).toBeNull();
  });

  it("reports the FIRST offending fraction when several are oversized", () => {
    const msg = oversizedFractionMessage(
      [{ label: "free-run", destVesselId: "t5", volumeL: 100 }, { label: "press 1", destVesselId: "b1", volumeL: 900 }, { label: "press 2", destVesselId: "b2", volumeL: 800 }],
      cellar,
    );
    expect(msg).toContain('"press 1"');
    expect(msg).toContain("B1");
  });
});
