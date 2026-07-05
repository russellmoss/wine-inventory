import {
  TASK_VOCABULARY,
  fieldLabel,
  type TemplateSpec,
  type TemplateTaskSpec,
  type TaskTypeDef,
} from "@/lib/work-orders/template-vocabulary";
import {
  materialScopeForTask,
  categoryOf,
  type MaterialCategory,
} from "@/lib/cellar/material-taxonomy";
import { materialDisplayName, type CellarMaterialDTO } from "@/lib/cellar/materials-shared";
import { rankMaterials } from "@/lib/inventory/material-search";

// Phase 038: PURE, client-safe helpers the assistant's template tools use to (a) describe the LIVE block
// vocabulary to the model, (b) resolve a material named in a template spec to a real CellarMaterial scoped
// to the task's doseable category (WORKORDER-3), and (c) preview a spec for the confirm card. No prisma,
// no server-only — the tools inject the tenant's material list; the test drives it directly. The block +
// material knowledge is DERIVED from TASK_VOCABULARY + the material model, never a hardcoded snapshot
// (the whole anti-drift point — future blocks/materials flow in for free).

/** The task types a template may use — derived live from the vocabulary. */
export const TEMPLATE_TASK_TYPES: string[] = Object.keys(TASK_VOCABULARY);

/** The field key on a task type that holds a material (there is at most one), or null. */
export function materialFieldKey(def: TaskTypeDef): string | null {
  const entry = Object.entries(def.fields).find(([, type]) => type === "material");
  return entry ? entry[0] : null;
}

/** The stored category of a material (fallback derives from kind for legacy rows). */
function catOf(m: CellarMaterialDTO): MaterialCategory {
  return (m.category as MaterialCategory) ?? categoryOf(m.kind);
}

/** The materials a given task type may dose, scoped by WORKORDER-3 (undefined scope = all categories). */
export function scopedMaterialsForTask(def: TaskTypeDef, materials: readonly CellarMaterialDTO[]): CellarMaterialDTO[] {
  const scope = materialScopeForTask({ opType: def.opType ?? null, activityType: def.activityType ?? null });
  const active = materials.filter((m) => m.isActive !== false);
  if (!scope) return [...active];
  const allowed = new Set(scope);
  return active.filter((m) => allowed.has(catOf(m)));
}

/**
 * A compact, model-facing reference of the block vocabulary — task types, their labels, and the fields a
 * template may default. Regenerated from TASK_VOCABULARY on every read, so a new block (CRUSH/PRESS/NOTE
 * or a future Phase-20 vineyard block) appears without touching this file. Embedded in the tool description.
 */
export function describeTaskVocabulary(): string {
  return Object.entries(TASK_VOCABULARY)
    .map(([key, def]) => {
      const fields = Object.entries(def.fields)
        .map(([f, type]) => (type === "material" ? "material (a material's plain name, e.g. \"KMBS\")" : `${fieldLabel(f)} (${type})`))
        .join(", ");
      const opts = def.fieldOptions
        ? " Options: " + Object.entries(def.fieldOptions).map(([f, o]) => `${f}=[${o.join("|")}]`).join("; ")
        : "";
      return `- ${key} (${def.label}): ${fields || "no fields"}.${opts}`;
    })
    .join("\n");
}

export type UnresolvedMaterial = { taskIndex: number; taskType: string; ref: string };

export type SpecResolution = {
  /** The spec with every task's material name resolved to a real materialId (name stripped). */
  spec: TemplateSpec;
  /** Materials the model named that don't match any doseable material in the tenant's catalog. */
  unresolved: UnresolvedMaterial[];
};

/**
 * Resolve every material a template spec names to a real CellarMaterial id, scoped per task to what that
 * block may dose (WORKORDER-3). The model passes a material by PLAIN NAME under `defaults.material`; we
 * fuzzy-match it (brand + generic, via materialDisplayName + rankMaterials) inside the task's scope, set
 * `defaults.materialId`, and drop `defaults.material`. An already-present `materialId` (e.g. echoed from an
 * existing template) is KEPT only if it's a real in-scope material — otherwise it's flagged. Never invents
 * a material. Pure: the caller injects the tenant's material list. Non-material fields pass through untouched.
 */
export function resolveSpecMaterials(spec: TemplateSpec, materials: readonly CellarMaterialDTO[]): SpecResolution {
  const unresolved: UnresolvedMaterial[] = [];
  const byId = new Map(materials.map((m) => [m.id, m]));

  const tasks: TemplateTaskSpec[] = (spec?.tasks ?? []).map((task, i) => {
    const def = TASK_VOCABULARY[task.taskType];
    const key = def ? materialFieldKey(def) : null;
    if (!def || !key) return task; // unknown type or no material field → leave for validateTemplateSpec

    const defaults = { ...(task.defaults ?? {}) };
    const named = defaults.material;
    const existingId = defaults[key];
    delete defaults.material; // the friendly-name input is never persisted

    const scoped = scopedMaterialsForTask(def, materials);

    if (typeof named === "string" && named.trim()) {
      const [best] = rankMaterials(named.trim(), scoped, (m) => materialDisplayName(m));
      if (best) defaults[key] = best.id;
      else unresolved.push({ taskIndex: i, taskType: task.taskType, ref: named.trim() });
    } else if (typeof existingId === "string" && existingId) {
      const found = byId.get(existingId);
      const inScope = found && scoped.some((m) => m.id === found.id);
      if (!inScope) unresolved.push({ taskIndex: i, taskType: task.taskType, ref: existingId });
    }

    return { ...task, defaults };
  });

  return { spec: { tasks }, unresolved };
}

/** A one-line, human-readable preview of a spec for the confirm card ("Rack → Add SO₂ → Note: top up"). */
export function previewSpec(spec: TemplateSpec, materials: readonly CellarMaterialDTO[] = []): string {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const steps = (spec?.tasks ?? []).map((task) => {
    const def = TASK_VOCABULARY[task.taskType];
    const base = task.title?.trim() || def?.label || task.taskType;
    const key = def ? materialFieldKey(def) : null;
    const matId = key ? task.defaults?.[key] : undefined;
    const mat = typeof matId === "string" ? byId.get(matId) : undefined;
    return mat ? `${base} (${materialDisplayName(mat)})` : base;
  });
  return steps.length ? steps.join(" → ") : "no tasks";
}
