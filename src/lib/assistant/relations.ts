import "server-only";
import type { EntityConfig, RelationKind } from "./entities";

/**
 * Delete-impact analysis. A delete falls into these buckets driven by the schema's
 * onDelete rules:
 *  - restrict: the DB blocks the delete while children exist -> normally we refuse.
 *              A restrict child MARKED `cascadable` on an entity that opts into a
 *              confirmed cascade (see EntityConfig.cascadeRestrict) is split out into
 *              `cascadableBlocked` instead — those get a user-confirmed cascade offer,
 *              not a hard refusal. Non-cascadable restrict children stay a hard wall.
 *  - cascade:  children are deleted with the parent -> enumerate them.
 *  - setNull:  children are orphaned (FK nulled) -> note them.
 */
export type EffectGroup = { label: string; count: number };
export type DeleteEffects = {
  blocked: EffectGroup[]; // hard restrict children that exist (count > 0) — always refuse
  cascadableBlocked: EffectGroup[]; // restrict children an opted-in confirmed cascade can remove
  cascade: EffectGroup[];
  setNull: EffectGroup[];
};

/** Pure classification of relation counts into the buckets. Unit-testable. */
export function classifyEffects(
  rows: { label: string; kind: RelationKind; count: number; cascadable?: boolean }[],
): DeleteEffects {
  const out: DeleteEffects = { blocked: [], cascadableBlocked: [], cascade: [], setNull: [] };
  for (const r of rows) {
    if (r.count <= 0) continue;
    if (r.kind === "restrict") {
      (r.cascadable ? out.cascadableBlocked : out.blocked).push({ label: r.label, count: r.count });
    } else if (r.kind === "cascade") out.cascade.push({ label: r.label, count: r.count });
    else out.setNull.push({ label: r.label, count: r.count });
  }
  return out;
}

/** A hard block = a restrict child that no confirmed cascade can remove. */
export function isBlocked(effects: DeleteEffects): boolean {
  return effects.blocked.length > 0;
}

/** Whether a user-confirmed cascade is needed (and possible) to delete this row. */
export function needsCascade(effects: DeleteEffects): boolean {
  return effects.cascadableBlocked.length > 0;
}

/** Count every child relation for a row, then classify. */
export async function describeDelete(entity: EntityConfig, id: string): Promise<DeleteEffects> {
  const rows = await Promise.all(
    entity.relations.map(async (r) => ({ label: r.label, kind: r.kind, cascadable: r.cascadable, count: await r.count(id) })),
  );
  return classifyEffects(rows);
}

/** Render the buckets as human phrases for a confirm preview / refusal message. */
export function formatEffectGroups(groups: EffectGroup[]): string {
  return groups.map((g) => `${g.count} ${g.label}`).join(", ");
}
