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
import { categoryOf, effectiveSubcategory, CATEGORY_LABELS } from "@/lib/cellar/material-taxonomy";
import type { LedgerActor } from "@/lib/vessels/rack-core";
import type { MaterialKind, RateBasis } from "@/lib/cellar/additions-math";
import type { StockUnit } from "@/lib/cellar/materials-shared";
import { disconnectSystem } from "../src/lib/tenant/system";

const DEMO_ORG_ID = "org_demo_winery";
const ACTOR: LedgerActor = { actorUserId: null, actorEmail: "system@seed-demo-materials" };

type Row = {
  name: string;
  kind: MaterialKind;
  subcategory?: string; // custom subcategory; omit to fall back to the built-in kind label
  stockUnit: StockUnit;
  defaultBasis?: RateBasis | null;
  openingQty?: number; // seeds a costed SupplyLot so on-hand shows in the picker
  unitCost?: number;
};

const CATALOG: Row[] = [
  // ── ADDITIVES ─────────────────────────────────────────────────────────────
  // Yeast — custom subcategories by ferment style (shows custom grouping within one kind)
  { name: "Lalvin EC-1118", kind: "YEAST", subcategory: "Sparkling / Neutral", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.12 },
  { name: "Lalvin RC-212", kind: "YEAST", subcategory: "Red", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.14 },
  { name: "Lalvin QA23", kind: "YEAST", subcategory: "White / Aromatic", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.13 },
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
  // Bentonite / Chitosan
  { name: "Sodium Bentonite", kind: "BENTONITE", stockUnit: "g", defaultBasis: "G_HL", openingQty: 4000, unitCost: 0.01 },
  { name: "Chitosan (fungal)", kind: "CHITOSAN", subcategory: "Anti-Brett", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.35 },
  // Enzymes
  { name: "Pectinase (Lallzyme EX)", kind: "ENZYME", subcategory: "Pectic", stockUnit: "g", defaultBasis: "G_HL", openingQty: 500, unitCost: 0.28 },
  { name: "Lysozyme", kind: "ENZYME", subcategory: "Antimicrobial", stockUnit: "g", defaultBasis: "G_HL", openingQty: 200, unitCost: 0.60 },

  // ── CLEANING & SANITIZING (overhead — never wine COGS) ────────────────────
  { name: "Proxycarb (sodium percarbonate)", kind: "CLEANING", subcategory: "Alkaline", stockUnit: "g", defaultBasis: null, openingQty: 10000, unitCost: 0.006 },
  { name: "Citric Acid Cleaner", kind: "CLEANING", subcategory: "Acid Wash", stockUnit: "g", defaultBasis: null, openingQty: 5000, unitCost: 0.008 },
  { name: "Peracetic Acid (PAA)", kind: "SANITIZER", subcategory: "PAA", stockUnit: "mL", defaultBasis: null, openingQty: 4000, unitCost: 0.01 },
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
        subcategory: r.subcategory,
        stockUnit: r.stockUnit,
        defaultBasis: r.defaultBasis ?? undefined,
        openingQty: r.openingQty ?? null,
        unitCost: r.unitCost ?? null,
      });
    }
  });

  // Summarize what a user will now see: grouped by main category → effective subcategory.
  const grouped = new Map<string, Map<string, string[]>>();
  for (const r of CATALOG) {
    const cat = CATEGORY_LABELS[categoryOf(r.kind)];
    const sub = effectiveSubcategory(r);
    if (!grouped.has(cat)) grouped.set(cat, new Map());
    const subs = grouped.get(cat)!;
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub)!.push(r.name);
  }
  for (const [cat, subs] of grouped) {
    console.log(`\n${cat}`);
    for (const [sub, names] of subs) console.log(`  • ${sub}: ${names.join(", ")}`);
  }
  console.log(`\nDemo material catalog seeded ✓ (${CATALOG.length} items). Open /setup/expendables or issue an Addition work order to see the categories, subcategory filter chips, and fuzzy search.`);
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
