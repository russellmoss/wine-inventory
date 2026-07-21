// Read-side collapsing for whole-tank readings. DB-free so it is unit-tested without a database.
//
// ⚠️ LEGACY, and deliberately kept (plan 088, Units 14/15). Plan 060 used to FAN a whole-tank
// reading OUT to every co-resident lot, one panel each, sharing a vesselReadingGroupId, so
// vessel-scoped views could show one row while each lot kept its own curve. A vessel now holds ONE
// lot (LEDGER-12), so nothing mints a group id any more and the planner that did is gone.
//
// The COLLAPSING stays, because the history does: five readings in production were genuinely
// fanned out across lots that have since been merged. Without this, each of them renders twice in
// a vessel view, forever. Deleting those panels instead would destroy real measurements to tidy a
// column — not a trade worth making.

export function physicalReadingKey(p: { id: string; vesselReadingGroupId: string | null }): string {
  return p.vesselReadingGroupId ?? p.id;
}

/** Keep one representative row per physical reading (first wins). Vessel-scoped only (see above). */
export function dedupeByPhysicalReading<T extends { id: string; vesselReadingGroupId: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const k = physicalReadingKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
