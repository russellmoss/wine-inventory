import { describe, it, expect } from "vitest";
import { vesselLotState, reconcileLotValue, type LotsByVessel } from "@/lib/work-orders/vessel-lot-resolve";

// Occupancy fixtures mirror the `vesselLot` projection the builder is fed: T1 holds its wine, T3 has no
// entry at all (empty vessel — the server emits no key for it). T2 carries TWO rows on purpose: that is
// a pre-LEDGER-12 vessel, the shape the DB unique index now refuses. It stays in the fixtures because
// the builder must still render something sane if it ever meets one, and "volume-descending, take the
// first" is that something — the server orders the rows, so lot-b is the wine in T2.
const OCCUPANCY: LotsByVessel = {
  "vessel-t1": [{ id: "lot-a", label: "2024 CS T1" }],
  "vessel-t2": [
    { id: "lot-b", label: "2024 ME T2" },
    { id: "lot-c", label: "2024 CF T2" },
  ],
};

describe("vesselLotState — vessel occupancy drives the lot field", () => {
  it("a vessel resolves to its wine (the winemaker is never asked)", () => {
    const state = vesselLotState("vessel-t1", OCCUPANCY);
    expect(state.kind).toBe("single");
    if (state.kind !== "single") return;
    expect(state.lot.id).toBe("lot-a");
    expect(state.lot.label).toBe("2024 CS T1");
  });

  // LEDGER-12 (plan 088). This used to assert `kind === "blend"` and that the state surfaced EVERY
  // resident — the outcome that drove the "— blend: which lot? —" dropdown on the builder.
  it("a legacy multi-resident vessel resolves too, rather than stalling on a question with no answer", () => {
    const state = vesselLotState("vessel-t2", OCCUPANCY);
    expect(state.kind).toBe("single");
    if (state.kind !== "single") return;
    expect(state.lot.id).toBe("lot-b");
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
  it("pins the vessel's wine, overriding whatever was there", () => {
    const state = vesselLotState("vessel-t1", OCCUPANCY);
    expect(reconcileLotValue(state, "")).toBe("lot-a");
    expect(reconcileLotValue(state, "lot-c")).toBe("lot-a"); // wrong-vessel leftover is corrected
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

  // There used to be a SECOND function, lotValueForNewVessel, applied only on a vessel change: a blend
  // always cleared there, so nobody was shown a lot they hadn't chosen. With one lot per vessel the two
  // rules coincide, so the builder applies THIS one on both paths — retyping the vessel is enough.
  it("re-pointing a task at another vessel swaps the lot with it", () => {
    // T1 → T2 → T3 → back to T1, carrying whatever the field held at each step.
    let lot = reconcileLotValue(vesselLotState("vessel-t1", OCCUPANCY), "");
    expect(lot).toBe("lot-a");
    lot = reconcileLotValue(vesselLotState("vessel-t2", OCCUPANCY), lot);
    expect(lot).toBe("lot-b"); // never keeps T1's lot on T2
    lot = reconcileLotValue(vesselLotState("vessel-t3", OCCUPANCY), lot);
    expect(lot).toBe(""); // empty vessel: the task is unanswered, and the builder says so
    lot = reconcileLotValue(vesselLotState("vessel-t1", OCCUPANCY), lot);
    expect(lot).toBe("lot-a");
  });
});
