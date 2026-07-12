// Plan 053 B8: ERP planning fields for work orders + tasks (priority, estimated duration, scheduled
// window). Priority is a VALIDATED STRING (no Prisma enum — the Windows isolated-ALTER-TYPE hazard);
// this module is the single source of truth for the allowed values + normalization, shared by the
// server action guard and any UI that renders the options.

export const WORK_ORDER_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

/** Rank for sorting (URGENT first). Unknown/absent sorts as NORMAL. */
export const PRIORITY_RANK: Record<WorkOrderPriority, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export function isWorkOrderPriority(v: unknown): v is WorkOrderPriority {
  return typeof v === "string" && (WORK_ORDER_PRIORITIES as readonly string[]).includes(v);
}

/** Coerce untrusted input to a valid priority or null. Empty/absent → null (defaults to NORMAL in UI). */
export function normalizeWorkOrderPriority(v: unknown): WorkOrderPriority | null {
  if (v == null || v === "") return null;
  if (isWorkOrderPriority(v)) return v;
  throw new Error(`Invalid priority "${String(v)}" (allowed: ${WORK_ORDER_PRIORITIES.join(", ")}).`);
}

/** Coerce an optional positive integer (minutes). Rejects negatives/NaN; empty → null. */
export function normalizeDurationMin(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error("Estimated duration must be a non-negative number of minutes.");
  return Math.round(n);
}
