"use client";

import React from "react";
import Link from "next/link";
import { Eyebrow } from "@/components/ui";
import type { LineageNode } from "@/lib/lot/lineage";

// The lineage TREE — defaults to immediate parents/children (a deep solera is unreadable),
// with a per-node "+ ancestry / + descendants" toggle that reveals the next level. Fraction-
// labeled edges, token-styled, hand-rolled (no graph dep). Omitted entirely when a lot has no
// lineage (handled by the caller — this returns null defensively too).

const groupLabel: React.CSSProperties = {
  fontSize: 11.5,
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  marginBottom: 6,
};

const expandBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-accent)",
  fontSize: 12,
  cursor: "pointer",
  padding: "2px 4px",
};

function NodeRow({ node, depth }: { node: LineageNode; depth: number }) {
  const [open, setOpen] = React.useState(false);
  const hasMore = node.nodes.length > 0;
  return (
    <div style={{ marginLeft: depth * 18, borderLeft: depth > 0 ? "1px solid var(--border-subtle)" : undefined, paddingLeft: depth > 0 ? 12 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 32, flexWrap: "wrap" }}>
        {node.fraction != null ? (
          <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 40, fontVariantNumeric: "tabular-nums" }}>
            {Math.round(node.fraction * 100)}%
          </span>
        ) : null}
        <Link href={`/lots/${node.id}`} style={{ color: "var(--text-accent)", fontSize: 14, fontWeight: 500 }}>
          {node.code}
        </Link>
        {node.varietyName || node.vintageYear != null ? (
          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
            {[node.varietyName, node.vineyardName, node.vintageYear].filter(Boolean).join(" · ")}
          </span>
        ) : null}
        {hasMore ? (
          <button type="button" style={expandBtn} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "− hide" : `+ ${node.nodes.length} more`}
          </button>
        ) : null}
      </div>
      {open && hasMore ? node.nodes.map((n) => <NodeRow key={n.id} node={n} depth={depth + 1} />) : null}
    </div>
  );
}

export function LineageTree({
  ancestors,
  descendants,
}: {
  ancestors: LineageNode[];
  descendants: LineageNode[];
}) {
  if (ancestors.length === 0 && descendants.length === 0) return null;
  return (
    <div>
      <Eyebrow rule>Lineage</Eyebrow>
      {ancestors.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          <div style={groupLabel}>Blended from</div>
          {ancestors.map((n) => (
            <NodeRow key={n.id} node={n} depth={0} />
          ))}
        </div>
      ) : null}
      {descendants.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div style={groupLabel}>Used in</div>
          {descendants.map((n) => (
            <NodeRow key={n.id} node={n} depth={0} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
