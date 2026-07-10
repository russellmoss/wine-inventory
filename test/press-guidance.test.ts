import { describe, expect, it } from "vitest";
import { buildPressGuidance, initialPressFractionDestination, stalePinnedPressSource } from "@/lib/work-orders/press-guidance";

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
    expect(initialPressFractionDestination(vessels, "missing")).toBe("v5");
  });
});
