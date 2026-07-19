import type { ResolvedTaskVocabulary } from "./template-vocabulary";
import { sanitizeTaskPayload } from "./payload-guard";

/**
 * Template spec → seed tasks for the work-order BUILDER.
 *
 * "Create a work order from this" on a template detail page routes to `/work-orders/new?template=<id>`,
 * but that route rendered a blank builder — the query param was read by nobody, so the template silently
 * evaporated. This is the missing conversion: the stored spec becomes the builder's starting tasks, which
 * the winemaker then edits (pick the vessel, the material, the dose) before creating.
 *
 * Defensive by design, because the spec is persisted JSON that outlives the vocabulary that produced it:
 * a task whose type no longer exists (a deleted Custom Log) is DROPPED rather than crashing the page, and
 * defaults are filtered to the fields the type actually declares today. A half-seeded builder the
 * winemaker can fix beats a 500 on a page that used to work.
 *
 * Pure — no Prisma, no React — so the shape-tolerance is unit-testable.
 */

export type SeedTask = {
  taskType: string;
  title: string;
  values: Record<string, unknown>;
  /** Crew guidance from the template. Carried through TaskBuild so it survives onto the created task. */
  instructions?: string;
};

/** Narrow the persisted `spec` (typed `unknown` at the data layer) without trusting its shape. */
function specTasks(spec: unknown): Record<string, unknown>[] {
  if (!spec || typeof spec !== "object") return [];
  const tasks = (spec as { tasks?: unknown }).tasks;
  if (!Array.isArray(tasks)) return [];
  return tasks.filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !Array.isArray(t));
}

export function templateSpecToSeedTasks(spec: unknown, vocab: ResolvedTaskVocabulary): SeedTask[] {
  const out: SeedTask[] = [];
  for (const raw of specTasks(spec)) {
    const taskType = typeof raw.taskType === "string" ? raw.taskType : "";
    const def = vocab[taskType];
    if (!def) continue; // unknown/retired task type — drop it rather than break the whole seed

    // Filter defaults through the SAME guard the server-side spec path uses (instantiateTasksFromSpec),
    // so seeding the builder carries exactly what creating straight from the template would. That
    // deliberately keeps undeclared keys on governed built-ins — e.g. an ADDITION template's `rateBasis`
    // is a real run-time payload key that isn't in `def.fields`, and dropping it would quietly change the
    // dose basis. Only user-defined Custom Logs have a closed field set.
    const defaults = raw.defaults && typeof raw.defaults === "object" && !Array.isArray(raw.defaults)
      ? (raw.defaults as Record<string, unknown>)
      : {};
    const values = sanitizeTaskPayload(def, defaults);

    const title = typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : def.label;
    const instructions = typeof raw.instructions === "string" && raw.instructions.trim() ? raw.instructions.trim() : undefined;
    out.push({ taskType, title, values, ...(instructions ? { instructions } : {}) });
  }
  return out;
}
