// Pure variety-color resolution. No Prisma, no I/O. Used by the map, the legend,
// the color pickers, AND server-side validation (isValidHex).
//
// The palette is the 8 editorial category hues defined in
// src/styles/tokens/colors.css (DESIGN.md), NOT a new invented palette. When a
// vineyard has more than 8 varieties we derive deterministic tints/shades of
// those 8 so the map stays on-brand.

export type PaletteEntry = { name: string; hex: string };

/** The 8 editorial category tokens, in token order (matches colors.css). */
export const PALETTE: readonly PaletteEntry[] = [
  { name: "maroon", hex: "#6B484D" },
  { name: "deep-green", hex: "#175242" },
  { name: "deep-blue", hex: "#095972" },
  { name: "golden-yellow", hex: "#D79F32" },
  { name: "lavender", hex: "#A98EB1" },
  { name: "red", hex: "#B63D35" },
  { name: "orange", hex: "#F19E70" },
  { name: "bright-mauve", hex: "#C06F74" },
] as const;

/** Neutral fallback for a block/polygon that has no variety to key off. */
export const FALLBACK_COLOR = "#6B6555"; // --ink-600, warm gray

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Validate a user/client-supplied hex color. Accepts #rgb or #rrggbb. */
export function isValidHex(s: unknown): s is string {
  return typeof s === "string" && HEX_RE.test(s.trim());
}

function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.trim().replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** A hex color as an `rgba(...)` string at the given alpha (0..1). Invalid → returned as-is. */
export function withAlpha(hex: string, alpha: number): string {
  if (!isValidHex(hex)) return hex;
  const { r, g, b } = parseHex(hex);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Mix a hex toward white (amount > 0) or black (amount < 0); amount in -1..1. */
function shift(hex: string, amount: number): string {
  const { r, g, b } = parseHex(hex);
  const target = amount < 0 ? 0 : 255;
  const p = Math.min(1, Math.abs(amount));
  return toHex(r + (target - r) * p, g + (target - g) * p, b + (target - b) * p);
}

/** Deterministic 32-bit FNV-1a hash of a string. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Deterministic default color for a variety, keyed on its STABLE id (never the
 * name) so renaming a variety can never shift its color. The first 8 distinct
 * ids land on the 8 base tokens; beyond that we cycle through lighter/darker
 * tiers of the same 8, all on-brand.
 */
export function defaultColorFor(varietyId: string | null | undefined): string {
  if (!varietyId) return FALLBACK_COLOR;
  const h = hashString(varietyId);
  const base = PALETTE[h % PALETTE.length].hex;
  const tier = Math.floor(h / PALETTE.length) % 3;
  if (tier === 1) return shift(base, 0.22); // lighter tint
  if (tier === 2) return shift(base, -0.22); // darker shade
  return base;
}

/**
 * Resolve the color a block's polygon should render in. Precedence:
 * block override -> variety canonical color -> deterministic default.
 * Invalid stored colors are ignored so a bad value can't poison the map.
 */
export function effectiveColor(opts: {
  blockColor?: string | null;
  varietyColor?: string | null;
  varietyId?: string | null;
}): string {
  const { blockColor, varietyColor, varietyId } = opts;
  if (isValidHex(blockColor)) return blockColor.trim();
  if (isValidHex(varietyColor)) return varietyColor.trim();
  return defaultColorFor(varietyId);
}
