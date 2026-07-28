import React from "react";

/**
 * Identity codes are never truncated below 8 characters (doc 04 §164) — they ARE the
 * identity. When space runs out, the descriptive text gives way instead.
 */
export const CODE_MIN_CHARS = 8;

/**
 * Shorten the wine name, never the codes. Returns the name unchanged when it fits.
 * Pure, so the rule is unit-testable without rendering anything.
 */
export function truncateWineName(name: string, budget: number): string {
  if (budget <= 0) return "";
  if (name.length <= budget) return name;
  if (budget <= 1) return "…";
  return `${name.slice(0, budget - 1).trimEnd()}…`;
}

export interface VesselBarrelFacts {
  cooperage?: string | null;
  oakOrigin?: string | null;
  cooperageYear?: number | null;
  toastLevel?: string | null;
}

export interface VesselIdentityBlockProps {
  /** Tank or barrel code. Always rendered in full. */
  code: string;
  /**
   * The resident lot's code. Required, and nullable only for a genuinely empty vessel —
   * this is AC-S22: "every tank tile displays its lot code as well as its tank code".
   * "Where is the Syrah?" must be answerable without opening anything (§B21).
   */
  lotCode: string | null;
  /** The winemaker's blend name when they set one, otherwise the wine's variety. */
  wineName?: string | null;
  /**
   * The vessel's group. Doc §B21 also lists "location", but `Vessel` has no location column
   * and adding one is a schema change behind the domain gate, so group stands in for it and
   * the omission is recorded in plan 103 as OD-P6-4 rather than silently dropped.
   */
  groupName?: string | null;
  /** `tile` = mono 14px on a board; `detail` = display 32px on a detail surface. */
  size?: "tile" | "detail";
  /** Barrel-only facts (§B21). Ignored on tanks. */
  barrel?: VesselBarrelFacts | null;
  /** Characters of wine name that fit before it gives way. */
  wineNameBudget?: number;
  style?: React.CSSProperties;
}

/**
 * VesselIdentityBlock (v2 §B21) — answers "am I at the right vessel?".
 *
 * Before this, vessel identity was re-composed per screen (doc 06 §64). The rule the
 * component exists to enforce: a tank tile or barrel row always shows its LOT, not just its
 * own code. A code alone tells a cellar hand where they are standing, not what they are
 * standing in front of.
 */
export function VesselIdentityBlock({
  code,
  lotCode,
  wineName,
  groupName,
  size = "tile",
  barrel,
  wineNameBudget = size === "detail" ? 48 : 22,
  style,
}: VesselIdentityBlockProps) {
  const detail = size === "detail";
  const shownWine = wineName ? truncateWineName(wineName, wineNameBudget) : null;
  const truncated = shownWine != null && wineName != null && shownWine !== wineName;

  const barrelFacts = barrel
    ? ([
        ["Cooperage", barrel.cooperage],
        ["Oak", barrel.oakOrigin],
        ["Year", barrel.cooperageYear],
        ["Toast", barrel.toastLevel],
      ] as const).filter(([, v]) => v != null && v !== "")
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: detail ? 6 : 2, minWidth: 0, ...style }}>
      <span
        style={{
          fontFamily: detail ? "var(--font-display)" : "var(--font-mono, monospace)",
          fontSize: detail ? 32 : 14,
          fontWeight: detail ? 400 : 500,
          lineHeight: 1.1,
          color: "var(--text-primary)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={code}
      >
        {code}
      </span>

      {/* The lot line. Rendered for every vessel, including empty ones, because "empty" is
          itself the answer to "what is in this tank" and a missing line reads as a bug. */}
      <span
        style={{
          fontFamily: "var(--font-mono, monospace)",
          fontSize: detail ? 15 : 12.5,
          color: lotCode ? "var(--text-secondary)" : "var(--text-muted)",
          // Clip rather than overflow into the next tile (doc 04 §164: a longer lot code
          // truncates WITH a tooltip; the `title` below supplies it).
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={lotCode ?? undefined}
      >
        {lotCode ?? "empty"}
      </span>

      {shownWine ? (
        <span
          style={{
            fontSize: detail ? 14 : 12,
            color: "var(--text-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          // The full name stays reachable as the accessible name when the visible text gave way.
          title={truncated ? (wineName ?? undefined) : undefined}
          aria-label={truncated ? (wineName ?? undefined) : undefined}
        >
          {shownWine}
        </span>
      ) : null}

      {groupName ? (
        <span style={{ fontSize: detail ? 13 : 11.5, color: "var(--text-muted)" }}>{groupName}</span>
      ) : null}

      {detail && barrelFacts.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 4 }}>
          {barrelFacts.map(([label, value]) => (
            <span key={label} style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              {label} <span style={{ color: "var(--text-secondary)" }}>{value}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
