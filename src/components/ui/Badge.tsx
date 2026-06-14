import React from "react";

type Tone = "neutral" | "gold" | "green" | "blue" | "maroon" | "red";
type Variant = "soft" | "solid" | "outline";

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "style"> {
  tone?: Tone;
  variant?: Variant;
  uppercase?: boolean;
  style?: React.CSSProperties;
}

/**
 * Badge — small status / category label. Quiet soft fills by default, or an
 * uppercase tracked "eyebrow" style. (The "gold" tone now reads as wine.)
 */
export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  uppercase = false,
  style,
  ...rest
}: BadgeProps) {
  const tones: Record<Tone, { fg: string; soft: string; solid: string }> = {
    neutral: { fg: "var(--ink-700)", soft: "var(--paper-200)", solid: "var(--ink-800)" },
    gold: { fg: "var(--wine-primary)", soft: "var(--accent-soft)", solid: "var(--accent)" },
    green: { fg: "var(--deep-green)", soft: "rgba(23,82,66,0.12)", solid: "var(--deep-green)" },
    blue: { fg: "var(--deep-blue)", soft: "rgba(9,89,114,0.12)", solid: "var(--deep-blue)" },
    maroon: { fg: "var(--maroon)", soft: "rgba(107,72,77,0.14)", solid: "var(--maroon)" },
    red: { fg: "var(--red)", soft: "rgba(182,61,53,0.12)", solid: "var(--red)" },
  };
  const t = tones[tone] || tones.neutral;

  const styles: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontFamily: "var(--font-body)",
    fontSize: uppercase ? 11 : 12.5,
    fontWeight: "var(--weight-medium)" as unknown as number,
    letterSpacing: uppercase ? "0.14em" : "0.01em",
    textTransform: uppercase ? "uppercase" : "none",
    lineHeight: 1,
    padding: uppercase ? "5px 9px" : "5px 11px",
    borderRadius: "var(--radius-pill)",
    border: "1px solid transparent",
  };

  const look: React.CSSProperties =
    variant === "solid"
      ? { background: t.solid, color: tone === "gold" ? "var(--accent-on)" : "var(--white)" }
      : variant === "outline"
        ? { background: "transparent", color: t.fg, borderColor: "currentColor" }
        : { background: t.soft, color: t.fg };

  return (
    <span style={{ ...styles, ...look, ...style }} {...rest}>
      {children}
    </span>
  );
}
