import * as React from "react";

/**
 * The Savvy action button — gold primary, ink outline secondary, quiet ghost.
 * @startingPoint section="Core" subtitle="Brand button — primary, secondary, ghost, inverse" viewport="700x150"
 */
export interface ButtonProps {
  children?: React.ReactNode;
  /** Visual style. @default "primary" */
  variant?: "primary" | "secondary" | "ghost" | "inverse" | "link";
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  disabled?: boolean;
  fullWidth?: boolean;
  type?: "button" | "submit" | "reset";
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  style?: React.CSSProperties;
}

/** The Savvy action button. */
export function Button(props: ButtonProps): JSX.Element;
