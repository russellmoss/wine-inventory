import React from "react";

/**
 * Savvy Avatar — circular, warm. Shows an image, or initials on a
 * tinted brand fill when no image is supplied.
 */
export function Avatar({ src, name = "", size = 40, tone = "gold", style, ...rest }) {
  const tones = {
    gold:   { bg: "var(--accent-soft)", fg: "var(--savvy-gold)" },
    green:  { bg: "rgba(23,82,66,0.12)", fg: "var(--deep-green)" },
    blue:   { bg: "rgba(9,89,114,0.12)", fg: "var(--deep-blue)" },
    maroon: { bg: "rgba(107,72,77,0.14)", fg: "var(--maroon)" },
    ink:    { bg: "var(--paper-200)", fg: "var(--ink-800)" },
  };
  const t = tones[tone] || tones.gold;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const styles = {
    width: size,
    height: size,
    borderRadius: "var(--radius-pill)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flex: "none",
    background: t.bg,
    color: t.fg,
    fontFamily: "var(--font-body)",
    fontWeight: "var(--weight-semibold)",
    fontSize: Math.round(size * 0.38),
    letterSpacing: "0.02em",
    border: "1px solid var(--border-subtle)",
    userSelect: "none",
  };

  return (
    <span style={{ ...styles, ...style }} {...rest}>
      {src ? (
        <img src={src} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        initials || "—"
      )}
    </span>
  );
}
