import { describe, it, expect } from "vitest";
import { evaluateAtp, evaluateDemands, advisoryWarning } from "@/lib/work-orders/atp";
import { reservationIntentsForTask } from "@/lib/work-orders/reservations";

describe("evaluateAtp", () => {
  it("passes when the request fits within available (supply − already reserved)", () => {
    const a = evaluateAtp({ kind: "MATERIAL_QTY", targetLabel: "KMBS", supply: 1000, alreadyReserved: 200, requested: 500, unit: "g" });
    expect(a.available).toBe(800);
    expect(a.ok).toBe(true);
    expect(a.short).toBe(0);
    expect(advisoryWarning(a)).toBeNull();
  });

  it("warns (not throws) when the request exceeds ATP", () => {
    const a = evaluateAtp({ kind: "MATERIAL_QTY", targetLabel: "KMBS", supply: 1000, alreadyReserved: 800, requested: 500, unit: "g" });
    expect(a.available).toBe(200);
    expect(a.ok).toBe(false);
    expect(a.short).toBe(300);
    expect(advisoryWarning(a)).toContain("short 300 g");
  });

  it("two work orders over-allocate: the second warns", () => {
    // First WO reserves 600 of 1000 (fits). Second WO wants 600 with 600 already held → only 400 free.
    const first = evaluateAtp({ kind: "LOT_VOLUME", targetLabel: "Lot A", supply: 1000, alreadyReserved: 0, requested: 600, unit: "L" });
    expect(first.ok).toBe(true);
    const second = evaluateAtp({ kind: "LOT_VOLUME", targetLabel: "Lot A", supply: 1000, alreadyReserved: 600, requested: 600, unit: "L" });
    expect(second.ok).toBe(false);
    expect(second.short).toBe(200);
  });

  it("is capacity-aware on the vessel side", () => {
    // Tank headroom passed as supply (capacity − current holdings). 500 free, want 700 → overfill warn.
    const a = evaluateAtp({ kind: "VESSEL_CAPACITY", targetLabel: "Tank 3", supply: 500, alreadyReserved: 0, requested: 700, unit: "L" });
    expect(a.ok).toBe(false);
    expect(advisoryWarning(a)).toContain("overfill");
  });

  it("aggregates a batch of demands into warnings", () => {
    const { warnings } = evaluateDemands([
      { kind: "LOT_VOLUME", targetLabel: "Lot A", supply: 100, alreadyReserved: 0, requested: 50, unit: "L" }, // ok
      { kind: "VESSEL_CAPACITY", targetLabel: "Tank 1", supply: 10, alreadyReserved: 0, requested: 50, unit: "L" }, // short
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("Tank 1");
  });
});

describe("reservationIntentsForTask", () => {
  it("a RACK task holds source-lot volume + destination headroom (net of loss)", () => {
    const intents = reservationIntentsForTask({
      id: "t1", opType: "RACK", sourceVesselId: "v-from", destVesselId: "v-to", lotId: "lot-1", materialId: null, dueAt: null,
      plannedPayload: { drawL: 200, lossL: 5 },
    });
    expect(intents).toEqual([
      { kind: "LOT_VOLUME", lotId: "lot-1", qty: 200, unit: "L" },
      { kind: "VESSEL_CAPACITY", vesselId: "v-to", qty: 195, unit: "L" },
    ]);
  });

  it("a TOPPING task uses volumeL for both the source draw and the destination headroom", () => {
    const intents = reservationIntentsForTask({
      id: "t2", opType: "TOPPING", sourceVesselId: "keg", destVesselId: "barrel-1", lotId: "keg-lot", materialId: null, dueAt: null,
      plannedPayload: { volumeL: 3 },
    });
    expect(intents).toContainEqual({ kind: "LOT_VOLUME", lotId: "keg-lot", qty: 3, unit: "L" });
    expect(intents).toContainEqual({ kind: "VESSEL_CAPACITY", vesselId: "barrel-1", qty: 3, unit: "L" });
  });

  it("an ADDITION task holds material qty only when the template supplies a planned amount", () => {
    const withAmount = reservationIntentsForTask({
      id: "t3", opType: "ADDITION", sourceVesselId: null, destVesselId: null, lotId: "lot-1", materialId: "mat-1", dueAt: null,
      plannedPayload: { plannedAmount: 120, plannedUnit: "g" },
    });
    expect(withAmount).toEqual([{ kind: "MATERIAL_QTY", materialId: "mat-1", qty: 120, unit: "g" }]);

    const rateOnly = reservationIntentsForTask({
      id: "t4", opType: "ADDITION", sourceVesselId: null, destVesselId: null, lotId: "lot-1", materialId: "mat-1", dueAt: null,
      plannedPayload: { rateValue: 30, rateBasis: "MG_PER_L" },
    });
    expect(rateOnly).toEqual([]); // rate-only: no precise amount to hold → no material reservation
  });

  it("produces no intents for a full-transfer RACK with an unknown draw", () => {
    const intents = reservationIntentsForTask({
      id: "t5", opType: "RACK", sourceVesselId: "v-from", destVesselId: "v-to", lotId: "lot-1", materialId: null, dueAt: null,
      plannedPayload: {},
    });
    expect(intents).toEqual([]);
  });
});
