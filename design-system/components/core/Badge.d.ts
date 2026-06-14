import * as React from "react";

export interface BadgeProps {
  children?: React.ReactNode;
  /** Color role. @default "neutral" */
  tone?: "neutral" | "gold" | "green" | "blue" | "maroon" | "red";
  /** Fill style. @default "soft" */
  variant?: "soft" | "solid" | "outline";
  /** Uppercase tracked "eyebrow" treatment. @default false */
  uppercase?: boolean;
  style?: React.CSSProperties;
}

/** Small status / category label in the brand palette. */
export function Badge(props: BadgeProps): JSX.Element;
