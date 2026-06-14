import React from "react";

/**
 * Savvy Quote — testimonial / mission block led by the oversized serif
 * quote-mark graphic. Big Caslon quote text with a name + role attribution.
 * Set `onDark` for the brand's dramatic black register.
 */
export function Quote({
  children,
  name,
  role,
  onDark = false,
  markSrc,
  align = "left",
  style,
  ...rest
}) {
  const mark = markSrc || (onDark
    ? "../../assets/illustrations/quote-white.png"
    : "../../assets/illustrations/quote-gold.png");
  const textColor = onDark ? "var(--text-on-dark)" : "var(--text-primary)";
  const mutedColor = onDark ? "var(--text-on-dark-muted)" : "var(--text-muted)";

  return (
    <figure
      style={{
        margin: 0,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        textAlign: align,
        alignItems: align === "center" ? "center" : "flex-start",
        maxWidth: 760,
        ...style,
      }}
      {...rest}
    >
      <img src={mark} alt="" aria-hidden="true" style={{ height: 44, width: "auto", opacity: onDark ? 1 : 0.95 }} />
      <blockquote
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontWeight: "var(--weight-regular)",
          fontSize: 30,
          lineHeight: 1.32,
          color: textColor,
        }}
      >
        {children}
      </blockquote>
      {(name || role) ? (
        <figcaption
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 2,
            fontFamily: "var(--font-body)",
          }}
        >
          {name ? <span style={{ fontSize: 15, fontWeight: "var(--weight-semibold)", color: textColor }}>{name}</span> : null}
          {role ? <span style={{ fontSize: 13.5, color: mutedColor }}>{role}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
