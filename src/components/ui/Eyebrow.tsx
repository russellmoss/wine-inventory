import React from "react";

type Tone = "gold" | "ink" | "onDark";

export interface EyebrowProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, "style"> {
  tone?: Tone;
  rule?: boolean;
  style?: React.CSSProperties;
}

/**
 * Eyebrow — uppercase, tracked kicker label above a title. Wine by default,
 * with an optional leading hairline rule.
 */
export function Eyebrow({ children, tone = "gold", rule = false, style, ...rest }: EyebrowProps) {
  const colors: Record<Tone, string> = {
    gold: "var(--text-accent)",
    ink: "var(--text-muted)",
    onDark: "var(--text-on-dark-muted)",
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        fontFamily: "var(--font-body)",
        fontSize: "var(--text-overline)",
        fontWeight: "var(--weight-medium)" as unknown as number,
        letterSpacing: "var(--tracking-overline)",
        textTransform: "uppercase",
        color: colors[tone] || colors.gold,
        ...style,
      }}
      {...rest}
    >
      {rule ? <span style={{ width: 28, height: 1, background: "currentColor", opacity: 0.5 }} /> : null}
      {children}
    </span>
  );
}
