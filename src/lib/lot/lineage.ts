// Pure lineage graph logic (Phase 5). No DB / server imports — unit-tested directly. The
// loader in lot/data.ts does the batched reads and hands these functions an edge list + a
// per-lot meta map; everything here is cycle-guarded and depth-bounded so a deep solera or an
// accidental cycle can never blow the stack.

export const LINEAGE_KINDS = ["SPLIT", "BLEND", "TOPPING"] as const;
export type LineageKind = (typeof LINEAGE_KINDS)[number];
export const LINEAGE_KIND = {
  SPLIT: "SPLIT",
  BLEND: "BLEND",
  TOPPING: "TOPPING",
} as const satisfies Record<LineageKind, LineageKind>;

export type LineageEdge = {
  parentLotId: string;
  childLotId: string;
  fraction: number | null;
  kind: LineageKind | string;
};

export type LotMeta = {
  id: string;
  code: string;
  vintageYear: number | null;
  varietyName: string | null;
  vineyardName: string | null;
};

export type LineageNode = {
  id: string;
  code: string;
  vintageYear: number | null;
  varietyName: string | null;
  vineyardName: string | null;
  fraction: number | null; // the edge's fraction toward the node we descended FROM
  nodes: LineageNode[]; // further ancestors (up) or descendants (down)
};

const DEFAULT_MAX_DEPTH = 8;

function metaOf(id: string, meta: Map<string, LotMeta>): Omit<LineageNode, "fraction" | "nodes"> {
  const m = meta.get(id);
  return {
    id,
    code: m?.code ?? id,
    vintageYear: m?.vintageYear ?? null,
    varietyName: m?.varietyName ?? null,
    vineyardName: m?.vineyardName ?? null,
  };
}

/** Build the ancestor tree (immediate parents first, each carrying its own ancestors). */
export function buildAncestry(
  rootId: string,
  edges: LineageEdge[],
  meta: Map<string, LotMeta>,
  maxDepth = DEFAULT_MAX_DEPTH,
): LineageNode[] {
  const byChild = new Map<string, LineageEdge[]>();
  for (const e of edges) byChild.set(e.childLotId, [...(byChild.get(e.childLotId) ?? []), e]);

  const walk = (lotId: string, depth: number, seen: Set<string>): LineageNode[] => {
    if (depth >= maxDepth || seen.has(lotId)) return [];
    const next = new Set(seen).add(lotId);
    return (byChild.get(lotId) ?? []).map((e) => ({
      ...metaOf(e.parentLotId, meta),
      fraction: e.fraction,
      nodes: walk(e.parentLotId, depth + 1, next),
    }));
  };
  return walk(rootId, 0, new Set());
}

/** Build the descendant tree (immediate children first, each carrying its own descendants). */
export function buildDescendants(
  rootId: string,
  edges: LineageEdge[],
  meta: Map<string, LotMeta>,
  maxDepth = DEFAULT_MAX_DEPTH,
): LineageNode[] {
  const byParent = new Map<string, LineageEdge[]>();
  for (const e of edges) byParent.set(e.parentLotId, [...(byParent.get(e.parentLotId) ?? []), e]);

  const walk = (lotId: string, depth: number, seen: Set<string>): LineageNode[] => {
    if (depth >= maxDepth || seen.has(lotId)) return [];
    const next = new Set(seen).add(lotId);
    return (byParent.get(lotId) ?? []).map((e) => ({
      ...metaOf(e.childLotId, meta),
      fraction: e.fraction,
      nodes: walk(e.childLotId, depth + 1, next),
    }));
  };
  return walk(rootId, 0, new Set());
}

export type RollupSlice = { key: string; label: string; pct: number };
export type CompositionRollup = {
  byVariety: RollupSlice[];
  byVineyard: RollupSlice[];
  byVintage: RollupSlice[];
  complete: boolean; // false if any branch's fractions didn't sum to ~1 (unknown provenance)
};

/**
 * Weighted composition rollup ("what's in this wine") — recursively attribute the root's
 * makeup to its ANCESTOR LEAVES by multiplying lineage fractions down each path. A leaf (a lot
 * with no parents) contributes its accumulated weight to its own variety / vineyard / vintage.
 * Where a node's parent fractions don't sum to 1 (incomplete provenance), the remainder is
 * attributed to the node itself rather than silently dropped. Cycle-guarded.
 */
export function composeRollup(
  rootId: string,
  edges: LineageEdge[],
  meta: Map<string, LotMeta>,
): CompositionRollup {
  const byChild = new Map<string, LineageEdge[]>();
  for (const e of edges) byChild.set(e.childLotId, [...(byChild.get(e.childLotId) ?? []), e]);

  const leaves: { lotId: string; weight: number }[] = [];
  let complete = true;

  const attribute = (lotId: string, weight: number, seen: Set<string>): void => {
    const parents = byChild.get(lotId) ?? [];
    if (parents.length === 0 || seen.has(lotId)) {
      leaves.push({ lotId, weight });
      return;
    }
    const next = new Set(seen).add(lotId);
    let covered = 0;
    for (const p of parents) {
      const f = p.fraction ?? 1 / parents.length;
      covered += f;
      attribute(p.parentLotId, weight * f, next);
    }
    if (covered < 1 - 1e-6) {
      complete = false;
      leaves.push({ lotId, weight: weight * (1 - covered) }); // remainder = this node's own wine
    }
  };
  attribute(rootId, 1, new Set());

  const total = leaves.reduce((a, l) => a + l.weight, 0) || 1;
  const bucket = (pick: (m: LotMeta | undefined) => { key: string; label: string } | null): RollupSlice[] => {
    const acc = new Map<string, { label: string; weight: number }>();
    for (const leaf of leaves) {
      const got = pick(meta.get(leaf.lotId));
      if (!got) continue;
      const cur = acc.get(got.key);
      acc.set(got.key, { label: got.label, weight: (cur?.weight ?? 0) + leaf.weight });
    }
    return [...acc.entries()]
      .map(([key, v]) => ({ key, label: v.label, pct: Math.round((v.weight / total) * 1000) / 10 }))
      .sort((a, b) => b.pct - a.pct);
  };

  return {
    byVariety: bucket((m) => (m?.varietyName ? { key: m.varietyName, label: m.varietyName } : null)),
    byVineyard: bucket((m) => (m?.vineyardName ? { key: m.vineyardName, label: m.vineyardName } : null)),
    byVintage: bucket((m) =>
      m?.vintageYear != null ? { key: String(m.vintageYear), label: String(m.vintageYear) } : null,
    ),
    complete,
  };
}

/** True when a lot participates in any lineage edge (so the UI can omit the section entirely). */
export function hasLineage(rootId: string, edges: LineageEdge[]): boolean {
  return edges.some((e) => e.parentLotId === rootId || e.childLotId === rootId);
}
