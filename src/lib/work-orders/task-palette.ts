// The "Add a task" palette in the work-order builder: which buttons exist, how they group, and what
// each one seeds into the new task.
//
// Pure and DOM-free so it is unit-testable — the builder component itself is not (this repo runs vitest
// with `environment: "node"`).
//
// WHY A PALETTE ENTRY IS NOT JUST A TASK TYPE. One task type can be more than one job. PRESS is the
// case that forced this: pressing and bleeding are different operations to a winemaker (a press splits
// a must into free-run and press cuts; a saignée bleeds juice OFF a must to concentrate what stays
// behind, usually for rosé), but they share one core, one `opType`, and one ledger shape, so the
// builder listed a single "Press / saignée" button with a PRESS|SAIGNEE dropdown behind it. The
// reporter's objection was exactly right: *"I'm not sure why we would have press and [saignée] in the
// same work order. I think there would be two separate functions, not picking one or the other."*
// (feedback cmsf3vmlw0000l704pnaiep22). The ASSISTANT already agrees — `nl-resolve` titles the task
// "Press" or "Saignee" depending on `op`; only the manual builder made you pick a mode.
//
// So a palette entry carries an optional `presetValues`. Two buttons, one task type, no domain-model
// change: the core, the opType, the ledger and every downstream reader are untouched.

import type { TaskTypeDef } from "./template-vocabulary";

export type PaletteEntry = {
  /** Unique per BUTTON (not per task type) — two entries can share a taskType. */
  id: string;
  taskType: string;
  label: string;
  /** Field values the new task starts with. The user can still change them. */
  presetValues?: Record<string, string>;
};

export type PaletteCategory = { category: string; items: PaletteEntry[] };

export const CATEGORY_ORDER = [
  "Cellar ops",
  "Additions",
  "Sampling",
  "Maintenance",
  "Fruit & press",
  "Checklist & logs",
] as const;

/** Group a vocabulary entry into a palette category (display-only; the safety line is in the resolver). */
export function categoryFor(def: TaskTypeDef): string {
  if (def.isUserDefined || def.kind === "NOTE") return "Checklist & logs";
  if (def.observationType === "HARVEST_WEIGH_IN" || def.opType === "CRUSH" || def.opType === "PRESS") return "Fruit & press";
  if (def.kind === "OBSERVATION") return "Sampling";
  if (def.kind === "MAINTENANCE") return "Maintenance";
  if (def.opType === "ADDITION" || def.opType === "FINING") return "Additions";
  return "Cellar ops";
}

/**
 * Task types that appear as MORE THAN ONE button, each seeding a different mode.
 *
 * Keyed by task type. Every entry must preset a field the type actually declares, and the presets must
 * cover the type's options exhaustively — otherwise a mode would become unreachable from the builder,
 * which is the bug this table exists to fix. `splitEntriesAreExhaustive` checks that against the
 * vocabulary, and a test holds it.
 */
export const PALETTE_SPLITS: Record<string, { field: string; options: { value: string; label: string }[] }> = {
  PRESS: {
    field: "op",
    options: [
      { value: "PRESS", label: "Press" },
      { value: "SAIGNEE", label: "Saignée" },
    ],
  },
};

/** Every split's presets cover its type's declared options, so no mode is unreachable from the palette. */
export function splitEntriesAreExhaustive(vocab: Record<string, TaskTypeDef>): boolean {
  for (const [taskType, split] of Object.entries(PALETTE_SPLITS)) {
    const def = vocab[taskType];
    if (!def) continue; // a tenant without this type simply shows no buttons for it
    const declared = def.fieldOptions?.[split.field];
    if (!declared) return false;
    const preset = new Set(split.options.map((o) => o.value));
    if (declared.length !== preset.size) return false;
    if (!declared.every((o) => preset.has(o))) return false;
  }
  return true;
}

/** The palette, grouped and ordered for display. */
export function buildTaskPalette(vocab: Record<string, TaskTypeDef>): PaletteCategory[] {
  const byCat: Record<string, PaletteEntry[]> = {};
  for (const [taskType, def] of Object.entries(vocab)) {
    const cat = categoryFor(def);
    const split = PALETTE_SPLITS[taskType];
    const entries: PaletteEntry[] = split
      ? split.options.map((o) => ({
          id: `${taskType}:${o.value}`,
          taskType,
          label: o.label,
          presetValues: { [split.field]: o.value },
        }))
      : [{ id: taskType, taskType, label: def.label }];
    (byCat[cat] ??= []).push(...entries);
  }
  return CATEGORY_ORDER.filter((c) => byCat[c]?.length).map((c) => ({ category: c, items: byCat[c] }));
}
