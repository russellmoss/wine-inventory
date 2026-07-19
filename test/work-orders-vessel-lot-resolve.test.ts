import { describe, it, expect } from "vitest";
import { vesselLotState, reconcileLotValue, lotValueForNewVessel, type LotsByVessel } from "@/lib/work-orders/vessel-lot-resolve";

// Occupancy fixtures mirror the `vesselLot` projection the builder is fed: T1 holds one lot, T2 is a
// blend of two, T3 has no entry at all (empty vessel — the server emits no key for it).
const OCCUPANCY: LotsByVessel = {
  "vessel-t1": [{ id: "lot-a", label: "2024 CS T1" }],
  "vessel-t2": [
    { id: "lot-b", label: "2024 ME T2" },
    { id: "lot-c", label: "2024 CF T2" },
  ],
};

describe("vesselLotState — vessel occupancy drives the lot field", () => {
  it("single-lot vessel resolves to that lot (the winemaker is never asked)", () => {
    const state = vesselLotState("vessel-t1", OCCUPANCY);
    expect(state.kind).toBe("single");
    if (state.kind !== "single") return;
    expect(state.lot.id).toBe("lot-a");
    expect(state.lot.label).toBe("2024 CS T1");
  });

  it("multi-lot vessel (a blend) stays ambiguous and surfaces EVERY resident", () => {
    const state = vesselLotState("vessel-t2", OCCUPANCY);
    expect(state.kind).toBe("blend");
    if (state.kind !== "blend") return;
    // The load-bearing assertion: a blend must NOT collapse to one lot.
    expect(state.lots.map((l) => l.id)).toEqual(["lot-b", "lot-c"]);
  });

  it("empty vessel resolves to nothing — no lot is invented", () => {
    expect(vesselLotState("vessel-t3", OCCUPANCY).kind).toBe("empty");
    expect(vesselLotState("vessel-unknown", {}).kind).toBe("empty");
  });

  it("no vessel chosen yet falls back to the unnarrowed list", () => {
    expect(vesselLotState("", OCCUPANCY).kind).toBe("no-vessel");
    expect(vesselLotState(null, OCCUPANCY).kind).toBe("no-vessel");
    expect(vesselLotState(undefined, OCCUPANCY).kind).toBe("no-vessel");
    expect(vesselLotState("   ", OCCUPANCY).kind).toBe("no-vessel");
  });
});

describe("reconcileLotValue — a stale lot never survives a vessel change", () => {
  it("single: pins the sole resident, overriding whatever was there", () => {
    const state = vesselLotState("vessel-t1", OCCUPANCY);
    expect(reconcileLotValue(state, "")).toBe("lot-a");
    expect(reconcileLotValue(state, "lot-c")).toBe("lot-a"); // wrong-vessel leftover is corrected
  });

  it("blend: keeps a resident choice, clears a non-resident one", () => {
    const state = vesselLotState("vessel-t2", OCCUPANCY);
    expect(reconcileLotValue(state, "lot-c")).toBe("lot-c");
    expect(reconcileLotValue(state, "lot-a")).toBe(""); // lot-a lives in T1, not T2
    expect(reconcileLotValue(state, "")).toBe(""); // still unanswered — the builder keeps asking
  });

  it("empty: clears any lot, because there is no wine to attach to", () => {
    const state = vesselLotState("vessel-t3", OCCUPANCY);
    expect(reconcileLotValue(state, "lot-a")).toBe("");
  });

  it("no-vessel: leaves the existing choice untouched", () => {
    const state = vesselLotState("", OCCUPANCY);
    expect(reconcileLotValue(state, "lot-a")).toBe("lot-a");
    expect(reconcileLotValue(state, "")).toBe("");
  });
});

describe("lotValueForNewVessel — switching vessels never pre-answers a blend", () => {
  it("blend ALWAYS clears, even when the carried-over lot is resident", () => {
    const state = vesselLotState("vessel-t2", OCCUPANCY);
    // lot-b IS in T2, so validation would keep it — but nobody chose it FOR T2 (it may have been
    // auto-resolved from a different single-lot vessel), so a vessel change must not pre-fill it.
    expect(reconcileLotValue(state, "lot-b")).toBe("lot-b");
    expect(lotValueForNewVessel(state, "lot-b")).toBe("");
    expect(lotValueForNewVessel(state, "lot-a")).toBe("");
  });

  it("agrees with reconcileLotValue everywhere else", () => {
    for (const vesselId of ["vessel-t1", "vessel-t3", ""]) {
      const state = vesselLotState(vesselId, OCCUPANCY);
      for (const current of ["", "lot-a", "lot-c"]) {
        expect(lotValueForNewVessel(state, current)).toBe(reconcileLotValue(state, current));
      }
    }
  });

  it("single-lot vessel still auto-resolves on the vessel change itself", () => {
    expect(lotValueForNewVessel(vesselLotState("vessel-t1", OCCUPANCY), "")).toBe("lot-a");
  });
});
