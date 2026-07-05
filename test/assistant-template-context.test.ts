import { describe, it, expect } from "vitest";
import {
  resolveSpecMaterials,
  scopedMaterialsForTask,
  describeTaskVocabulary,
  materialFieldKey,
  previewSpec,
} from "@/lib/assistant/template-context";
import { TASK_VOCABULARY, type TemplateSpec } from "@/lib/work-orders/template-vocabulary";
import type { CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import type { MaterialKind } from "@/lib/cellar/additions-math";

// Minimal DTO factory — only the fields the resolver/preview read matter; the rest are nulled.
function mat(p: { id: string; name: string; kind: MaterialKind; category: string; genericName?: string; brandName?: string; preferGeneric?: boolean; isActive?: boolean }): CellarMaterialDTO {
  return {
    id: p.id, name: p.name, kind: p.kind, subcategory: null, category: p.category,
    genericName: p.genericName ?? null, brand: null, brandName: p.brandName ?? null,
    preferGeneric: p.preferGeneric ?? false, vendor: null, vendorUrl: null,
    packageAmount: null, packageUnit: null, defaultBasis: null, percentActive: null,
    isActive: p.isActive ?? true,
  };
}

const KMBS = mat({ id: "m_kmbs", name: "POTASSIUM METABISULFITE", kind: "SO2", category: "ADDITIVE", genericName: "Potassium Metabisulfite", brandName: "KMBS" });
const YEAST = mat({ id: "m_ec1118", name: "EC-1118", kind: "YEAST", category: "ADDITIVE", brandName: "EC-1118" });
const STARSAN = mat({ id: "m_starsan", name: "STAR SAN", kind: "SANITIZER", category: "CLEANING_SANITIZING", genericName: "Star San" });
const MATERIALS = [KMBS, YEAST, STARSAN];

describe("materialFieldKey", () => {
  it("finds the material field on dose blocks, null on NOTE", () => {
    expect(materialFieldKey(TASK_VOCABULARY.ADDITION)).toBe("materialId");
    expect(materialFieldKey(TASK_VOCABULARY.CLEAN)).toBe("materialId");
    expect(materialFieldKey(TASK_VOCABULARY.NOTE)).toBeNull();
    expect(materialFieldKey(TASK_VOCABULARY.RACK)).toBeNull();
  });
});

describe("scopedMaterialsForTask — WORKORDER-3", () => {
  it("ADDITION sees additives, not cleaning/sanitizing", () => {
    const scoped = scopedMaterialsForTask(TASK_VOCABULARY.ADDITION, MATERIALS);
    expect(scoped.map((m) => m.id).sort()).toEqual(["m_ec1118", "m_kmbs"]);
    expect(scoped.find((m) => m.id === "m_starsan")).toBeUndefined();
  });
  it("CLEAN sees cleaning/sanitizing, not additives", () => {
    const scoped = scopedMaterialsForTask(TASK_VOCABULARY.CLEAN, MATERIALS);
    expect(scoped.map((m) => m.id)).toEqual(["m_starsan"]);
  });
});

describe("resolveSpecMaterials", () => {
  it("resolves a named material to its id (scoped to additives) and strips the name", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "ADDITION", title: "Add SO₂", defaults: { material: "KMBS", amount: 30, doseUnit: "g/hL" } }] };
    const { spec: out, unresolved } = resolveSpecMaterials(spec, MATERIALS);
    expect(unresolved).toEqual([]);
    expect(out.tasks[0].defaults).toEqual({ materialId: "m_kmbs", amount: 30, doseUnit: "g/hL" });
    expect(out.tasks[0].defaults).not.toHaveProperty("material");
  });

  it("flags a cleaning material named for an ADDITION (WORKORDER-3 — out of scope)", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "ADDITION", title: "Add", defaults: { material: "Star San" } }] };
    const { unresolved } = resolveSpecMaterials(spec, MATERIALS);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({ taskIndex: 0, taskType: "ADDITION", ref: "Star San" });
  });

  it("resolves a cleaning material for a CLEAN task", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "CLEAN", title: "Clean tank", defaults: { material: "Star San" } }] };
    const { spec: out, unresolved } = resolveSpecMaterials(spec, MATERIALS);
    expect(unresolved).toEqual([]);
    expect(out.tasks[0].defaults?.materialId).toBe("m_starsan");
  });

  it("keeps a valid in-scope materialId echoed from an existing template", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "ADDITION", title: "Add", defaults: { materialId: "m_kmbs" } }] };
    const { spec: out, unresolved } = resolveSpecMaterials(spec, MATERIALS);
    expect(unresolved).toEqual([]);
    expect(out.tasks[0].defaults?.materialId).toBe("m_kmbs");
  });

  it("flags an invented/unknown materialId (never trusts a fabricated id)", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "ADDITION", title: "Add", defaults: { materialId: "m_bogus" } }] };
    const { unresolved } = resolveSpecMaterials(spec, MATERIALS);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].ref).toBe("m_bogus");
  });

  it("passes NOTE / material-less tasks through untouched", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "NOTE", title: "Top up the barrels" }, { taskType: "RACK", title: "Rack", defaults: { lossL: 2 } }] };
    const { spec: out, unresolved } = resolveSpecMaterials(spec, MATERIALS);
    expect(unresolved).toEqual([]);
    expect(out.tasks[0]).toEqual({ taskType: "NOTE", title: "Top up the barrels" });
    expect(out.tasks[1].defaults).toEqual({ lossL: 2 });
  });
});

describe("describeTaskVocabulary", () => {
  it("includes current blocks (CRUSH/PRESS/NOTE) so the model sees them live", () => {
    const desc = describeTaskVocabulary();
    for (const t of ["RACK", "ADDITION", "CRUSH", "PRESS", "NOTE"]) expect(desc).toContain(t);
    expect(desc).toContain("material"); // dose blocks advertise the material-by-name field
  });
});

describe("previewSpec", () => {
  it("renders a readable step chain with the material display name", () => {
    const spec: TemplateSpec = { tasks: [{ taskType: "RACK", title: "Rack off lees" }, { taskType: "ADDITION", title: "Add SO₂", defaults: { materialId: "m_kmbs" } }, { taskType: "NOTE", title: "Top up" }] };
    expect(previewSpec(spec, MATERIALS)).toBe("Rack off lees → Add SO₂ (KMBS) → Top up");
  });
});
