"use client";

import React from "react";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLElement>, "style"> {
  interactive?: boolean;
  padding?: string;
  as?: keyof React.JSX.IntrinsicElements;
  style?: React.CSSProperties;
}

/**
 * Card — white surface on paper, gentle 16px corners, hairline sand border,
 * soft warm shadow. Lifts subtly on hover when interactive.
 */
export function Card({
  children,
  interactive = false,
  padding = "var(--space-5)",
  as = "div",
  style,
  ...rest
}: CardProps) {
  const [hover, setHover] = React.useState(false);
  const Tag = as as React.ElementType;

  const styles: React.CSSProperties = {
    background: "var(--surface-raised)",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-lg)",
    boxShadow: interactive && hover ? "var(--shadow-md)" : "var(--shadow-sm)",
    padding,
    transition:
      "box-shadow var(--duration-normal) var(--ease-out), border-color var(--duration-normal) var(--ease-out), transform var(--duration-normal) var(--ease-out)",
    transform: interactive && hover ? "translateY(-2px)" : "none",
    cursor: interactive ? "pointer" : "default",
  };

  return (
    <Tag
      style={{ ...styles, ...style }}
      onMouseEnter={interactive ? () => setHover(true) : undefined}
      onMouseLeave={interactive ? () => setHover(false) : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
