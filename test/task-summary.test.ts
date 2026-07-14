import { describe, it, expect } from "vitest";
import { buildTaskSummary, type TaskSummaryPickers } from "@/lib/work-orders/task-summary";

const pickers: TaskSummaryPickers = {
  vessels: [
    { id: "v_t4", label: "Tank 4", kind: "TANK", volumeL: 5000, capacityL: 6000 },
    { id: "v_t5", label: "Tank 5", kind: "TANK", volumeL: 3000, capacityL: 6000 },
    { id: "v_b1", label: "Barrel B1", kind: "BARREL", volumeL: 0, capacityL: 225 },
  ],
  materials: [
    { id: "m_so2", label: "SO₂ (KMBS)", unit: "g", kind: "SO2" },
    { id: "m_bento", label: "Bentonite", unit: "g", kind: "FINING" },
  ],
  lots: [{ id: "l_1", label: "24-CAB-01" }],
};

const rowVal = (rows: { label: string; value: string }[], label: string) => rows.find((r) => r.label === label)?.value;

describe("buildTaskSummary — SO₂ addition", () => {
  it("computes the KMBS solution volume from the tank's current volume", () => {
    const s = buildTaskSummary(
      {
        kind: "OPERATION",
        opType: "ADDITION",
        title: "Add SO₂",
        plannedPayload: { vesselId: "v_t4", lotId: "l_1", materialId: "m_so2", amount: 14, doseUnit: "mg/L", solutionPercentKmbs: 10 },
      },
      pickers,
    );
    // 5000 L × 14 ppm = 70 g SO₂; 10% KMBS = 5.76% SO₂ w/v → 70 / 57.6 g/L = ~1.215 L
    expect(s.headline).toBe("Add 14 ppm SO₂ (KMBS) to Tank 4");
    expect(rowVal(s.rows, "Vessel")).toBe("Tank 4");
    expect(rowVal(s.rows, "Lot")).toBe("24-CAB-01");
    expect(rowVal(s.rows, "Dose")).toBe("14 ppm (mg/L)");
    expect(rowVal(s.rows, "Add")).toMatch(/^≈ 1\.2\d L of 10% KMBS solution$/);
    expect(rowVal(s.rows, "SO₂ delivered")).toBe("≈ 70 g (at 5,000 L)");
    expect(rowVal(s.rows, "or as powder")).toMatch(/g KMBS$/);
  });

  it("falls back to grams-only when no solution strength is stored", () => {
    const s = buildTaskSummary(
      { kind: "OPERATION", opType: "ADDITION", title: "Add SO₂", plannedPayload: { vesselId: "v_t5", materialId: "m_so2", amount: 30, doseUnit: "mg/L" } },
      pickers,
    );
    expect(rowVal(s.rows, "Add")).toBeUndefined();
    // Generic weigh-out total (SO₂ has no solution → the generic dose total shows).
    expect(rowVal(s.rows, "Total to weigh out")).toMatch(/^≈ /);
  });

  it("does not compute a solution line for a non-SO₂ material even if a percent leaks in", () => {
    const s = buildTaskSummary(
      { kind: "OPERATION", opType: "FINING", title: "Fine", plannedPayload: { vesselId: "v_t4", materialId: "m_bento", amount: 40, doseUnit: "g/hL", solutionPercentKmbs: 10 } },
      pickers,
    );
    expect(s.headline).toBe("Fine with 40 g/hL Bentonite to Tank 4");
    expect(rowVal(s.rows, "Add")).toBeUndefined();
    expect(rowVal(s.rows, "Total to weigh out")).toMatch(/g/);
  });
});

describe("buildTaskSummary — other tasks", () => {
  it("renders a rack as From/To with a headline", () => {
    const s = buildTaskSummary(
      { kind: "OPERATION", opType: "RACK", title: "Rack", plannedPayload: { fromVesselId: "v_t4", toVesselId: "v_t5" } },
      pickers,
    );
    expect(s.headline).toBe("Rack Tank 4 → Tank 5");
    expect(rowVal(s.rows, "From")).toBe("Tank 4");
    expect(rowVal(s.rows, "To")).toBe("Tank 5");
  });

  it("degrades to the task title when there is nothing to say", () => {
    const s = buildTaskSummary({ kind: "NOTE", title: "Check the glycol lines", plannedPayload: {} }, pickers);
    expect(s.headline).toBe("Check the glycol lines");
    expect(s.rows).toEqual([]);
  });

  it("uses barrel capacity (full) for a barrel addition volume", () => {
    const s = buildTaskSummary(
      { kind: "OPERATION", opType: "ADDITION", title: "Add SO₂", plannedPayload: { vesselId: "v_b1", materialId: "m_so2", amount: 20, doseUnit: "mg/L", solutionPercentKmbs: 10 } },
      pickers,
    );
    // Barrel: 225 L × 20 ppm = 4.5 g SO₂
    expect(rowVal(s.rows, "SO₂ delivered")).toBe("≈ 4.5 g (at 225 L)");
  });
});
