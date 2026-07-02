import type { MaterialKind, RateBasis } from "@/lib/cellar/additions-math";

// Client-safe shared types + constants for the CellarMaterial catalog. NO prisma / tenant /
// server imports live here so 'use client' components (MaterialPicker, the expendables page)
// can import the DTO shape + the stock-unit vocabulary WITHOUT dragging the server data layer
// (prisma → node:async_hooks, argon2) into the client bundle. The server data functions stay
// in materials.ts, which re-exports these for its own call sites.

export type CellarMaterialDTO = {
  id: string;
  name: string;
  kind: MaterialKind;
  defaultBasis: RateBasis | null;
  percentActive: number | null;
  // Phase 8 (Unit 10): stock awareness for the picker. `isStockTracked` opts the material into
  // draw-down; `onHand` is the summed remaining stock across its open SupplyLots (null when
  // untracked); `stockUnit` is the unit that on-hand is held in. Optional so pre-Phase-8 consumers
  // that don't render the picker are unaffected.
  isStockTracked?: boolean;
  onHand?: number | null;
  stockUnit?: string | null;
  /** Phase 8 (Unit 12): surfaced on the management page so an inactive supply can be reactivated. */
  isActive?: boolean;
};

// Phase 8 (Unit 10): canonical stock units a material's on-hand is held/consumed in.
export const STOCK_UNITS = ["g", "mg", "kg", "mL", "L", "unit"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];
export function coerceStockUnit(u: string | null | undefined): StockUnit {
  return (STOCK_UNITS as readonly string[]).includes((u ?? "").trim()) ? ((u as string).trim() as StockUnit) : "g";
}
