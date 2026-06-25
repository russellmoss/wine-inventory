// Parse a free-text vessel reference like "barrel 14" or "tank T1" into a
// { type, code } pair. Pure (no server imports) so it's unit-testable and usable
// from the assistant tool. Returns null when no vessel type keyword is present.

export type VesselRef = { type: "BARREL" | "TANK"; code: string };

const TYPE_WORDS: Record<string, "BARREL" | "TANK"> = {
  barrel: "BARREL",
  barrels: "BARREL",
  bbl: "BARREL",
  brl: "BARREL",
  tank: "TANK",
  tanks: "TANK",
  vat: "TANK",
};

export function parseVesselRef(text: string): VesselRef | null {
  if (typeof text !== "string") return null;
  const m = text
    .trim()
    .match(/^(barrel|barrels|bbl|brl|tank|tanks|vat)\b[\s#:]*(?:no\.?|number)?\s*(.+?)\s*$/i);
  if (!m) return null;
  const type = TYPE_WORDS[m[1].toLowerCase()];
  const code = m[2].replace(/^#+\s*/, "").trim();
  if (!type || !code) return null;
  return { type, code };
}
