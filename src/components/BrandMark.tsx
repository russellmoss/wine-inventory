import React from "react";

/* eslint-disable @next/next/no-img-element -- brand SVGs are static assets; next/image adds no value and needs dangerouslyAllowSVG. */

/**
 * Cellarhand brand assets (design-system/assets/logos, wired into /public/brand).
 * The app is light-only (cream surfaces), so we use the ink logo art. The favicon
 * (src/app/icon.svg) is the mark alone; these render the fuller lockups.
 */

const MARK = "/brand/cellarhand-mark.svg";
const FULL = "/brand/cellarhand-logo-full.svg";

/** Mark-only emblem (grape + hand), sized by height. Used in compact spots. */
export function BrandEmblem({ size = 36, title = "Cellarhand" }: { size?: number; title?: string }) {
  return (
    <img src={MARK} alt={title} height={size} style={{ height: size, width: "auto", flex: "0 0 auto" }} />
  );
}

export interface BrandMarkProps {
  /** "app" = sidebar/header lockup; "auth" = larger login lockup. */
  variant?: "app" | "auth";
}

/** Full Cellarhand lockup (mark + wordmark) used in the app shell and login. */
export function BrandMark({ variant = "app" }: BrandMarkProps) {
  const height = variant === "auth" ? 46 : 34;
  return (
    <img
      src={FULL}
      alt="Cellarhand"
      height={height}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
