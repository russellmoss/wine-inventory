import "server-only";
import type { EntityConfig, RelationKind } from "./entities";

/**
 * Delete-impact analysis. A delete falls into three buckets driven by the schema's
 * onDelete rules:
 *  - restrict: the DB blocks the delete while children exist -> we must refuse.
 *  - cascade:  children are deleted with the parent -> enumerate them.
 *  - setNull:  children are orphaned (FK nulled) -> note them.
 */
export type EffectGroup = { label: string; count: number };
export type DeleteEffects = {
  blocked: EffectGroup[]; // restrict children that exist (count > 0)
  cascade: EffectGroup[];
  setNull: EffectGroup[];
};

/** Pure classification of relation counts into the three buckets. Unit-testable. */
export function classifyEffects(rows: { label: string; kind: RelationKind; count: number }[]): DeleteEffects {
  const out: DeleteEffects = { blocked: [], cascade: [], setNull: [] };
  for (const r of rows) {
    if (r.count <= 0) continue;
    if (r.kind === "restrict") out.blocked.push({ label: r.label, count: r.count });
    else if (r.kind === "cascade") out.cascade.push({ label: r.label, count: r.count });
    else out.setNull.push({ label: r.label, count: r.count });
  }
  return out;
}

export function isBlocked(effects: DeleteEffects): boolean {
  return effects.blocked.length > 0;
}

/** Count every child relation for a row, then classify. */
export async function describeDelete(entity: EntityConfig, id: string): Promise<DeleteEffects> {
  const rows = await Promise.all(
    entity.relations.map(async (r) => ({ label: r.label, kind: r.kind, count: await r.count(id) })),
  );
  return classifyEffects(rows);
}

/** Render the buckets as human phrases for a confirm preview / refusal message. */
export function formatEffectGroups(groups: EffectGroup[]): string {
  return groups.map((g) => `${g.count} ${g.label}`).join(", ");
}
