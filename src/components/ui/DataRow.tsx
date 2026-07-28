"use client";

import React from "react";

export type DataRowDensity = "comfortable" | "default" | "dense";

export interface DataRowProps extends Omit<React.HTMLAttributes<HTMLTableRowElement>, "style"> {
  density?: DataRowDensity;
  /** Wine left rule — the row is being captured right now. */
  active?: boolean;
  /** Attention left rule — overdue, blocked, out of tolerance. */
  flagged?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const HEIGHT: Record<DataRowDensity, string> = {
  comfortable: "var(--row-h-comfortable)",
  default: "var(--row-h-default)",
  dense: "var(--row-h-dense)",
};

/**
 * DataRow — one row of a dense table (v2 §B14).
 *
 * A real `<tr>`, deliberately. Rows are hand-rolled per screen today, several as
 * divs, which costs the row/column relationships a screen reader needs.
 *
 * **The whole row is never a link.** Put the link on the identity cell instead:
 * a row-wide anchor makes every cell's text unselectable, which breaks copying a
 * lot code or a volume — something cellar staff do constantly.
 */
export function DataRow({
  density = "default",
  active = false,
  flagged = false,
  children,
  style,
  ...rest
}: DataRowProps) {
  return (
    <tr
      {...rest}
      style={{
        height: active ? "var(--row-h-active)" : HEIGHT[density],
        borderTop: "1px solid var(--border-strong)",
        background: active ? "var(--surface-tint-accent)" : undefined,
        // The status rule is a LEFT BORDER, never a background wash: a tinted row
        // fails contrast against the text sitting on it.
        borderLeft: active
          ? "var(--border-accent-width) solid var(--accent)"
          : flagged
            ? "var(--border-accent-width) solid var(--status-attention-fg)"
            : "var(--border-accent-width) solid transparent",
        ...style,
      }}
    >
      {children}
    </tr>
  );
}

export interface DataCellProps extends Omit<React.TdHTMLAttributes<HTMLTableCellElement>, "style"> {
  /** The row's identity (lot code, barrel, WO number). Gets the wider gutter. */
  identity?: boolean;
  numeric?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** A cell at the density tokens' padding, with tabular figures for numbers. */
export function DataCell({ identity = false, numeric = false, children, style, ...rest }: DataCellProps) {
  return (
    <td
      {...rest}
      style={{
        padding: `0 var(--cell-pad-x)`,
        paddingLeft: identity ? "var(--cell-pad-x-first)" : undefined,
        textAlign: numeric ? "right" : "left",
        fontVariantNumeric: numeric ? "tabular-nums" : undefined,
        color: "var(--text-primary)",
        ...style,
      }}
    >
      {children}
    </td>
  );
}

export interface DataHeadCellProps extends Omit<React.ThHTMLAttributes<HTMLTableCellElement>, "style"> {
  numeric?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** A column header. `scope="col"` is set here so no call site can forget it. */
export function DataHeadCell({ numeric = false, children, style, ...rest }: DataHeadCellProps) {
  return (
    <th
      scope="col"
      {...rest}
      style={{
        padding: `0 var(--cell-pad-x)`,
        height: "var(--row-h-default)",
        textAlign: numeric ? "right" : "left",
        fontSize: 12,
        fontWeight: "var(--weight-semibold)" as unknown as number,
        letterSpacing: "var(--tracking-wide)",
        textTransform: "uppercase",
        color: "var(--text-meta)",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </th>
  );
}
