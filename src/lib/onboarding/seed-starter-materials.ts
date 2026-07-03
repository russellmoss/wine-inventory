import { runAsTenant } from "@/lib/tenant/context";
import { createStockMaterialCore } from "@/lib/cellar/materials";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { MaterialKind, RateBasis } from "@/lib/cellar/additions-math";
import type { StockUnit } from "@/lib/cellar/materials-shared";

// Phase 9.1 (Unit 1): a per-tenant STARTER material catalog so the addition/maintenance material
// picker always resolves on a fresh tenant (before this, a new org had an empty catalog and the
// operator couldn't issue an Addition of anything but ad-hoc SO₂). Each entry is stock-tracked +
// depletable (isStockTracked) so completing a work-order addition/sanitize draws it down; NO opening
// quantity is seeded (catalog only — the operator receives real stock via /setup/expendables). Idempotent
// on (kind, normalizedKey) inside createStockMaterialCore, so re-running or a double-firing onboarding
// hook is a no-op. Covers the generic-Addition families (yeast/MLF/SO₂/nutrient/acid/tannin/fining/
// bentonite/chitosan/enzyme + KHT for cold-stab seeding) AND the two overhead families
// (cleaning/sanitizer) consumed by the vessel-activity maintenance lane (Unit 3).

const SEED_ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@seed-starter-materials" };

export type StarterMaterial = {
  name: string;
  kind: MaterialKind;
  stockUnit: StockUnit;
  /** default dose basis for the picker; null for overhead chemicals that aren't dosed by rate. */
  defaultBasis: RateBasis | null;
};

/** The shipped starter catalog. Dosing materials carry a sensible default basis; cleaning/sanitizer are overhead (no basis). */
export const STARTER_MATERIALS: StarterMaterial[] = [
  { name: "Saccharomyces cerevisiae (EC-1118)", kind: "YEAST", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Oenococcus oeni (VP41)", kind: "MLF", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Potassium metabisulfite (KMBS)", kind: "SO2", stockUnit: "g", defaultBasis: "MG_L" },
  { name: "Diammonium phosphate (DAP)", kind: "NUTRIENT", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Tartaric acid", kind: "ACID", stockUnit: "g", defaultBasis: "G_L" },
  // Cold-stabilization seeding agent (dec 4c) — rides the generic Addition + Temperature-setpoint templates.
  { name: "Potassium bitartrate (KHT)", kind: "OTHER", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Oak tannin (FT Rouge)", kind: "TANNIN", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Gelatin (fining)", kind: "FINING", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Sodium bentonite", kind: "BENTONITE", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Chitosan", kind: "CHITOSAN", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Pectic enzyme (pectinase)", kind: "ENZYME", stockUnit: "g", defaultBasis: "G_HL" },
  { name: "Proxycarb (sodium percarbonate)", kind: "CLEANING", stockUnit: "g", defaultBasis: null },
  { name: "Peracetic acid (PAA)", kind: "SANITIZER", stockUnit: "mL", defaultBasis: null },
];

/**
 * Seed (idempotently) the starter material catalog into `tenantId`. Wraps the whole run in
 * `runAsTenant` so createStockMaterialCore's internal runInTenantTx resolves the right tenant (K12:
 * explicit tenant arg, never the ambient ALS). Safe to call from the demo-tenant seed path, the
 * onboarding afterCreateOrganization hook, and the standalone script — all converge on the same
 * find-or-create-by-(kind, normalizedKey). Returns the count actually created (new vs already-present
 * is invisible to the caller; the core is idempotent either way).
 */
export async function seedStarterMaterials(tenantId: string): Promise<{ seeded: number }> {
  if (!tenantId) throw new Error("seedStarterMaterials requires a tenantId.");
  return runAsTenant(tenantId, async () => {
    for (const m of STARTER_MATERIALS) {
      await createStockMaterialCore(SEED_ACTOR, {
        name: m.name,
        kind: m.kind,
        defaultBasis: m.defaultBasis,
        stockUnit: m.stockUnit,
        openingQty: null, // catalog + depletable; no fake opening stock
      });
    }
    return { seeded: STARTER_MATERIALS.length };
  });
}
