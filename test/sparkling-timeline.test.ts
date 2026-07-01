import { describe, it, expect } from "vitest";
import { describeOperation, type RawOperation, type RawLine, type RawTreatment } from "@/lib/lot/timeline";

// Phase 7 Unit 13: the lot timeline reads the sparkling arc. Derivation tests for each new
// op summary (TIRAGE / RIDDLING / DISGORGEMENT / DOSAGE / FINISH) over synthetic ledger rows.

function op(type: RawOperation["type"], treatments: Partial<RawTreatment>[] = []): RawOperation {
  return {
    id: 1, type, observedAt: "2026-07-01T00:00:00.000Z", enteredBy: "t@t", captureMethod: "MANUAL",
    note: null, correctsOperationId: null,
    treatments: treatments.map((t) => ({ kind: "", materialName: null, rateValue: null, rateBasis: null, computedTotal: null, computedUnit: null, durationMin: null, medium: null, micron: null, ...t })),
  };
}
const bottleLeg = (deltaL: number, bottleDelta: number): RawLine => ({ vesselId: null, vesselCode: null, deltaL, reason: null, bucket: "BOTTLE_STORAGE", bottleDelta });
const extLeg = (deltaL: number, reason: string): RawLine => ({ vesselId: null, vesselCode: null, deltaL, reason, bucket: "EXTERNAL", bottleDelta: null });
const vesselLeg = (deltaL: number): RawLine => ({ vesselId: "T1", vesselCode: "T1", vesselType: "TANK", deltaL, reason: null, bucket: "VESSEL", bottleDelta: null });

describe("describeOperation — sparkling ops", () => {
  it("TIRAGE: bottled N bottles + volume + tirage sugar", () => {
    const ev = describeOperation(op("TIRAGE", [{ kind: "TIRAGE", rateValue: 24 }]), [vesselLeg(-1500), bottleLeg(1500, 2000)]);
    expect(ev.summary).toContain("2000 bottles");
    expect(ev.summary).toContain("1500 L");
    expect(ev.summary).toContain("24 g/L tirage sugar");
  });

  it("RIDDLING: method", () => {
    const ev = describeOperation(op("RIDDLING", [{ kind: "RIDDLING", medium: "gyropalette" }]), []);
    expect(ev.summary).toBe("Riddling (gyropalette)");
  });

  it("DISGORGEMENT: per-bottle loss + volume lost", () => {
    const ev = describeOperation(op("DISGORGEMENT", [{ kind: "DISGORGEMENT", rateValue: 25 }]), [bottleLeg(-50, 0), extLeg(50, "loss")]);
    expect(ev.summary).toContain("−25 mL/bottle");
    expect(ev.summary).toContain("50 L lees/plug");
  });

  it("DISGORGEMENT partial: peeled bottle count on the parent leg", () => {
    const ev = describeOperation(op("DISGORGEMENT"), [bottleLeg(-375, -500)]);
    expect(ev.summary).toContain("500 bottles peeled/removed");
  });

  it("DOSAGE: added volume + sugar mass", () => {
    const ev = describeOperation(op("DOSAGE", [{ kind: "DOSAGE", computedTotal: 210 }]), [bottleLeg(30, 0), extLeg(-30, "dosage")]);
    expect(ev.summary).toContain("+30 L liqueur");
    expect(ev.summary).toContain("210 g sugar");
  });

  it("FINISH: bottle count → finished SKU", () => {
    const ev = describeOperation(op("FINISH"), [bottleLeg(-1110, -1500), extLeg(1110, "bottle")]);
    expect(ev.summary).toBe("Finalized 1500 bottles → finished SKU");
  });
});
