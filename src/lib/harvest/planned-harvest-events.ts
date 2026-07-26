// Spray Intelligence S3a — the PURE change derivation over the planned-harvest event stream
// (KD-8 / council C4). The append-only stream IS the outbox: there is no listener registry to
// lose on a crash. S7a consumes plannedHarvestChangesSince(cursor) as a watermark read; this
// module derives each PlannedHarvestChange (with its direction) by comparing consecutive
// versions. Dates cross every boundary as ISO YYYY-MM-DD strings (KD-13 / council C6).

export type PlannedHarvestDirection = "SET" | "PULLED_FORWARD" | "PUSHED_BACK" | "RETRACTED";

export interface PlannedHarvestEventRow {
  id: string;
  blockId: string;
  vintageYear: number;
  harvestPassLabel: string;
  /** ISO YYYY-MM-DD (already converted at the DB edge). */
  plannedDate: string;
  version: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  status: "ACTIVE" | "SUPERSEDED" | "RETRACTED";
  enteredAt: Date;
}

export interface PlannedHarvestChange {
  blockId: string;
  vintageYear: number;
  harvestPassLabel: string;
  previousDate: string | null;
  newDate: string | null;
  direction: PlannedHarvestDirection;
  /** The watermark instant of this change (event insert time; close time for a retraction). */
  at: Date;
  version: number;
}

const keyOf = (r: Pick<PlannedHarvestEventRow, "blockId" | "vintageYear" | "harvestPassLabel">) =>
  `${r.blockId}#${r.vintageYear}#${r.harvestPassLabel}`;

/**
 * Derive every change strictly AFTER `cursor` from the full event streams of the affected keys.
 * `rows` must contain ALL versions for each key it contains (the caller queries by key), so the
 * predecessor comparison is always possible. Idempotent: the same cursor over the same rows
 * yields the same changes; each change is emitted exactly once per cursor advance.
 *
 * Two change sources, one stream:
 *   - a new version row (enteredAt > cursor)      → SET / PULLED_FORWARD / PUSHED_BACK
 *   - a RETRACTED close (effectiveTo > cursor)    → RETRACTED (a retraction appends no successor)
 */
export function deriveChangesSince(rows: PlannedHarvestEventRow[], cursor: Date | null): PlannedHarvestChange[] {
  const byKey = new Map<string, PlannedHarvestEventRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = byKey.get(k) ?? [];
    list.push(r);
    byKey.set(k, list);
  }

  const changes: PlannedHarvestChange[] = [];
  const after = (t: Date) => cursor == null || t.getTime() > cursor.getTime();

  for (const list of byKey.values()) {
    const sorted = [...list].sort((a, b) => a.version - b.version);
    const byVersion = new Map(sorted.map((r) => [r.version, r]));
    for (const row of sorted) {
      if (after(row.enteredAt)) {
        const prev = byVersion.get(row.version - 1) ?? null;
        const prevDate = prev?.plannedDate ?? null;
        const direction: PlannedHarvestDirection =
          prevDate == null || prev?.status === "RETRACTED"
            ? "SET"
            : row.plannedDate < prevDate
              ? "PULLED_FORWARD"
              : row.plannedDate > prevDate
                ? "PUSHED_BACK"
                : "SET";
        changes.push({
          blockId: row.blockId,
          vintageYear: row.vintageYear,
          harvestPassLabel: row.harvestPassLabel,
          previousDate: prevDate,
          newDate: row.plannedDate,
          direction,
          at: row.enteredAt,
          version: row.version,
        });
      }
      if (row.status === "RETRACTED" && row.effectiveTo != null && after(row.effectiveTo)) {
        changes.push({
          blockId: row.blockId,
          vintageYear: row.vintageYear,
          harvestPassLabel: row.harvestPassLabel,
          previousDate: row.plannedDate,
          newDate: null,
          direction: "RETRACTED",
          at: row.effectiveTo,
          version: row.version,
        });
      }
    }
  }

  changes.sort((a, b) => a.at.getTime() - b.at.getTime());
  return changes;
}

/** The next cursor after consuming `changes` (max change instant; the old cursor when empty). */
export function advanceCursor(changes: PlannedHarvestChange[], cursor: Date | null): Date | null {
  let max = cursor;
  for (const c of changes) if (max == null || c.at.getTime() > max.getTime()) max = c.at;
  return max;
}
