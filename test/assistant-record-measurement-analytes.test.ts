import { describe, it, expect } from "vitest";
import { ANALYTES as ASSISTANT_ANALYTES, collectReadings } from "@/lib/assistant/tools/record-measurement";
import { validateMeasurement, isAnalyteKey, resolveAnalyteKey } from "@/lib/chemistry/analytes";

// collectReadings' param intersects an analyte index-signature with `other`, so a bare `{ other }`
// literal doesn't structurally assign (the real caller in run() passes it via an `as` cast too).
type CRInput = Parameters<typeof collectReadings>[0];

// Regression for the "Unknown analyte 'Brix'" write failure: the assistant tool must emit chemistry
// REGISTRY KEYS (PH/BRIX/FREE_SO2, …) + each analyte's default unit, because the write path validates
// strictly (validateMeasurement → ANALYTES[key] + units.includes(unit)). Display labels like "Brix"
// or loose units like "g/L" are rejected. This locks every mapped analyte to a valid registry entry.

describe("assistant record_measurement → chemistry registry mapping", () => {
  it("every mapped analyte is a registry KEY with a valid unit that passes validation", () => {
    for (const [field, def] of Object.entries(ASSISTANT_ANALYTES)) {
      expect(isAnalyteKey(def.analyte), `${field} → "${def.analyte}" must be a registry key`).toBe(true);
      // 3 is inside the sanity range of every mapped analyte, so this isolates key + unit correctness.
      const res = validateMeasurement(def.analyte, 3, def.unit);
      expect(res.ok, `${field} (${def.analyte}, "${def.unit}"): ${JSON.stringify(res)}`).toBe(true);
    }
  });

  it("collectReadings({ brix: 9 }) emits the BRIX key + °Bx and validates (the reported bug)", () => {
    const readings = collectReadings({ brix: 9 });
    expect(readings).toEqual([{ analyte: "BRIX", value: 9, unit: "°Bx" }]);
    expect(validateMeasurement("BRIX", 9, "°Bx").ok).toBe(true);
  });

  it("collectReadings maps multiple named analytes to their registry keys", () => {
    const readings = collectReadings({ pH: 3.4, freeSO2: 28, brix: 12 });
    const byKey = Object.fromEntries(readings.map((r) => [r.analyte, r]));
    expect(byKey.PH).toEqual({ analyte: "PH", value: 3.4, unit: "pH" });
    expect(byKey.FREE_SO2).toEqual({ analyte: "FREE_SO2", value: 28, unit: "mg/L" });
    expect(byKey.BRIX).toEqual({ analyte: "BRIX", value: 12, unit: "°Bx" });
  });

  it("temperature is a first-class field: collectReadings({ temp: 22 }) → TEMP/°C and validates", () => {
    const readings = collectReadings({ temp: 22 });
    expect(readings).toEqual([{ analyte: "TEMP", value: 22, unit: "°C" }]);
    expect(validateMeasurement("TEMP", 22, "°C").ok).toBe(true);
  });

  it("free-form `other` analytes resolve to registry keys (the reported 'Temperature' bug)", () => {
    const readings = collectReadings({ other: [{ analyte: "Temperature", value: 22, unit: "°C" }] } as unknown as CRInput);
    expect(readings).toEqual([{ analyte: "TEMP", value: 22, unit: "°C" }]);
    expect(validateMeasurement("TEMP", 22, "°C").ok).toBe(true);
  });

  it("free-form `other` with a missing/invalid unit falls back to the registry default unit", () => {
    const readings = collectReadings({ other: [{ analyte: "specific gravity", value: 1.01 }] } as unknown as CRInput);
    // "specific gravity" → label match → SG; no unit provided → SG defaultUnit "SG"
    expect(readings).toEqual([{ analyte: "SG", value: 1.01, unit: "SG" }]);
  });
});

describe("resolveAnalyteKey", () => {
  it("resolves exact keys, cased keys, and display labels to the canonical key", () => {
    expect(resolveAnalyteKey("BRIX")).toBe("BRIX");
    expect(resolveAnalyteKey("brix")).toBe("BRIX");
    expect(resolveAnalyteKey("temp")).toBe("TEMP");
    expect(resolveAnalyteKey("Temperature")).toBe("TEMP");
    expect(resolveAnalyteKey("Free SO₂")).toBe("FREE_SO2");
    expect(resolveAnalyteKey("SG")).toBe("SG");
  });
  it("returns null for a name not in the registry", () => {
    expect(resolveAnalyteKey("unobtanium")).toBeNull();
    expect(resolveAnalyteKey("")).toBeNull();
  });
});
