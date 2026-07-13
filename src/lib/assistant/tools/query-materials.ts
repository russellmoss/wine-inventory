import "server-only";
import type { AssistantTool } from "../registry";
import { listMaterials } from "@/lib/cellar/materials";
import { materialDisplayName, type CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import {
  CATEGORY_LABELS,
  coerceFamily,
  familyLabel,
  type MaterialCategory,
} from "@/lib/cellar/material-taxonomy";

// Read the expendables/materials catalog with on-hand stock. Wraps listMaterials (which already
// aggregates on-hand across open SupplyLots + weighted-average cost, tenant-scoped via RLS + the
// Prisma extension). This is the READ counterpart to the create_material / receive_supply /
// adjust_inventory write tools — it answers "what supplies do we have", "how much DAP is left",
// "what cleaning products are in the catalog", and "what are we out of".

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

type Input = {
  search?: string;
  kind?: string;
  category?: MaterialCategory;
  includeInactive: boolean;
  stockTrackedOnly: boolean;
  outOfStockOnly: boolean;
  limit: number;
};

const CATEGORIES = ["ADDITIVE", "CLEANING_SANITIZING", "PACKAGING", "OTHER"] as const;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(value: unknown): boolean {
  return value === true;
}

function num(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function normalize(raw: unknown): Input {
  const r = (raw ?? {}) as Record<string, unknown>;
  const category = str(r.category)?.toUpperCase();
  const limit = num(r.limit);
  return {
    search: str(r.search),
    kind: str(r.kind),
    category: (CATEGORIES as readonly string[]).includes(category ?? "") ? (category as MaterialCategory) : undefined,
    includeInactive: bool(r.includeInactive),
    stockTrackedOnly: bool(r.stockTrackedOnly),
    outOfStockOnly: bool(r.outOfStockOnly),
    limit: limit != null && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function matchesSearch(m: CellarMaterialDTO, needle: string): boolean {
  const haystacks = [materialDisplayName(m), m.name, m.genericName, m.brandName, m.brand]
    .filter(Boolean)
    .map((x) => norm(String(x)));
  return haystacks.some((h) => h !== "" && (h.includes(needle) || needle.includes(h)));
}

function stockStatus(m: CellarMaterialDTO): "in stock" | "out of stock" | "not tracked" {
  if (!m.isStockTracked) return "not tracked";
  return (m.onHand ?? 0) > 0 ? "in stock" : "out of stock";
}

export const queryMaterialsTool: AssistantTool = {
  name: "query_materials",
  description:
    "Read the expendables/materials catalog and on-hand stock. Use for questions like 'what supplies do we have', " +
    "'how much DAP / bentonite / SO2 is left', 'what's our on-hand quantity of yeast', 'list our cleaning and " +
    "sanitizing products', 'what packaging materials are in the catalog', or 'what expendables are we out of'. " +
    "Returns catalog items with their family, category, on-hand quantity (summed remaining across open supply lots, " +
    "in the item's stock unit), weighted-average unit cost, vendor, and active flag. On-hand is null for items that " +
    "aren't stock-tracked. This is read-only — to receive stock use receive_supply, to correct a balance use " +
    "adjust_inventory, to add a new catalog item use create_material.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      search: {
        type: "string",
        description:
          "Optional free-text name to find one material or a family of matches (matches the display name, generic name, or brand). E.g. 'DAP', 'bentonite', 'Lallzyme'.",
      },
      kind: {
        type: "string",
        description:
          "Optional family filter. Built-ins: YEAST, MLF, SO2, NUTRIENT, ACID, SUGAR, TANNIN, FINING, BENTONITE, CHITOSAN, ENZYME, CLEANING, SANITIZER, PACKAGING, OTHER. A winery may also define custom families; pass the family name.",
      },
      category: {
        type: "string",
        enum: ["ADDITIVE", "CLEANING_SANITIZING", "PACKAGING", "OTHER"],
        description:
          "Optional main-category filter. ADDITIVE = things dosed into wine; CLEANING_SANITIZING = cleaning/sanitizing supplies; PACKAGING = dry goods (glass, corks, capsules, labels, cases); OTHER = everything else.",
      },
      includeInactive: {
        type: "boolean",
        description: "Include deactivated (archived) catalog items. Defaults false (active only).",
      },
      stockTrackedOnly: {
        type: "boolean",
        description: "Return only items that track physical stock (have an on-hand quantity). Defaults false.",
      },
      outOfStockOnly: {
        type: "boolean",
        description: "Return only stock-tracked items with zero on-hand — 'what are we out of'. Defaults false.",
      },
      limit: { type: "number", description: `Maximum items to return (default ${DEFAULT_LIMIT}, capped at ${MAX_LIMIT}).` },
    },
  },
  async run(_ctx, rawInput) {
    const input = normalize(rawInput);
    const all = await listMaterials({
      kind: input.kind ? (coerceFamily(input.kind) as never) : undefined,
      category: input.category,
      includeInactive: input.includeInactive,
    });

    const needle = input.search ? norm(input.search) : null;
    const filtered = all.filter((m) => {
      if (needle && !matchesSearch(m, needle)) return false;
      if (input.stockTrackedOnly && !m.isStockTracked) return false;
      if (input.outOfStockOnly && !(m.isStockTracked && (m.onHand ?? 0) <= 0)) return false;
      return true;
    });

    const totalMatched = filtered.length;
    const materials = filtered.slice(0, input.limit).map((m) => ({
      id: m.id,
      name: materialDisplayName(m),
      family: familyLabel(m.kind),
      category: m.category,
      categoryLabel: m.category ? CATEGORY_LABELS[m.category as MaterialCategory] ?? m.category : null,
      onHand: m.onHand ?? null,
      stockUnit: m.stockUnit ?? null,
      isStockTracked: !!m.isStockTracked,
      stockStatus: stockStatus(m),
      avgUnitCost: m.avgUnitCost ?? null,
      vendor: m.vendor ?? null,
      isActive: m.isActive !== false,
    }));

    return {
      count: materials.length,
      totalMatched,
      truncated: totalMatched > materials.length,
      materials,
      note:
        "On-hand is the summed remaining quantity across open supply lots, in each item's stock unit; items that aren't stock-tracked show onHand null (stockStatus 'not tracked'). avgUnitCost is a weighted average across open lots and is null when cost is unknown.",
    };
  },
};
