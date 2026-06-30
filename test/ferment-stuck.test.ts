import { describe, it, expect } from "vitest";
import { detectStuck, type BrixReading } from "@/lib/ferment/stuck";

// Build readings N days apart (one per day), oldest-first by default.
const days = (vals: number[], startISO = "2026-09-01T08:00:00Z"): BrixReading[] => {
  const start = new Date(startISO).getTime();
  return vals.map((brix, i) => ({ observedAt: new Date(start + i * 86_400_000), brix }));
};

describe("detectStuck", () => {
  it("fires on a flat ACTIVE run above the sugar floor", () => {
    // 12.1 → 12.0 → 11.9 over 3 days: < 1 °Bx drop, well above dryness, AF active → STUCK.
    const r = detectStuck(days([12.1, 12.0, 11.9]), { afState: "ACTIVE" });
    expect(r.stuck).toBe(true);
    expect(r.reason).toBe("flat-brix");
  });

  it("does NOT fire while dropping normally", () => {
    const r = detectStuck(days([24, 18, 11]), { afState: "ACTIVE" });
    expect(r.stuck).toBe(false);
    expect(r.reason).toBe("dropping");
  });

  it("ignores cold soak (AF NONE) even if Brix is flat", () => {
    const r = detectStuck(days([23, 23, 23]), { afState: "NONE" });
    expect(r.stuck).toBe(false);
    expect(r.reason).toBe("not-active");
  });

  it("ignores the near-dryness crawl (Brix at/below the floor)", () => {
    // Flat but already near dry (~0 °Bx) — the normal end-of-ferment plateau, not stuck.
    const r = detectStuck(days([0.5, 0.2, 0.1]), { afState: "ACTIVE" });
    expect(r.stuck).toBe(false);
    expect(r.reason).toBe("near-dryness");
  });

  it("recomputes correctly when a late (out-of-order) reading is inserted", () => {
    // A flat history, then a late backfill of an EARLIER high reading proving it WAS dropping.
    const flat = days([12.0, 11.9, 11.8]); // looks stuck
    expect(detectStuck(flat, { afState: "ACTIVE" }).stuck).toBe(true);
    // Insert (out of order) an even-earlier 22 °Bx 1 day before the window start → now the
    // 48h window still spans the flat tail, so it stays stuck; but a recent drop clears it:
    const withRecentDrop: BrixReading[] = [
      ...days([12.0, 11.9]),
      { observedAt: "2026-09-03T08:00:00Z", brix: 9.0 }, // a real drop on day 3
    ];
    expect(detectStuck(withRecentDrop, { afState: "ACTIVE" }).stuck).toBe(false);
  });

  it("excludes voided readings", () => {
    const readings: BrixReading[] = [
      ...days([12.0, 11.95]),
      { observedAt: "2026-09-03T08:00:00Z", brix: 2.0, voided: true }, // a fat-finger, voided
      { observedAt: "2026-09-03T16:00:00Z", brix: 11.9 }, // the real day-3 reading
    ];
    const r = detectStuck(readings, { afState: "ACTIVE" });
    expect(r.stuck).toBe(true); // the voided 2.0 must not count as a "drop"
  });

  it("needs a window of history before it can decide", () => {
    const r = detectStuck(days([12.0]), { afState: "ACTIVE" });
    expect(r.stuck).toBe(false);
    expect(r.reason).toBe("insufficient-data");
  });
});
