// Structured planned-vs-actual deviation (Phase 9 Unit 9). Pure — diffs a task's plannedPayload against
// its attempt's actualPayload and surfaces what changed to the approver (deviation-first review, D3).
// Significance (D3): a VOLUME field that moved >1% relative, or an AMOUNT/rate field that changed at all,
// forces individual review — bulk "approve all" only offers EXACT-match (no significant deviation) tasks
// (anti-rubber-stamp). Notes/instructions live as text columns on WorkOrder/Task/Attempt (Units 4/6);
// attachment references ride inside actualPayload (no schema change, per the plan).

const VOLUME_FIELDS = new Set(["drawL", "lossL", "volumeL"]);
const AMOUNT_FIELDS = new Set(["rateValue", "plannedAmount"]);
const VOLUME_PCT_THRESHOLD = 1; // percent

const round2 = (n: number) => Math.round(n * 100) / 100;

export type Deviation = {
  field: string;
  planned: number | null;
  actual: number | null;
  delta: number | null; // actual − planned
  pct: number | null; // relative to planned, percent (null when planned is 0/absent)
  significant: boolean;
};

function asNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isSignificant(field: string, planned: number | null, actual: number | null, pct: number | null): boolean {
  if (planned === null || actual === null) return planned !== actual; // appeared/disappeared = notable
  if (planned === actual) return false;
  if (VOLUME_FIELDS.has(field)) return pct !== null && Math.abs(pct) > VOLUME_PCT_THRESHOLD;
  if (AMOUNT_FIELDS.has(field)) return true; // any chem-amount / rate change is significant (D3)
  return false; // other numeric fields aren't gated
}

/** Compute the numeric deviations between the planned and actual payloads. Only fields we care about
 * (volume + amount/rate) are considered for significance; every changed numeric field is reported. */
export function computeDeviations(
  planned: Record<string, unknown> | null | undefined,
  actual: Record<string, unknown> | null | undefined,
): Deviation[] {
  const p = planned ?? {};
  const a = actual ?? {};
  const keys = new Set<string>([...Object.keys(p), ...Object.keys(a)].filter((k) => VOLUME_FIELDS.has(k) || AMOUNT_FIELDS.has(k)));
  const out: Deviation[] = [];
  for (const field of keys) {
    const planV = asNum(p[field]);
    const actV = asNum(a[field]);
    if (planV === null && actV === null) continue;
    const delta = planV !== null && actV !== null ? round2(actV - planV) : null;
    const pct = planV !== null && actV !== null && planV !== 0 ? round2(((actV - planV) / planV) * 100) : null;
    const significant = isSignificant(field, planV, actV, pct);
    if (planV === actV) continue; // no change → not a deviation
    out.push({ field, planned: planV, actual: actV, delta, pct, significant });
  }
  return out;
}

/** True when any deviation is significant (D3): the task must be reviewed individually, not bulk-approved. */
export function hasSignificantDeviation(deviations: Deviation[]): boolean {
  return deviations.some((d) => d.significant);
}
