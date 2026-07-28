import { describe, it, expect } from "vitest";
import { tankDetailFacts, type TankReading } from "@/lib/vessels/tank-detail-facts";

function r(observedAt: string, brix: number | null, tempC: number | null): TankReading {
  return { observedAt, brix, tempC };
}

const FERMENT: TankReading[] = [
  r("2026-07-16T08:00:00.000Z", 24.0, 22.5),
  r("2026-07-19T08:00:00.000Z", 18.2, 26.1),
  r("2026-07-23T08:00:00.000Z", 9.4, 21.0),
  r("2026-07-27T08:00:00.000Z", 4.8, 14.2),
];

describe("series", () => {
  it("plots Brix on the left axis and temperature on the right", () => {
    const f = tankDetailFacts(FERMENT);
    expect(f.series.map((s) => s.id)).toEqual(["brix", "temp"]);
    expect(f.series[0].axis).toBe("left");
    expect(f.series[1].axis).toBe("right");
  });

  it("orders points oldest-first regardless of input order", () => {
    const shuffled = [FERMENT[2], FERMENT[0], FERMENT[3], FERMENT[1]];
    const dates = tankDetailFacts(shuffled).series[0].points.map((p) => p.date);
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  it("uses epoch milliseconds, which is what TimeSeriesChart expects", () => {
    const p = tankDetailFacts(FERMENT).series[0].points[0];
    expect(p.date).toBe(Date.parse("2026-07-16T08:00:00.000Z"));
  });

  it("distinguishes the two series by encoding slot, not only colour", () => {
    // viz 1 and 3 are solid+circle and dashed+triangle. Same slot would leave colour alone.
    const f = tankDetailFacts(FERMENT);
    expect(f.series[0].viz).not.toBe(f.series[1].viz);
  });

  it("drops an analyte with no readings rather than plotting an empty line", () => {
    const f = tankDetailFacts([r("2026-07-16T08:00:00.000Z", 24.0, null)]);
    expect(f.series.map((s) => s.id)).toEqual(["brix"]);
  });

  it("carries partial panels — a temp-only reading still plots temp", () => {
    const f = tankDetailFacts([r("2026-07-16T08:00:00.000Z", 24.0, 22.5), r("2026-07-17T08:00:00.000Z", null, 23.9)]);
    expect(f.series.find((s) => s.id === "brix")?.points).toHaveLength(1);
    expect(f.series.find((s) => s.id === "temp")?.points).toHaveLength(2);
  });

  it("ignores an unparseable timestamp instead of plotting NaN", () => {
    const f = tankDetailFacts([...FERMENT, r("never", 1, 1)]);
    expect(f.series[0].points.every((p) => Number.isFinite(p.date))).toBe(true);
  });
});

describe("stated facts", () => {
  it("latest is the newest point, per analyte", () => {
    const f = tankDetailFacts(FERMENT);
    expect(f.latestBrix).toBe(4.8);
    expect(f.latestTemp).toBe(14.2);
  });

  it("delta is newest minus the one before it", () => {
    const f = tankDetailFacts(FERMENT);
    expect(f.brixDelta).toBeCloseTo(4.8 - 9.4, 6);
    expect(f.tempDelta).toBeCloseTo(14.2 - 21.0, 6);
  });

  it("a single reading has no delta — not zero", () => {
    // Zero would state "no change", which is a claim we cannot make from one point.
    const f = tankDetailFacts([r("2026-07-16T08:00:00.000Z", 24.0, 22.5)]);
    expect(f.brixDelta).toBeNull();
    expect(f.tempDelta).toBeNull();
  });

  it("no readings produces nulls and no NaN anywhere", () => {
    const f = tankDetailFacts([]);
    expect(f.latestBrix).toBeNull();
    expect(f.brixDelta).toBeNull();
    expect(f.series).toEqual([]);
    expect(JSON.stringify(f)).not.toContain("NaN");
  });

  it("delta is per-analyte — a temp-only newest reading does not shift the Brix delta", () => {
    const f = tankDetailFacts([...FERMENT, r("2026-07-28T08:00:00.000Z", null, 13.0)]);
    expect(f.latestBrix).toBe(4.8);
    expect(f.brixDelta).toBeCloseTo(4.8 - 9.4, 6);
    expect(f.latestTemp).toBe(13.0);
  });
});

describe("AC-S27 — the sentence and the stated facts cannot disagree", () => {
  // The invariant: everything the page states is one of `formatted`'s strings, and the
  // sentence is composed from those same strings. There is no second derivation to drift.

  it("every formatted value that exists appears verbatim in the sentence or is a delta", () => {
    const f = tankDetailFacts(FERMENT);
    for (const key of ["firstBrix", "lastBrix", "latestTemp"] as const) {
      const v = f.formatted[key];
      expect(v).not.toBeNull();
      expect(f.ariaSentence).toContain(v as string);
    }
  });

  it("the formatted latest equals the last plotted point, formatted the same way", () => {
    const f = tankDetailFacts(FERMENT);
    const lastBrixPoint = f.series[0].points[f.series[0].points.length - 1];
    expect(f.formatted.lastBrix).toBe(`${lastBrixPoint.value.toFixed(1)} Bx`);
    const lastTempPoint = f.series[1].points[f.series[1].points.length - 1];
    expect(f.formatted.latestTemp).toBe(`${lastTempPoint.value.toFixed(1)} °C`);
  });

  it("the delta agrees with the last two plotted points", () => {
    const f = tankDetailFacts(FERMENT);
    const pts = f.series[0].points;
    const computed = pts[pts.length - 1].value - pts[pts.length - 2].value;
    expect(f.brixDelta).toBeCloseTo(computed, 6);
    expect(f.formatted.brixDelta).toBe(`-${Math.abs(computed).toFixed(1)} Bx`);
  });

  it("the sentence's DIRECTION agrees with the plotted series", () => {
    expect(tankDetailFacts(FERMENT).ariaSentence).toContain("falling");
    const rising = [r("2026-07-16T08:00:00.000Z", 4.0, 10), r("2026-07-18T08:00:00.000Z", 9.0, 12)];
    expect(tankDetailFacts(rising).ariaSentence).toContain("rising");
    const flat = [r("2026-07-16T08:00:00.000Z", 4.0, 10), r("2026-07-18T08:00:00.000Z", 4.0, 10)];
    expect(tankDetailFacts(flat).ariaSentence).toContain("flat");
  });

  it("EVERY measurement numeral in the sentence traces back to a formatted field", () => {
    // The strongest form: pull the numbers out of the prose and prove each one was not
    // invented by the sentence writer. Day numbers in the date span are excluded by
    // stripping the span first, which is the only part of the sentence that is not a
    // measurement.
    for (const readings of [FERMENT, FERMENT.slice(0, 2), [FERMENT[0]], [r("2026-07-16T08:00:00.000Z", null, 19.5)]]) {
      const f = tankDetailFacts(readings);
      const measured = f.ariaSentence.split(/ between | on /)[0];
      const numerals = measured.match(/-?\d+(?:\.\d+)?/g) ?? [];
      const known = Object.values(f.formatted)
        .filter((v): v is string => v != null)
        .flatMap((v) => v.match(/-?\d+(?:\.\d+)?/g) ?? []);
      for (const n of numerals) expect(known).toContain(n);
    }
  });

  it("states nothing at all when there is nothing measured", () => {
    const f = tankDetailFacts([]);
    expect(f.ariaSentence).toBe("No readings yet for this tank.");
    expect(Object.values(f.formatted).every((v) => v === null)).toBe(true);
  });

  it("a single reading is described as a single reading, never as a trend", () => {
    const f = tankDetailFacts([r("2026-07-16T08:00:00.000Z", 24.0, 22.5)]);
    expect(f.ariaSentence).toContain("single reading");
    expect(f.ariaSentence).not.toMatch(/falling|rising/);
  });

  it("reads like doc 10 §9's example", () => {
    expect(tankDetailFacts(FERMENT).ariaSentence).toBe(
      "Brix falling from 24.0 Bx to 4.8 Bx and temperature falling to 14.2 °C between 16 July and 27 July.",
    );
  });

  it("never says 'between 27 July and 27 July'", () => {
    // Two readings an hour apart have different observedAt but the same day. Comparing
    // timestamps instead of day labels produced a sentence no person would write.
    const sameDay = [r("2026-07-27T08:00:00.000Z", 18.0, 24.0), r("2026-07-27T15:00:00.000Z", 17.0, 29.4)];
    const s = tankDetailFacts(sameDay).ariaSentence;
    expect(s).toContain("on 27 July");
    expect(s).not.toMatch(/between (.+) and \1/);
  });

  it("still spans two days when the readings really are on two days", () => {
    const s = tankDetailFacts(FERMENT).ariaSentence;
    expect(s).toContain("between 16 July and 27 July");
  });

  it("is deterministic — no clock, no locale drift between calls", () => {
    expect(tankDetailFacts(FERMENT).ariaSentence).toBe(tankDetailFacts(FERMENT).ariaSentence);
  });
});

describe("void exclusion is upstream, and it changes the answer", () => {
  it("removing a reading moves the stated latest", () => {
    // Proves the caller's voidedAt filter actually matters rather than being decorative.
    const withAll = tankDetailFacts(FERMENT);
    const withoutNewest = tankDetailFacts(FERMENT.slice(0, 3));
    expect(withAll.latestBrix).toBe(4.8);
    expect(withoutNewest.latestBrix).toBe(9.4);
    expect(withAll.ariaSentence).not.toBe(withoutNewest.ariaSentence);
  });
});
