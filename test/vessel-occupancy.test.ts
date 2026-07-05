import { describe, it, expect } from "vitest";
import {
  currentOccupancyWindow,
  type VesselOpAggregate,
} from "@/lib/vessel/occupancy";

// FUNCTIONAL_ZERO_L is 0.01 L — a running total at/below that is "functionally empty".
// All timestamps are fixed ISO strings (never Date.now()) so the tests are deterministic.

describe("currentOccupancyWindow", () => {
  it("returns null for no events", () => {
    expect(currentOccupancyWindow([])).toBeNull();
  });

  it("never-emptied vessel: window starts at the first fill op", () => {
    const events: VesselOpAggregate[] = [
      { opId: 10, observedAt: "2026-03-01T08:00:00.000Z", deltaL: 500 }, // fill
      { opId: 11, observedAt: "2026-03-05T09:00:00.000Z", deltaL: 0 }, // cap-mgmt, volume-neutral
      { opId: 12, observedAt: "2026-03-10T10:00:00.000Z", deltaL: -1.5 }, // filtration loss
    ];
    const w = currentOccupancyWindow(events);
    expect(w).toEqual({ startOpId: 10, startAt: "2026-03-01T08:00:00.000Z" });
  });

  it("emptied then refilled: window starts at the refill op", () => {
    const events: VesselOpAggregate[] = [
      { opId: 20, observedAt: "2026-01-01T08:00:00.000Z", deltaL: 300 }, // first fill
      { opId: 21, observedAt: "2026-02-01T08:00:00.000Z", deltaL: -300 }, // racked fully out → empty
      { opId: 22, observedAt: "2026-04-01T08:00:00.000Z", deltaL: 450 }, // refilled (new vintage)
      { opId: 23, observedAt: "2026-04-10T08:00:00.000Z", deltaL: -2 }, // top-off loss
    ];
    const w = currentOccupancyWindow(events);
    expect(w).toEqual({ startOpId: 22, startAt: "2026-04-01T08:00:00.000Z" });
  });

  it("heel left / topped up: continuous window, no reset (never crosses zero)", () => {
    const events: VesselOpAggregate[] = [
      { opId: 30, observedAt: "2026-05-01T08:00:00.000Z", deltaL: 200 }, // fill
      { opId: 31, observedAt: "2026-05-15T08:00:00.000Z", deltaL: -195 }, // big rack-out, 5 L heel remains
      { opId: 32, observedAt: "2026-05-20T08:00:00.000Z", deltaL: 300 }, // topped up onto the heel
    ];
    const w = currentOccupancyWindow(events);
    // Running never dropped to ≤ 0.01, so the window is still the original fill.
    expect(w).toEqual({ startOpId: 30, startAt: "2026-05-01T08:00:00.000Z" });
  });

  it("currently empty: returns null", () => {
    const events: VesselOpAggregate[] = [
      { opId: 40, observedAt: "2026-06-01T08:00:00.000Z", deltaL: 250 },
      { opId: 41, observedAt: "2026-06-20T08:00:00.000Z", deltaL: -250 }, // racked fully out
    ];
    expect(currentOccupancyWindow(events)).toBeNull();
  });

  it("dust-level residual counts as empty (≤ FUNCTIONAL_ZERO_L)", () => {
    const events: VesselOpAggregate[] = [
      { opId: 50, observedAt: "2026-06-01T08:00:00.000Z", deltaL: 100 },
      { opId: 51, observedAt: "2026-06-02T08:00:00.000Z", deltaL: -99.995 }, // 0.005 L residual → dust
    ];
    expect(currentOccupancyWindow(events)).toBeNull();
  });

  it("same-day multi-empty: window starts at the LAST refill", () => {
    const events: VesselOpAggregate[] = [
      { opId: 60, observedAt: "2026-07-01T08:00:00.000Z", deltaL: 100 }, // fill A
      { opId: 61, observedAt: "2026-07-01T10:00:00.000Z", deltaL: -100 }, // empty
      { opId: 62, observedAt: "2026-07-01T12:00:00.000Z", deltaL: 150 }, // fill B
      { opId: 63, observedAt: "2026-07-01T14:00:00.000Z", deltaL: -150 }, // empty again
      { opId: 64, observedAt: "2026-07-01T16:00:00.000Z", deltaL: 200 }, // fill C (current)
    ];
    const w = currentOccupancyWindow(events);
    expect(w).toEqual({ startOpId: 64, startAt: "2026-07-01T16:00:00.000Z" });
  });

  it("folds out of order: sorts ascending by opId before folding", () => {
    const events: VesselOpAggregate[] = [
      { opId: 72, observedAt: "2026-04-01T08:00:00.000Z", deltaL: 450 }, // refill (given first)
      { opId: 70, observedAt: "2026-01-01T08:00:00.000Z", deltaL: 300 }, // first fill
      { opId: 71, observedAt: "2026-02-01T08:00:00.000Z", deltaL: -300 }, // empty
    ];
    const w = currentOccupancyWindow(events);
    expect(w).toEqual({ startOpId: 72, startAt: "2026-04-01T08:00:00.000Z" });
  });

  describe("circuit-breaker: CLEAN/SANITIZE/STEAM reset events", () => {
    it("dirty empty: a CLEAN after a heel-leaving rack starts a fresh window at the clean time", () => {
      // Rack-out leaves a lees heel (never crosses FUNCTIONAL_ZERO_L), then the vessel is washed
      // and refilled — volume alone would merge the two vintages. The CLEAN forces a boundary.
      const events: VesselOpAggregate[] = [
        { opId: 80, observedAt: "2026-01-10T08:00:00.000Z", deltaL: 400 }, // vintage A fill
        { opId: 81, observedAt: "2026-03-01T08:00:00.000Z", deltaL: -398 }, // rack out, 2 L heel
        { opId: 82, observedAt: "2026-03-20T08:00:00.000Z", deltaL: 500 }, // vintage B fill (onto heel)
      ];
      // CLEAN happened between the rack-out and the new fill.
      const resetEvents = [{ at: "2026-03-05T08:00:00.000Z" }];
      const w = currentOccupancyWindow(events, { resetEvents });
      // Volume window would be opId 80 (never emptied); the CLEAN is later → fresh window there,
      // startOpId null (no fill op to pin), startAt = the clean time.
      expect(w).toEqual({ startOpId: null, startAt: "2026-03-05T08:00:00.000Z" });
    });

    it("a CLEAN BEFORE the current fill does not override the later volume window", () => {
      const events: VesselOpAggregate[] = [
        { opId: 90, observedAt: "2026-04-01T08:00:00.000Z", deltaL: 500 }, // fill (after the clean)
      ];
      const resetEvents = [{ at: "2026-03-25T08:00:00.000Z" }]; // clean before the fill
      const w = currentOccupancyWindow(events, { resetEvents });
      // The fill is later than the clean, so the volume window wins.
      expect(w).toEqual({ startOpId: 90, startAt: "2026-04-01T08:00:00.000Z" });
    });

    it("ignores reset events in the future (after now)", () => {
      const events: VesselOpAggregate[] = [
        { opId: 100, observedAt: "2026-04-01T08:00:00.000Z", deltaL: 500 },
      ];
      const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
      const w = currentOccupancyWindow(events, { resetEvents: [{ at: future }] });
      expect(w).toEqual({ startOpId: 100, startAt: "2026-04-01T08:00:00.000Z" });
    });

    it("a reset on an empty vessel still returns null (empty wins)", () => {
      const events: VesselOpAggregate[] = [
        { opId: 110, observedAt: "2026-06-01T08:00:00.000Z", deltaL: 250 },
        { opId: 111, observedAt: "2026-06-20T08:00:00.000Z", deltaL: -250 }, // empty
      ];
      const resetEvents = [{ at: "2026-06-21T08:00:00.000Z" }];
      expect(currentOccupancyWindow(events, { resetEvents })).toBeNull();
    });

    it("accepts Date objects as well as ISO strings for observedAt and reset.at", () => {
      const events: VesselOpAggregate[] = [
        { opId: 120, observedAt: new Date("2026-01-10T08:00:00.000Z"), deltaL: 400 },
        { opId: 121, observedAt: new Date("2026-03-01T08:00:00.000Z"), deltaL: -398 }, // heel
        { opId: 122, observedAt: new Date("2026-03-20T08:00:00.000Z"), deltaL: 500 },
      ];
      const resetEvents = [{ at: new Date("2026-03-05T08:00:00.000Z") }];
      const w = currentOccupancyWindow(events, { resetEvents });
      expect(w).toEqual({ startOpId: null, startAt: "2026-03-05T08:00:00.000Z" });
    });
  });
});
