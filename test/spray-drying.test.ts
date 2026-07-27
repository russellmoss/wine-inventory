import { describe, expect, it } from "vitest";
import { deriveDriedBeforeRain, resolveDriedBeforeRain, type HourlyPrecipPoint } from "@/lib/spray/drying-core";
import type { SprayDryingOverrideRow } from "@/lib/spray/types";

const finishedAt = new Date("2026-07-01T15:30:00Z");

function series(points: [string, number][]): HourlyPrecipPoint[] {
  return points.map(([iso, mm]) => ({ hourStart: new Date(iso), precipMm: mm }));
}

// A full dry day around the spray, hour buckets 12:00–22:00.
const drySeries = series([
  ["2026-07-01T12:00:00Z", 0], ["2026-07-01T13:00:00Z", 0], ["2026-07-01T14:00:00Z", 0],
  ["2026-07-01T15:00:00Z", 0], ["2026-07-01T16:00:00Z", 0], ["2026-07-01T17:00:00Z", 0],
  ["2026-07-01T18:00:00Z", 0], ["2026-07-01T19:00:00Z", 0], ["2026-07-01T20:00:00Z", 0],
  ["2026-07-01T21:00:00Z", 0], ["2026-07-01T22:00:00Z", 0],
]);

describe("council S3 — driedBeforeRain is DERIVED, never self-reported", () => {
  it("no precipitation series ⇒ null + INSUFFICIENT_DATA — NEVER true", () => {
    const r = deriveDriedBeforeRain({ finishedAt, hourlyPrecip: null });
    expect(r).toEqual({ value: null, basis: "INSUFFICIENT_DATA" });
    expect(r.value).not.toBe(true); // the plausible-but-wrong optimistic default
  });

  it("a series that does not COVER the drying window ⇒ INSUFFICIENT_DATA", () => {
    const partial = series([["2026-07-01T15:00:00Z", 0]]); // 16:00–17:00 buckets missing
    expect(deriveDriedBeforeRain({ finishedAt, hourlyPrecip: partial })).toEqual({ value: null, basis: "INSUFFICIENT_DATA" });
  });

  it("rain 20 minutes after finish ⇒ false (did not dry)", () => {
    const rained = drySeries.map((p) => (p.hourStart.toISOString() === "2026-07-01T15:00:00.000Z" ? { ...p, precipMm: 3 } : p));
    expect(deriveDriedBeforeRain({ finishedAt, hourlyPrecip: rained })).toEqual({ value: false, basis: "HOURLY_PRECIP" });
  });

  it("rain 6 hours after finish ⇒ true (dried; the 2h default window closed dry)", () => {
    const later = drySeries.map((p) => (p.hourStart.toISOString() === "2026-07-01T21:00:00.000Z" ? { ...p, precipMm: 5 } : p));
    expect(deriveDriedBeforeRain({ finishedAt, hourlyPrecip: later })).toEqual({ value: true, basis: "NO_RAIN_IN_WINDOW" });
  });

  it("a null finishedAt ⇒ INSUFFICIENT_DATA (no anchor, no clock)", () => {
    expect(deriveDriedBeforeRain({ finishedAt: null, hourlyPrecip: drySeries })).toEqual({ value: null, basis: "INSUFFICIENT_DATA" });
  });
});

describe("KD-2 — the attributed override folds over the derived value", () => {
  const override = (id: string, value: boolean, enteredAtIso: string): SprayDryingOverrideRow => ({
    id,
    blockLineId: "b1",
    value,
    reason: "Stood in the vineyard — it was dry",
    observedAt: new Date("2026-07-01T16:00:00Z"),
    enteredById: "u1",
    enteredByEmail: "manager@demowinery.test",
    enteredAt: new Date(enteredAtIso),
  });

  it("an override beats the derived value and carries its attribution", () => {
    const r = resolveDriedBeforeRain({ driedBeforeRainDerived: false, driedBeforeRainBasis: "HOURLY_PRECIP" }, [override("o1", true, "2026-07-02T08:00:00Z")]);
    expect(r.source).toBe("OVERRIDE");
    if (r.source === "OVERRIDE") {
      expect(r.value).toBe(true);
      expect(r.attribution.email).toBe("manager@demowinery.test");
    }
  });

  it("the LATEST of two overrides wins and both are retained (the fn never mutates its input)", () => {
    const overrides = [override("o1", true, "2026-07-02T08:00:00Z"), override("o2", false, "2026-07-03T08:00:00Z")];
    const r = resolveDriedBeforeRain({ driedBeforeRainDerived: null, driedBeforeRainBasis: null }, overrides);
    if (r.source === "OVERRIDE") expect(r.value).toBe(false);
    expect(overrides).toHaveLength(2);
    expect(overrides[0].id).toBe("o1"); // input order untouched
  });

  it("no override + no derivation ⇒ UNKNOWN, never a default", () => {
    const r = resolveDriedBeforeRain({ driedBeforeRainDerived: null, driedBeforeRainBasis: null }, []);
    expect(r.source).toBe("UNKNOWN");
    expect(r.value).toBeNull();
  });
});
