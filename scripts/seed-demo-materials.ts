/**
 * Seed a RICH, categorized material catalog into the Demo Winery sandbox tenant so the Phase-034
 * taxonomy (main category → customizable subcategory) + the filtered/fuzzy additions picker are visible
 * in action. Unlike the shipped `seed:starter-materials` (flat kinds, no subcategory), this fills out:
 *   - ADDITIVE with many custom subcategories (yeast strains, fining agents, tannins, acids, sugar,
 *     nutrients, enzymes) so the picker shows several filter chips + fuzzy search has something to match,
 *   - CLEANING & SANITIZING (overhead) with subcategories,
 *   - PACKAGING (the new category) with Corks / Capsules / Bottles / Labels.
 * Most rows carry opening stock + a unit cost so on-hand shows next to each option in the picker.
 *
 *   npm run seed:demo-materials      (requires `npm run seed:demo-tenant` first)
 *
 * Idempotent: createStockMaterialCore find-or-creates by (kind, normalizedKey) and backfills a missing
 * subcategory, so re-running is safe. Demo Winery ONLY — never touches Bhutan Wine Co.
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { createStockMaterialCore } from "@/lib/cellar/materials";
import { categoryOf, familyLabel, CATEGORY_LABELS } from "@/lib/cellar/material-taxonomy";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { RateBasis } from "@/lib/cellar/additions-math";
import type { StockUnit } from "@/lib/cellar/materials-shared";
import { disconnectSystem } from "../src/lib/tenant/system";

const DEMO_ORG_ID = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@seed-demo-materials" };

type Row = {
  name?: string; // legacy: identity/display when no generic/brand given
  kind: string; // family (built-in code or a custom family name)
  subcategory?: string; // dormant (Phase 036 retired the fine-grained level; grouping is by family)
  category?: string; // stored main category; omit for built-in kinds (falls back to categoryOf)
  stockUnit: StockUnit;
  defaultBasis?: RateBasis | null;
  openingQty?: number; // seeds a costed SupplyLot so on-hand shows in the picker
  unitCost?: number;
  // Phase 036 intake fields
  genericName?: string;
  brand?: string;
  brandName?: string;
  preferGeneric?: boolean;
  vendor?: string;
  vendorUrl?: string;
  packageAmount?: number; // with packageUnit + totalCost → derives the opening lot (imperial ok)
  packageUnit?: string;
  totalCost?: number;
};

const CATALOG: Row[] = [
  // ── ADDITIVES ─────────────────────────────────────────────────────────────
  // Yeast — brand names shown (preferGeneric:false); a purchase in lb shows imperial cost-per-measure.
  { kind: "YEAST", genericName: "Wine Yeast", brand: "Lallemand", brandName: "Lalvin EC-1118", preferGeneric: false, vendor: "Scott Labs", vendorUrl: "https://scottlab.com", stockUnit: "g", defaultBasis: "G_HL", packageAmount: 1, packageUnit: "lb", totalCost: 54 },
  { kind: "YEAST", genericName: "Wine Yeast", brand: "Lallemand", brandName: "Lalvin RC-212", preferGeneric: false, vendor: "Scott Labs", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.14 },
  { kind: "YEAST", genericName: "Wine Yeast", brand: "Lallemand", brandName: "Lalvin QA23", preferGeneric: false, vendor: "Scott Labs", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.13 },
  // Bacteria — no custom subcategory → falls back to the built-in "Bacteria (MLF)" chip
  { name: "Viniflora Oenos (MLF)", kind: "MLF", stockUnit: "g", defaultBasis: "G_HL", openingQty: 250, unitCost: 0.30 },
  // SO2
  { name: "Potassium Metabisulfite (KMBS)", kind: "SO2", stockUnit: "g", defaultBasis: "MG_L", openingQty: 2000, unitCost: 0.02 },
  // Nutrients — Organic vs Complex
  { name: "Fermaid O", kind: "NUTRIENT", subcategory: "Organic", stockUnit: "g", defaultBasis: "G_HL", openingQty: 1000, unitCost: 0.05 },
  { name: "Fermaid K", kind: "NUTRIENT", subcategory: "Complex", stockUnit: "g", defaultBasis: "G_HL", openingQty: 1000, unitCost: 0.06 },
  // Acids
  { name: "Tartaric Acid", kind: "ACID", subcategory: "Tartaric", stockUnit: "g", defaultBasis: "G_L", openingQty: 5000, unitCost: 0.01 },
  { name: "Malic Acid", kind: "ACID", subcategory: "Malic", stockUnit: "g", defaultBasis: "G_L", openingQty: 2000, unitCost: 0.03 },
  // Sugar (new kind) — chaptalization vs concentrate
  { name: "Cane Sugar", kind: "SUGAR", subcategory: "Chaptalization", stockUnit: "kg", defaultBasis: "G_L", openingQty: 50, unitCost: 1.20 },
  { name: "RCGJ (grape concentrate)", kind: "SUGAR", subcategory: "Concentrate", stockUnit: "L", defaultBasis: "ML_L", openingQty: 20, unitCost: 4.50 },
  // Tannins — Oak vs Grape/Skin
  { name: "Oak Tannin (FT Rouge)", kind: "TANNIN", subcategory: "Oak", stockUnit: "g", defaultBasis: "G_HL", openingQty: 800, unitCost: 0.09 },
  { name: "Grape Tannin (VR Supra)", kind: "TANNIN", subcategory: "Grape / Skin", stockUnit: "g", defaultBasis: "G_HL", openingQty: 800, unitCost: 0.11 },
  // Fining agents — several distinct custom subcategories (the headline demo of custom grouping)
  { name: "Egg White (albumen)", kind: "FINING", subcategory: "Egg White", stockUnit: "g", defaultBasis: "G_HL", openingQty: 300, unitCost: 0.20 },
  { name: "Isinglass", kind: "FINING", subcategory: "Isinglass", stockUnit: "g", defaultBasis: "G_HL", openingQty: 200, unitCost: 0.40 },
  { name: "Gelatin (fining)", kind: "FINING", subcategory: "Gelatin", stockUnit: "g", defaultBasis: "G_HL", openingQty: 300, unitCost: 0.15 },
  { name: "Pea Protein (vegan)", kind: "FINING", subcategory: "Vegan", stockUnit: "g", defaultBasis: "G_HL", openingQty: 300, unitCost: 0.25 },
  // Bentonite — generic name shown (preferGeneric:true); a 50 lb bag shows imperial → g cost-per-measure.
  { kind: "BENTONITE", genericName: "Bentonite", brand: "Scott", brandName: "KWK Granular", preferGeneric: true, vendor: "Scott Labs", stockUnit: "g", defaultBasis: "G_HL", packageAmount: 50, packageUnit: "lb", totalCost: 120 },
  // A CUSTOM family (not a built-in): shows "+ add family" in action, grouped under its own chip.
  { kind: "Sur Lie Aid", category: "ADDITIVE", genericName: "Mannoprotein", stockUnit: "g", defaultBasis: "G_HL", openingQty: 300, unitCost: 0.55 },
  { name: "Chitosan (fungal)", kind: "CHITOSAN", subcategory: "Anti-Brett", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.35 },
  // Enzymes
  { name: "Pectinase (Lallzyme EX)", kind: "ENZYME", subcategory: "Pectic", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.28 },
  { name: "Lysozyme", kind: "ENZYME", subcategory: "Antimicrobial", stockUnit: "g", defaultBasis: "G_HL", openingQty: 200, unitCost: 0.60 },

  // ── CLEANING & SANITIZING (overhead — never wine COGS) ────────────────────
  { name: "Proxycarb (sodium percarbonate)", kind: "CLEANING", subcategory: "Alkaline", stockUnit: "g", defaultBasis: null, openingQty: 10000, unitCost: 0.006 },
  { name: "Citric Acid Cleaner", kind: "CLEANING", subcategory: "Acid Wash", stockUnit: "g", defaultBasis: null, openingQty: 5000, unitCost: 0.008 },
  // A gallon drum — imperial volume → mL cost-per-measure.
  { name: "Peracetic Acid (PAA)", kind: "SANITIZER", stockUnit: "mL", defaultBasis: null, vendor: "BevChem", packageAmount: 5, packageUnit: "gal", totalCost: 95 },
  { name: "Star San", kind: "SANITIZER", subcategory: "Acid Anionic", stockUnit: "mL", defaultBasis: null, openingQty: 2000, unitCost: 0.02 },

  // ── PACKAGING (the new category — never dosed into wine) ──────────────────
  { name: "Natural Cork 44x24", kind: "PACKAGING", subcategory: "Corks", stockUnit: "unit", defaultBasis: null, openingQty: 5000, unitCost: 0.35 },
  { name: "DIAM 30 Cork", kind: "PACKAGING", subcategory: "Corks", stockUnit: "unit", defaultBasis: null, openingQty: 5000, unitCost: 0.45 },
  { name: "Tin Capsule — Burgundy Green", kind: "PACKAGING", subcategory: "Capsules", stockUnit: "unit", defaultBasis: null, openingQty: 6000, unitCost: 0.08 },
  { name: "750ml Bordeaux Bottle (Antique Green)", kind: "PACKAGING", subcategory: "Bottles", stockUnit: "unit", defaultBasis: null, openingQty: 6000, unitCost: 0.90 },
  { name: "750ml Burgundy Bottle (Dead Leaf)", kind: "PACKAGING", subcategory: "Bottles", stockUnit: "unit", defaultBasis: null, openingQty: 3000, unitCost: 0.95 },
  { name: "Front Label — Estate", kind: "PACKAGING", subcategory: "Labels", stockUnit: "unit", defaultBasis: null, openingQty: 10000, unitCost: 0.06 },
  { name: "Back Label — Estate", kind: "PACKAGING", subcategory: "Labels", stockUnit: "unit", defaultBasis: null, openingQty: 10000, unitCost: 0.05 },
];

async function main() {
  await runAsTenant(DEMO_ORG_ID, async () => {
    for (const r of CATALOG) {
      await createStockMaterialCore(ACTOR, {
        name: r.name,
        kind: r.kind,
        category: r.category,
        subcategory: r.subcategory,
        genericName: r.genericName,
        brand: r.brand,
        brandName: r.brandName,
        preferGeneric: r.preferGeneric,
        vendor: r.vendor,
        vendorUrl: r.vendorUrl,
        stockUnit: r.stockUnit,
        defaultBasis: r.defaultBasis ?? undefined,
        openingQty: r.openingQty ?? null,
        unitCost: r.unitCost ?? null,
        packageAmount: r.packageAmount,
        packageUnit: r.packageUnit,
        totalCost: r.totalCost,
      });
    }
  });

  // Summarize what a user will now see: grouped by main category → family (the filter-chip dimension).
  const grouped = new Map<string, Map<string, string[]>>();
  for (const r of CATALOG) {
    const cat = CATEGORY_LABELS[(r.category as keyof typeof CATEGORY_LABELS) ?? categoryOf(r.kind)];
    const fam = familyLabel(r.kind);
    const shown = r.preferGeneric ? (r.genericName ?? r.brandName ?? r.name ?? "") : (r.brandName ?? r.genericName ?? r.name ?? "");
    if (!grouped.has(cat)) grouped.set(cat, new Map());
    const fams = grouped.get(cat)!;
    if (!fams.has(fam)) fams.set(fam, []);
    fams.get(fam)!.push(shown);
  }
  for (const [cat, fams] of grouped) {
    console.log(`\n${cat}`);
    for (const [fam, names] of fams) console.log(`  • ${fam}: ${names.join(", ")}`);
  }
  console.log(`\nDemo material catalog seeded ✓ (${CATALOG.length} items). Open /setup/expendables (Add expendable) or issue an Addition work order to see categories, family chips, fuzzy search, brand/generic display, and imperial cost-per-measure.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await disconnectSystem();
  });
