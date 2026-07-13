import { describe, it, expect } from "vitest";
import { ANALYTES as ASSISTANT_ANALYTES, collectReadings } from "@/lib/assistant/tools/record-measurement";
import { validateMeasurement, isAnalyteKey } from "@/lib/chemistry/analytes";

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
});
