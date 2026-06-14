import * as React from "react";

export interface AvatarProps {
  /** Image URL. Falls back to initials when absent. */
  src?: string;
  /** Full name — used for initials and alt text. */
  name?: string;
  /** Pixel diameter. @default 40 */
  size?: number;
  /** Tint for the initials fallback. @default "gold" */
  tone?: "gold" | "green" | "blue" | "maroon" | "ink";
  style?: React.CSSProperties;
}

/** Circular avatar — image or tinted initials. */
export function Avatar(props: AvatarProps): JSX.Element;
