import { TASK_VOCABULARY, type ResolvedTaskVocabulary, type TaskTypeDef } from "@/lib/work-orders/template-vocabulary";

// Plan 053 (A1): the ONE place every authoring path (UI builder, template cores, assistant tools) gets its
// task-type vocabulary. It returns the built-in TASK_VOCABULARY today; Phase C merges the current tenant's
// user-defined "Custom Logs" (record-only NOTE types) + built-in field overlays on top. Keeping this async
// now means Phase C only adds the DB read — no second refactor of every caller.
//
// SAFETY LINE (WORKORDER-1): built-in governed task types (OPERATION/OBSERVATION/MAINTENANCE) are code-defined
// in TASK_VOCABULARY and can NEVER be replaced or shadowed by a tenant row. Only additive, record-only NOTE
// types and display-only overlays on built-ins will ever be layered in here (enforced in Phase C by
// assertUserTaskTypeSafe / assertOverlaySafe before persist, and re-asserted on merge).

/** Resolve the task-type vocabulary for the current tenant. A1: built-ins only. Phase C: + user types + overlays. */
export async function resolveTaskVocabulary(): Promise<ResolvedTaskVocabulary> {
  // Phase C will: (1) load WorkOrderTaskType rows for the tenant, run assertUserTaskTypeSafe on each, and
  // add them (never overwriting a built-in key); (2) load WorkOrderTaskTypeOverlay rows and applyOverlay to
  // the matching built-in. Until then the resolved map equals the built-ins.
  return { ...TASK_VOCABULARY };
}

/** Assert a candidate USER-defined task type stays on the record-only side of the safety line (Phase C uses
 * this before persist; exported here so the resolver + tests share one guard). A user type MUST be NOTE-kind
 * and MUST NOT declare a ledger opType, an observation type, or a maintenance activity type — those are the
 * only ways a task reaches the immutable ledger / measurement store / cost roll-up. */
export function assertUserTaskTypeSafe(def: Pick<TaskTypeDef, "kind" | "opType" | "observationType" | "activityType">): void {
  if (def.kind !== "NOTE") {
    throw new Error("A custom log must be a record-only NOTE type (it cannot be an operation, observation, or maintenance task).");
  }
  if (def.opType != null || def.observationType != null || def.activityType != null) {
    throw new Error("A custom log cannot declare a ledger operation, observation, or maintenance activity — those stay built-in.");
  }
}
