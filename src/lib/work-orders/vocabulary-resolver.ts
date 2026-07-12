import { prisma } from "@/lib/prisma";
import { getTenantId, runAsTenant } from "@/lib/tenant/context";
import { TASK_VOCABULARY, type ResolvedTaskVocabulary, type TaskTypeDef } from "@/lib/work-orders/template-vocabulary";
import { customLogToTaskDef } from "@/lib/work-orders/custom-log-fields";

// Plan 053 (A1): the ONE place every authoring path (UI builder, template cores, assistant tools) gets its
// task-type vocabulary. It returns the built-in TASK_VOCABULARY today; Phase C merges the current tenant's
// user-defined "Custom Logs" (record-only NOTE types) + built-in field overlays on top. Keeping this async
// now means Phase C only adds the DB read — no second refactor of every caller.
//
// SAFETY LINE (WORKORDER-1): built-in governed task types (OPERATION/OBSERVATION/MAINTENANCE) are code-defined
// in TASK_VOCABULARY and can NEVER be replaced or shadowed by a tenant row. Only additive, record-only NOTE
// types and display-only overlays on built-ins will ever be layered in here (enforced in Phase C by
// assertUserTaskTypeSafe / assertOverlaySafe before persist, and re-asserted on merge).

/** Resolve the task-type vocabulary for a tenant: built-ins + the tenant's record-only Custom Logs (C11).
 * Phase C12 folds field overlays on top. `tenantId` is explicit (K12) — pass it from server components /
 * readers; server actions with ALS context can omit it (falls back to getTenantId()). No tenant → built-ins.
 * A user Custom Log can NEVER shadow a built-in key, and assertUserTaskTypeSafe re-checks record-only on
 * every merge, so a governed (ledger/observation/maintenance) type can't be introduced or hijacked here. */
export async function resolveTaskVocabulary(tenantId?: string): Promise<ResolvedTaskVocabulary> {
  const vocab: ResolvedTaskVocabulary = { ...TASK_VOCABULARY };
  const tid = tenantId ?? getTenantId();
  if (!tid) return vocab; // no tenant context → built-ins only

  const userTypes = await runAsTenant(tid, () =>
    prisma.workOrderTaskType.findMany({ where: { archivedAt: null }, select: { code: true, label: true, fieldsJson: true } }),
  );
  for (const t of userTypes) {
    if (vocab[t.code]) continue; // never shadow a built-in — governed keys are sacrosanct
    const def = customLogToTaskDef({ label: t.label, fieldsJson: t.fieldsJson });
    assertUserTaskTypeSafe(def); // defense-in-depth: re-assert record-only on the resolve path
    vocab[t.code] = def;
  }
  return vocab;
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
