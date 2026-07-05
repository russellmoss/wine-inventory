import { ActionError } from "@/lib/action-error";
import { ANALYTES } from "@/lib/chemistry/analytes";

// Pure validation/coercion for the field readings on a harvest pick (plan 039). No Prisma, no server-only,
// no I/O — unit-tested in test/harvest-pick-fields.test.ts and shared by the harvest action, the assistant
// weigh-in tool, and the work-order HARVEST_WEIGH_IN completion handler so all three validate identically.
// pH/TA ranges + precision come from the analyte registry (single source of truth): pH 2.5–4.5 (2 dp),
// TA g/L tartaric, 0–20 (1 dp). Brix keeps the harvest ledger's own 0–35 window (DB CHECK backstops at 40).

export const BRIX_MIN = 0;
export const BRIX_MAX = 35;
export const PH_MIN = ANALYTES.PH.min ?? 2.5;
export const PH_MAX = ANALYTES.PH.max ?? 4.5;
export const TA_MIN = ANALYTES.TA.min ?? 0;
export const TA_MAX = ANALYTES.TA.max ?? 20;
export const TA_UNIT = ANALYTES.TA.defaultUnit; // "g/L tartaric" (v1; a per-pick unit toggle is deferred)

/** null/undefined/"" → null (the reading is optional); otherwise a finite number or throw. */
function optionalNumber(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new ActionError(`Enter a numeric ${label}.`);
  return n;
}

/** Coerce an optional Brix-at-pick reading (°Bx). Returns null when absent. */
export function coerceBrix(value: unknown): number | null {
  const n = optionalNumber(value, "Brix");
  if (n == null) return null;
  if (n < BRIX_MIN || n > BRIX_MAX) throw new ActionError(`Brix must be between ${BRIX_MIN} and ${BRIX_MAX} °Bx.`);
  return n;
}

/** Coerce an optional field pH reading. Returns null when absent. */
export function coercePh(value: unknown): number | null {
  const n = optionalNumber(value, "pH");
  if (n == null) return null;
  if (n < PH_MIN || n > PH_MAX) throw new ActionError(`pH must be between ${PH_MIN} and ${PH_MAX}.`);
  return n;
}

/** Coerce an optional field TA reading (g/L tartaric). Returns null when absent. */
export function coerceTa(value: unknown): number | null {
  const n = optionalNumber(value, "TA");
  if (n == null) return null;
  if (n < TA_MIN || n > TA_MAX) throw new ActionError(`TA must be between ${TA_MIN} and ${TA_MAX} ${TA_UNIT}.`);
  return n;
}
