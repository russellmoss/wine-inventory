import type { TaskTypeDef } from "@/lib/work-orders/template-vocabulary";

// Plan 053 (A2): the builder's taskBuilds path spreads user `values` into plannedPayload and never
// canonicalizes (unlike the template path). Left alone, a client could smuggle framework-controlled
// discriminator keys onto a GOVERNED task, or arbitrary junk onto a record-only Custom Log. This guard
// runs at instantiation, BEFORE persist, and is the enforcement half of the ledger-safety line (council C2).

// Keys the FRAMEWORK owns — they are derived from the task-type definition / set explicitly by the
// instantiate step, and must NEVER be accepted from client-supplied `values`. Stripping them means a
// payload can't masquerade as a different task class or pre-seed a dependency/assignee out of band.
export const RESERVED_PAYLOAD_KEYS: readonly string[] = [
  "opType",
  "observationType",
  "activityType",
  "kind",
  "isUserDefined",
  "taskKey",
  "groupSeq",
  "dependsOn",
  "assigneeId",
  "assigneeEmail",
  "__fieldSchema", // C11: framework-injected Custom Log field-spec snapshot (never from user input)
];

/**
 * Sanitize the user-supplied field values for a task before they become plannedPayload.
 * - Always drops the reserved framework keys above (defense-in-depth: the task's kind/opType columns come
 *   from the resolved def, never the payload).
 * - GOVERNED built-ins keep every other key: CRUSH/PRESS/GROUP_RACK legitimately ride run-time payload
 *   keys (groupRack, parentLotId, press fractions, measured output volume) that aren't in `def.fields`.
 * - Record-only Custom Logs (`isUserDefined`) have a CLOSED field set, so only their declared field keys
 *   survive — no arbitrary data smuggled onto a tenant-authored log.
 */
export function sanitizeTaskPayload(def: TaskTypeDef, values: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values ?? {})) {
    if (value === undefined) continue;
    if (RESERVED_PAYLOAD_KEYS.includes(key)) continue;
    if (def.isUserDefined && !(key in def.fields)) continue;
    out[key] = value;
  }
  return out;
}
