import type { MaterialKind, RateBasis } from "@/lib/cellar/additions-math";

// Client-safe shared types + constants for the CellarMaterial catalog. NO prisma / tenant /
// server imports live here so 'use client' components (MaterialPicker, the expendables page)
// can import the DTO shape + the stock-unit vocabulary WITHOUT dragging the server data layer
// (prisma → node:async_hooks, argon2) into the client bundle. The server data functions stay
// in materials.ts, which re-exports these for its own call sites.

export type CellarMaterialDTO = {
  id: string;
  /** Canonical identity/snapshot label. UI should render `materialDisplayName(dto)` instead. */
  name: string;
  kind: MaterialKind;
  /** Phase 034: dormant user-defined subcategory (retired from UI in Phase 036; family = kind). */
  subcategory: string | null;
  // Phase 036: stored main category (cost-safety authority) + brand/generic display metadata + purchase record.
  category: string | null;
  genericName: string | null;
  brand: string | null;
  brandName: string | null;
  preferGeneric: boolean;
  vendor: string | null; // LEGACY free-text (mirrored from the vendor; Plan 069)
  vendorUrl: string | null; // LEGACY free-text
  /** Plan 069: the managed vendor (source of truth). Resolve display via the vendor list. */
  vendorId: string | null;
  packageAmount: number | null;
  packageUnit: string | null;
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
  /** Phase 037: weighted-average cost per stock unit across open lots (D14: null when unknown, never $0). */
  avgUnitCost?: number | null;
  /** Phase 037.1: true when the item has exactly one fully-unused opening lot, so its cost can be set/corrected
   * in the Edit modal (cost-safe). False once stock is received/split/partly-used — then correct via Receive. */
  costCorrectable?: boolean;
  /** Phase 037.1: total price of that correctable opening lot (for the Edit modal prefill); null if unknown/N-A. */
  openingLotCost?: number | null;
};

/**
 * Phase 036: the name to SHOW for a material. `preferGeneric` picks the generic label ("Bentonite");
 * otherwise the brand/product name wins, each falling back through generic → the canonical `name`.
 * Pure + client-safe. Use everywhere a material name renders (lists, pickers, dose snapshot).
 */
export function materialDisplayName(m: { name: string; genericName?: string | null; brandName?: string | null; preferGeneric?: boolean | null }): string {
  const generic = (m.genericName ?? "").trim();
  const brand = (m.brandName ?? "").trim();
  return m.preferGeneric ? (generic || brand || m.name) : (brand || generic || m.name);
}

// Phase 8 (Unit 10): canonical stock units a material's on-hand is held/consumed in.
export const STOCK_UNITS = ["g", "mg", "kg", "mL", "L", "unit"] as const;
export type StockUnit = (typeof STOCK_UNITS)[number];
export function coerceStockUnit(u: string | null | undefined): StockUnit {
  return (STOCK_UNITS as readonly string[]).includes((u ?? "").trim()) ? ((u as string).trim() as StockUnit) : "g";
}
