import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";

const mocks = vi.hoisted(() => ({ listMaterials: vi.fn() }));

vi.mock("@/lib/cellar/materials", () => ({ listMaterials: mocks.listMaterials }));

import { queryMaterialsTool } from "@/lib/assistant/tools/query-materials";
import { getToolsFor } from "@/lib/assistant/registry";

const material = (over: Partial<CellarMaterialDTO> = {}): CellarMaterialDTO => ({
  id: over.id ?? "m1",
  name: over.name ?? "Material",
  kind: over.kind ?? ("NUTRIENT" as CellarMaterialDTO["kind"]),
  subcategory: null,
  category: over.category ?? "ADDITIVE",
  genericName: over.genericName ?? null,
  brand: null,
  brandName: over.brandName ?? null,
  preferGeneric: false,
  vendor: over.vendor ?? null,
  vendorUrl: null,
  vendorId: null,
  packageAmount: null,
  packageUnit: null,
  defaultBasis: null,
  percentActive: null,
  isStockTracked: over.isStockTracked,
  onHand: over.onHand,
  stockUnit: over.stockUnit,
  isActive: over.isActive,
  avgUnitCost: over.avgUnitCost,
});

const CTX = { user: { role: "user" } } as never;

beforeEach(() => vi.clearAllMocks());

describe("query_materials tool", () => {
  it("is a read tool visible to non-admin staff and registered", () => {
    expect(queryMaterialsTool.kind).toBe("read");
    expect(queryMaterialsTool.adminOnly).toBeFalsy();
    const names = getToolsFor({ role: "user" } as never).map((t) => t.name);
    expect(names).toContain("query_materials");
  });

  it("passes kind (coerced), category, and includeInactive through to listMaterials", async () => {
    mocks.listMaterials.mockResolvedValue([]);
    await queryMaterialsTool.run(CTX, { kind: "Yeast", category: "packaging", includeInactive: true });
    expect(mocks.listMaterials).toHaveBeenCalledWith({
      kind: "YEAST", // coerceFamily maps the label back to the canonical code
      category: "PACKAGING", // upper-cased + validated
      includeInactive: true,
    });
  });

  it("drops an invalid category rather than passing garbage to the query", async () => {
    mocks.listMaterials.mockResolvedValue([]);
    await queryMaterialsTool.run(CTX, { category: "NONSENSE" });
    expect(mocks.listMaterials).toHaveBeenCalledWith({ kind: undefined, category: undefined, includeInactive: false });
  });

  it("shapes on-hand + stock status, and labels untracked items as not tracked", async () => {
    mocks.listMaterials.mockResolvedValue([
      material({ id: "dap", genericName: "DAP", isStockTracked: true, onHand: 1200, stockUnit: "g", avgUnitCost: 0.01, vendor: "Scott Labs" }),
      material({ id: "so2", genericName: "SO2", isStockTracked: true, onHand: 0, stockUnit: "g" }),
      material({ id: "misc", name: "Generic thing", isStockTracked: false, onHand: null, stockUnit: null }),
    ]);
    const res = (await queryMaterialsTool.run(CTX, {})) as { count: number; materials: Array<Record<string, unknown>> };
    expect(res.count).toBe(3);
    const byId = Object.fromEntries(res.materials.map((m) => [m.id, m]));
    expect(byId.dap).toMatchObject({ name: "DAP", onHand: 1200, stockUnit: "g", stockStatus: "in stock", vendor: "Scott Labs" });
    expect(byId.so2).toMatchObject({ onHand: 0, stockStatus: "out of stock" });
    expect(byId.misc).toMatchObject({ onHand: null, isStockTracked: false, stockStatus: "not tracked" });
  });

  it("filters by free-text search against display/generic/brand names", async () => {
    mocks.listMaterials.mockResolvedValue([
      material({ id: "dap", genericName: "DAP" }),
      material({ id: "fermaid", brandName: "Fermaid O" }),
    ]);
    const res = (await queryMaterialsTool.run(CTX, { search: "fermaid" })) as { count: number; materials: Array<{ id: string }> };
    expect(res.count).toBe(1);
    expect(res.materials[0].id).toBe("fermaid");
  });

  it("outOfStockOnly keeps only tracked items at zero on-hand (never untracked ones)", async () => {
    mocks.listMaterials.mockResolvedValue([
      material({ id: "empty", isStockTracked: true, onHand: 0, stockUnit: "g" }),
      material({ id: "full", isStockTracked: true, onHand: 5, stockUnit: "kg" }),
      material({ id: "untracked", isStockTracked: false, onHand: null }),
    ]);
    const res = (await queryMaterialsTool.run(CTX, { outOfStockOnly: true })) as { materials: Array<{ id: string }> };
    expect(res.materials.map((m) => m.id)).toEqual(["empty"]);
  });

  it("honors limit and reports truncation", async () => {
    mocks.listMaterials.mockResolvedValue(Array.from({ length: 5 }, (_, i) => material({ id: `m${i}` })));
    const res = (await queryMaterialsTool.run(CTX, { limit: 2 })) as { count: number; totalMatched: number; truncated: boolean };
    expect(res.count).toBe(2);
    expect(res.totalMatched).toBe(5);
    expect(res.truncated).toBe(true);
  });
});
