import { describe, expect, it } from "vitest";
import { buildPressGuidance, initialPressFractionDestination, occupiedDestinationMessage, oversizedFractionMessage, pinnedPressPosition, pressDestinationMode, stalePinnedPressSource } from "@/lib/work-orders/press-guidance";

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

/**
 * Feedback cmsgc9bw80000la04b42ftqvy — "blends": *"I should be able to transfer wine into a vessel
 * that already has wine in it."*
 *
 * He was right, and the engine agreed with him: `press-core.ts` has always let a fraction land in an
 * occupied vessel by MERGING into the lot already there (`mergeIntoLotId`, legal exactly when the
 * vessel holds ONE lot and that is the one named), and the work-order contract has always passed the
 * field through. But NO screen ever set it — it lived in one form's state and payload with no control
 * behind it — so from every UI the operation was impossible and the only thing the user ever saw was
 * the core's refusal.
 *
 * These lock the client half of that rule. It mirrors press-core exactly; the core stays the authority.
 */
describe("press destinations — landing a fraction in an occupied vessel (feedback cmsgc9bw8)", () => {
  const SOURCE = "src-tank";
  const empty = { id: "t9", code: "T9", capacityL: 5000, residents: [] };
  const oneLot = { id: "b1", code: "B1", capacityL: 225, residents: [{ lotId: "lot-a", code: "2024-RRR-1-PN", volumeL: 180 }] };
  const twoLots = {
    id: "t3", code: "T3", capacityL: 12000,
    residents: [{ lotId: "lot-a", code: "2026-SY-5", volumeL: 300 }, { lotId: "lot-b", code: "2026-CS-1", volumeL: 200 }],
  };
  const source = { id: SOURCE, code: "T5", capacityL: 12000, residents: [{ lotId: "parent", code: "2026-SY-2", volumeL: 900 }] };
  const CELLAR = [empty, oneLot, twoLots, source];

  it("classifies the destination the same way press-core does", () => {
    expect(pressDestinationMode(empty, SOURCE)).toBe("free");
    expect(pressDestinationMode(oneLot, SOURCE)).toBe("merge");
    expect(pressDestinationMode(twoLots, SOURCE)).toBe("blocked");
    // Pressing back into the source is the normal in-place case — the parent is drawn down by the
    // same operation, so its own resident is not a foreign one (press-core.ts:182).
    expect(pressDestinationMode(source, SOURCE)).toBe("free");
    expect(pressDestinationMode(undefined, SOURCE)).toBe("free");
  });

  it("asks — rather than assumes — when the vessel holds exactly one lot", () => {
    const msg = occupiedDestinationMessage({ label: "free-run", destVesselId: "b1", volumeL: 200 }, CELLAR, SOURCE);
    expect(msg).toContain("B1 already holds 2024-RRR-1-PN (180 L)");
    expect(msg).toContain("joins 2024-RRR-1-PN");
  });

  it("passes once the fraction is explicitly merged into that lot — the case that was impossible", () => {
    expect(
      // 40 L on top of B1's 180 L resident fits inside its 225 L.
      occupiedDestinationMessage({ label: "free-run", destVesselId: "b1", volumeL: 40, mergeIntoLotId: "lot-a" }, CELLAR, SOURCE),
    ).toBeNull();
  });

  it("catches a merge that would overfill the vessel — headroom IS known once there is one resident", () => {
    // B1 in the live cellar: a 225 L barrel already holding 225 L. Merging 200 L more cannot fit.
    const full = { id: "bf", code: "BF", capacityL: 225, residents: [{ lotId: "lot-f", code: "2024-CS", volumeL: 225 }] };
    const msg = occupiedDestinationMessage(
      { label: "free-run", destVesselId: "bf", volumeL: 200, mergeIntoLotId: "lot-f" },
      [full],
      SOURCE,
    );
    expect(msg).toContain("only 0 L will fit");
  });

  it("allows a merge that fits", () => {
    const room = { id: "br", code: "BR", capacityL: 225, residents: [{ lotId: "lot-r", code: "2025-PN", volumeL: 100 }] };
    expect(
      occupiedDestinationMessage({ label: "press", destVesselId: "br", volumeL: 100, mergeIntoLotId: "lot-r" }, [room], SOURCE),
    ).toBeNull();
  });

  it("refuses a vessel holding more than one lot — merging is defined against a single lot", () => {
    const msg = occupiedDestinationMessage({ label: "press", destVesselId: "t3", volumeL: 100 }, CELLAR, SOURCE);
    expect(msg).toContain("T3 holds 2026-SY-5 and 2026-CS-1");
    expect(msg).toContain("empty vessel");
  });

  it("says nothing about an empty vessel, or about pressing back into the source", () => {
    expect(occupiedDestinationMessage({ label: "free-run", destVesselId: "t9", volumeL: 200 }, CELLAR, SOURCE)).toBeNull();
    expect(occupiedDestinationMessage({ label: "free-run", destVesselId: SOURCE, volumeL: 200 }, CELLAR, SOURCE)).toBeNull();
  });

  it("catches a merge target left over from a vessel the user moved away from", () => {
    // The forms clear this on destination change; if one ever regresses, the core would reject it.
    const msg = occupiedDestinationMessage({ label: "free-run", destVesselId: "t9", volumeL: 200, mergeIntoLotId: "lot-a" }, CELLAR, SOURCE);
    expect(msg).toContain("T9 is empty");
  });

  it("ignores rows that are not yet a real cut", () => {
    expect(occupiedDestinationMessage({ destVesselId: "", volumeL: 200 }, CELLAR, SOURCE)).toBeNull();
    expect(occupiedDestinationMessage({ destVesselId: "b1", volumeL: 0 }, CELLAR, SOURCE)).toBeNull();
    expect(occupiedDestinationMessage({ destVesselId: "ghost", volumeL: 200 }, CELLAR, SOURCE)).toBeNull();
  });

  it("treats a vessel with no residents field as free (older callers)", () => {
    expect(pressDestinationMode({ id: "x", code: "X", capacityL: 100 }, SOURCE)).toBe("free");
  });
});

/**
 * Second half of feedback cmsf3vmlw0000l704pnaiep22 — the builder can now pin a press source, and it
 * may pin the VESSEL alone ("press whatever is in T5"). The old prefill required BOTH the lot and the
 * vessel, which was fine while only the assistant could pin a press (it always resolves both) and
 * silently useless the moment a human pinned one of them.
 */
describe("pinned press source — a partial pin still selects the position", () => {
  const positions = [
    { vesselId: "t5", vesselCode: "T5", lotId: "lot-a", lotCode: "2026-SY-2", form: "MUST", volumeL: 900 },
    { vesselId: "t6", vesselCode: "T6", lotId: "lot-b", lotCode: "2026-PN-1", form: "MUST", volumeL: 400 },
  ];

  it("selects on the vessel alone — the case the manual builder now creates", () => {
    expect(pinnedPressPosition({ sourceVesselId: "t6" }, positions)?.lotId).toBe("lot-b");
  });

  it("selects on the lot alone", () => {
    expect(pinnedPressPosition({ lotId: "lot-a" }, positions)?.vesselId).toBe("t5");
  });

  it("still selects on both, and rejects a mismatched pair", () => {
    expect(pinnedPressPosition({ lotId: "lot-a", sourceVesselId: "t5" }, positions)?.vesselId).toBe("t5");
    expect(pinnedPressPosition({ lotId: "lot-a", sourceVesselId: "t6" }, positions)).toBeNull();
  });

  it("returns null when nothing was pinned, so the form keeps its own fallback", () => {
    expect(pinnedPressPosition({}, positions)).toBeNull();
  });

  it("calls a vessel-only pin STALE once that vessel holds nothing pressable", () => {
    // Previously not stale — the guard required both halves, so a manager who pinned only a tank got
    // no warning and the form quietly pressed whatever happened to be first in the cellar.
    const stale = stalePinnedPressSource({ sourceVesselId: "t9" }, positions);
    expect(stale.stale).toBe(true);
    expect(stale.current).toContain("T5 / 2026-SY-2 (900 L)");
  });

  it("is not stale when the pinned vessel still holds a pressable must", () => {
    expect(stalePinnedPressSource({ sourceVesselId: "t5" }, positions).stale).toBe(false);
  });

  it("is not stale when nothing was pinned at all", () => {
    expect(stalePinnedPressSource({}, positions).stale).toBe(false);
  });
});
