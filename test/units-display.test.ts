import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMPERIAL_PREFS,
  DEFAULT_METRIC_PREFS,
  displayToLiters,
  formatAreaHa,
  formatCostPerVolume,
  formatDistance,
  formatLength,
  formatVolume,
  formatWeightKg,
  formatWeightToAdd,
  legacyUnitToSystem,
  litersToDisplay,
  normalizeUnitSystem,
  parseVolumeUnit,
  resolveAreaUnit,
  resolveSpacingUnit,
  resolveUnitPrefs,
  systemToLegacyUnit,
  unitPrefsSentence,
  volumeInputToLiters,
  volumeInputValue,
  tempUnitSystem,
  precipUnitSystem,
  weightLegacyUnit,
  weighOutSecondary,
} from "@/lib/units/display";
import { LITERS_PER_US_GALLON } from "@/lib/compliance/gallons";

// Plan 098 U2 — the ONE display-unit authority. The resolver contract (council DQ3):
// dimensionUnit = override ?? masterMapping[dimension] ?? metric default.

describe("resolveUnitPrefs — the resolution chain", () => {
  it("null row → metric defaults (today's behavior for an unconfigured tenant)", () => {
    expect(resolveUnitPrefs(null)).toEqual(DEFAULT_METRIC_PREFS);
    expect(resolveUnitPrefs(undefined)).toEqual(DEFAULT_METRIC_PREFS);
    expect(resolveUnitPrefs({})).toEqual(DEFAULT_METRIC_PREFS);
  });

  it("master IMPERIAL maps every dimension imperial", () => {
    expect(resolveUnitPrefs({ unitSystem: "IMPERIAL" })).toEqual(DEFAULT_IMPERIAL_PREFS);
  });

  it("a per-dimension override beats the master (Canadian winery: °C but gallons)", () => {
    const prefs = resolveUnitPrefs({ unitSystem: "IMPERIAL", unitTemperature: "C" });
    expect(prefs.temperature).toBe("C");
    expect(prefs.volume).toBe("GAL"); // no override → follows master
    expect(prefs.weight).toBe("LB");
  });

  it("hL is reachable only as an explicit override (no master maps to it)", () => {
    const prefs = resolveUnitPrefs({ unitSystem: "METRIC", unitVolume: "HL" });
    expect(prefs.volume).toBe("HL");
    expect(prefs.temperature).toBe("C");
  });

  it("an unknown stored value reads as not-set, never an error (read-side permissive)", () => {
    const prefs = resolveUnitPrefs({ unitSystem: "bogus", unitVolume: "cups", unitTemperature: "F" });
    expect(prefs.system).toBe("METRIC");
    expect(prefs.volume).toBe("L");
    expect(prefs.temperature).toBe("F"); // the valid override still lands
  });
});

describe("legacy bridges (council C3 — bridged, never renamed)", () => {
  it("lowercase union round-trips through the canonical type", () => {
    expect(legacyUnitToSystem("imperial")).toBe("IMPERIAL");
    expect(legacyUnitToSystem("metric")).toBe("METRIC");
    expect(systemToLegacyUnit("IMPERIAL")).toBe("imperial");
    expect(systemToLegacyUnit("METRIC")).toBe("metric");
  });
  it("normalizeUnitSystem coerces junk to METRIC (the storage system)", () => {
    expect(normalizeUnitSystem("IMPERIAL")).toBe("IMPERIAL");
    expect(normalizeUnitSystem("imperial")).toBe("METRIC");
    expect(normalizeUnitSystem(null)).toBe("METRIC");
  });
});

describe("geometry resolvers — override → tenant dimension", () => {
  it("a stored per-vineyard defaultUnit wins", () => {
    expect(resolveSpacingUnit("imperial", DEFAULT_METRIC_PREFS)).toBe("imperial");
    expect(resolveAreaUnit("metric", DEFAULT_IMPERIAL_PREFS)).toBe("metric");
  });
  it("NULL override follows the tenant's length/area dimension respectively", () => {
    expect(resolveSpacingUnit(null, DEFAULT_IMPERIAL_PREFS)).toBe("imperial");
    expect(resolveSpacingUnit(null, DEFAULT_METRIC_PREFS)).toBe("metric");
    const mixed = resolveUnitPrefs({ unitSystem: "METRIC", unitArea: "ACRES" });
    expect(resolveAreaUnit(null, mixed)).toBe("imperial");
    expect(resolveSpacingUnit(null, mixed)).toBe("metric");
  });
  it("legacy junk in the override column reads as unset", () => {
    expect(resolveSpacingUnit("IMPERIAL", DEFAULT_METRIC_PREFS)).toBe("metric");
  });
});

describe("formatVolume — L | hL | gal", () => {
  it("litres pass through with grouping", () => {
    expect(formatVolume(1250, "L")).toBe("1,250 L");
    expect(formatVolume(50.5, "L")).toBe("50.5 L");
    expect(formatVolume(2.25, "L")).toBe("2.25 L");
  });
  it("hectolitres divide by 100 and keep barrel-scale precision", () => {
    expect(formatVolume(5000, "HL")).toBe("50 hL");
    expect(formatVolume(225, "HL")).toBe("2.25 hL");
    expect(formatVolume(1250, "HL")).toBe("12.5 hL");
  });
  it("gallons: whole grouped at ≥100, decimals below", () => {
    expect(formatVolume(1000 * LITERS_PER_US_GALLON, "GAL")).toBe("1,000 gal");
    expect(formatVolume(200, "GAL")).toBe("52.8 gal");
    expect(formatVolume(19, "GAL")).toBe("5.02 gal");
  });
  it("round-trip stability (council C5): 1000 gal → litres → renders 1,000 gal", () => {
    const storedLiters = displayToLiters(1000, "GAL");
    expect(storedLiters).toBeCloseTo(3785.411784, 6);
    expect(formatVolume(storedLiters, "GAL")).toBe("1,000 gal");
    expect(litersToDisplay(storedLiters, "GAL")).toBeCloseTo(1000, 9);
  });
  it("null-safety", () => {
    expect(formatVolume(null, "GAL")).toBe("—");
    expect(formatVolume(undefined, "L")).toBe("—");
    expect(formatVolume(Number.NaN, "HL")).toBe("—");
  });
});

describe("formatCostPerVolume — the one place a converted money rate exists", () => {
  it("$/L → $/gal multiplies by the exact gallon", () => {
    expect(formatCostPerVolume(1, "GAL", "$")).toBe("$3.7854/gal");
    expect(formatCostPerVolume(1, "HL", "$")).toBe("$100.00/hL");
    expect(formatCostPerVolume(1.5, "L", "$")).toBe("$1.50/L");
  });
  it("min 2, max 4 fraction digits — a tiny nonzero component must never display as zero", () => {
    expect(formatCostPerVolume(0.5, "L", "€")).toBe("€0.50/L");
    expect(formatCostPerVolume(1.23456, "L", "$")).toBe("$1.2346/L");
    expect(formatCostPerVolume(0.0004, "L", "$")).toBe("$0.0004/L");
  });
  it("null → em dash", () => {
    expect(formatCostPerVolume(null, "GAL", "$")).toBe("—");
  });
});

describe("length / distance / area", () => {
  it("formatLength (elevation): metres or feet, whole numbers", () => {
    expect(formatLength(120, "M")).toBe("120 m");
    expect(formatLength(120, "FT")).toBe("394 ft");
    expect(formatLength(null, "M")).toBe("—");
  });
  it("formatDistance (station distance): km or miles, 1 dp", () => {
    expect(formatDistance(2.4, "METRIC")).toBe("2.4 km");
    expect(formatDistance(1.609344, "IMPERIAL")).toBe("1.0 mi");
  });
  it("formatAreaHa converts hectares to acres", () => {
    expect(formatAreaHa(1, "HA")).toBe("1.00 ha");
    expect(formatAreaHa(1, "ACRES")).toBe("2.47 acres");
    expect(formatAreaHa(null, "HA")).toBe("—");
  });
});

describe("weights", () => {
  it("formatWeightKg bridges to the harvest rollup", () => {
    expect(formatWeightKg(850, "KG")).toBe("850.0 kg");
    expect(formatWeightKg(1250, "KG")).toBe("1.25 t");
    expect(formatWeightKg(850, "LB")).toBe("1873.9 lb");
  });
  it("formatWeightToAdd: the dosing total the cellar hand weighs out", () => {
    expect(formatWeightToAdd(908, "LB")).toBe("2.00 lb");
    expect(formatWeightToAdd(908, "KG")).toBe("908 g");
    expect(formatWeightToAdd(1500, "KG")).toBe("1.50 kg");
    expect(formatWeightToAdd(10, "LB")).toBe("0.4 oz");
    expect(formatWeightToAdd(null, "KG")).toBe("—");
  });
});

describe("volume input round-trip (U9, council C5)", () => {
  it('enter "500" gal → 1892.71 L canonical → hydrates back as "500"', () => {
    const liters = volumeInputToLiters("500", "GAL");
    expect(liters).toBe(1892.71);
    expect(volumeInputValue(liters, "GAL")).toBe("500");
  });
  it("dirty check: an untouched field returns the ORIGINAL litres byte-for-byte", () => {
    const original = { display: volumeInputValue(3785.41, "GAL"), liters: 3785.41 };
    expect(volumeInputToLiters(original.display, "GAL", original)).toBe(3785.41);
    // …but an edited value converts fresh
    expect(volumeInputToLiters("999", "GAL", original)).toBe(Math.round(999 * LITERS_PER_US_GALLON * 100) / 100);
  });
  it("litres pass through exactly; hL scales by 100", () => {
    expect(volumeInputToLiters("225", "L")).toBe(225);
    expect(volumeInputValue(225, "HL")).toBe("2.25");
    expect(volumeInputToLiters("2.25", "HL")).toBe(225);
  });
  it("empty and junk parse to null", () => {
    expect(volumeInputToLiters("", "GAL")).toBeNull();
    expect(volumeInputToLiters("abc", "L")).toBeNull();
    expect(volumeInputValue(null, "L")).toBe("");
  });
});

describe("write-side parsers are strict", () => {
  it("parseVolumeUnit accepts only the union", () => {
    expect(parseVolumeUnit("GAL")).toBe("GAL");
    expect(parseVolumeUnit("HL")).toBe("HL");
    expect(parseVolumeUnit("gal")).toBeNull();
    expect(parseVolumeUnit("")).toBeNull();
    expect(parseVolumeUnit(null)).toBeNull();
  });
});

describe("dimension → system bridges (one owner)", () => {
  it("temperature / precipitation / weight bridges follow their dimension", () => {
    expect(tempUnitSystem(DEFAULT_IMPERIAL_PREFS)).toBe("IMPERIAL");
    expect(tempUnitSystem(resolveUnitPrefs({ unitSystem: "IMPERIAL", unitTemperature: "C" }))).toBe("METRIC");
    expect(precipUnitSystem(DEFAULT_METRIC_PREFS)).toBe("METRIC");
    expect(weightLegacyUnit(DEFAULT_IMPERIAL_PREFS)).toBe("imperial");
  });
  it("weighOutSecondary: only gram totals for an LB tenant get the readout", () => {
    expect(weighOutSecondary(908, "g", "LB")).toBe(" (2.00 lb)");
    expect(weighOutSecondary(908, "g", "KG")).toBe("");
    expect(weighOutSecondary(908, "mL", "LB")).toBe("");
  });
});

describe("unitPrefsSentence — the assistant prompt line", () => {
  it("describes an imperial tenant", () => {
    expect(unitPrefsSentence(DEFAULT_IMPERIAL_PREFS)).toBe(
      "temperatures in °F, rainfall in inches, volumes in US gallons, areas in acres, lengths in feet, fruit weights in pounds and short tons",
    );
  });
});
