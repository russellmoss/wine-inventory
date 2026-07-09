import type { ParseDiagnostic } from "./types";

const VOLUME_FACTORS_TO_L = new Map<string, number>([
  ["l", 1],
  ["liter", 1],
  ["liters", 1],
  ["litre", 1],
  ["litres", 1],
  ["ml", 0.001],
  ["milliliter", 0.001],
  ["milliliters", 0.001],
  ["millilitre", 0.001],
  ["millilitres", 0.001],
  ["gal", 3.785411784],
  ["gallon", 3.785411784],
  ["gallons", 3.785411784],
  ["us gal", 3.785411784],
  ["us gallon", 3.785411784],
  ["us gallons", 3.785411784],
]);

export function roundLiters(n: number): number {
  return Math.round(n * 100) / 100;
}

export function normalizeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

export function convertVolumeToLiters(
  value: number,
  unit: string,
  subject: { subjectType: string; subjectKey: string; label: string },
): { ok: true; valueL: number } | { ok: false; diagnostic: ParseDiagnostic } {
  const normalized = normalizeUnit(unit);
  const factor = VOLUME_FACTORS_TO_L.get(normalized);
  if (factor == null) {
    const massOrBrix = ["kg", "g", "lb", "lbs", "brix", "deg brix", "°brix"].includes(normalized);
    return {
      ok: false,
      diagnostic: {
        kind: "PARSE_DIAGNOSTIC",
        subjectType: subject.subjectType,
        subjectKey: subject.subjectKey,
        label: subject.label,
        severity: "BLOCKER",
        message: massOrBrix
          ? `Source supplied ${unit}; mass/Brix is accepted as evidence but cannot seed a volume-folded vessel position.`
          : `Unknown volume unit: ${unit}.`,
        actualValue: value,
        unit,
      },
    };
  }
  return { ok: true, valueL: roundLiters(value * factor) };
}
