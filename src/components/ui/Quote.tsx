import React from "react";

export interface QuoteProps extends Omit<React.HTMLAttributes<HTMLElement>, "style"> {
  name?: string;
  role?: string;
  onDark?: boolean;
  align?: "left" | "center";
  style?: React.CSSProperties;
}

/**
 * Quote — testimonial / mission block led by an oversized serif quote mark.
 * Big Caslon quote text with name + role attribution. `onDark` for the dark register.
 */
export function Quote({
  children,
  name,
  role,
  onDark = false,
  align = "left",
  style,
  ...rest
}: QuoteProps) {
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
      <span
        aria-hidden="true"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 72,
          lineHeight: 0.7,
          color: "var(--accent)",
          height: 40,
        }}
      >
        &ldquo;
      </span>
      <blockquote
        style={{
          margin: 0,
          fontFamily: "var(--font-display)",
          fontWeight: "var(--weight-regular)" as unknown as number,
          fontSize: 30,
          lineHeight: 1.32,
          color: textColor,
        }}
      >
        {children}
      </blockquote>
      {name || role ? (
        <figcaption style={{ display: "flex", flexDirection: "column", gap: 2, fontFamily: "var(--font-body)" }}>
          {name ? (
            <span style={{ fontSize: 15, fontWeight: "var(--weight-semibold)" as unknown as number, color: textColor }}>
              {name}
            </span>
          ) : null}
          {role ? <span style={{ fontSize: 13.5, color: mutedColor }}>{role}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
