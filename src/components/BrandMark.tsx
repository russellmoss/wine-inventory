import React from "react";

/**
 * Bhutan Wine Company brand emblem: a grape cluster + a wine glass, in the wine
 * accent (token-driven via currentColor) with a deep-green leaf. Sits on cream
 * surfaces (sidebar, login). The favicon (src/app/icon.svg) is the wine glass
 * alone; this is the fuller logo mark.
 */
export function BrandEmblem({ size = 36, title = "BWC Operating System" }: { size?: number; title?: string }) {
  const height = Math.round((size * 48) / 56);
  return (
    <svg
      width={size}
      height={height}
      viewBox="0 0 56 48"
      fill="none"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
      style={{ color: "var(--wine-primary)", flex: "0 0 auto" }}
    >
      {/* grape stem */}
      <path d="M14 14 C14 11 14 9 15 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {/* leaf */}
      <path d="M15.5 7.5 C18.5 5 22 6 21.5 9.5 C18.5 10.5 15.5 9.5 15.5 7.5 Z" style={{ fill: "var(--deep-green)" }} />
      <g fill="currentColor">
        {/* grape cluster */}
        <circle cx="10" cy="15.5" r="3.7" />
        <circle cx="18" cy="15.5" r="3.7" />
        <circle cx="6" cy="22.5" r="3.7" />
        <circle cx="14" cy="22.5" r="3.7" />
        <circle cx="22" cy="22.5" r="3.7" />
        <circle cx="10" cy="29.5" r="3.7" />
        <circle cx="18" cy="29.5" r="3.7" />
        <circle cx="14" cy="36" r="3.7" />
        {/* wine glass */}
        <path d="M33 11 H49 C49 22 44 28 41 28 C38 28 33 22 33 11 Z" />
        <rect x="39.4" y="27" width="3.2" height="9.6" rx="1" />
        <rect x="34" y="35.6" width="14" height="3" rx="1.5" />
      </g>
    </svg>
  );
}

export interface BrandMarkProps {
  /** "app" = sidebar/header lockup; "auth" = larger login lockup with the BWC monogram. */
  variant?: "app" | "auth";
}

/** Emblem + wordmark lockup used in the app shell and on the login screen. */
export function BrandMark({ variant = "app" }: BrandMarkProps) {
  if (variant === "auth") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <BrandEmblem size={54} />
        <div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 40,
              lineHeight: 1,
              letterSpacing: "0.01em",
              color: "var(--text-primary)",
            }}
          >
            BWC
          </div>
          <div className="ds-eyebrow" style={{ marginTop: 6 }}>
            Operating System
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <BrandEmblem size={34} />
      <div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1, letterSpacing: "0.01em", color: "var(--text-primary)" }}>
          BWC
        </div>
        <div className="ds-eyebrow" style={{ marginTop: 5 }}>
          Operating System
        </div>
      </div>
    </div>
  );
}
