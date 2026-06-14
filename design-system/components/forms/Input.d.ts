import * as React from "react";

/**
 * Labeled text field with hint/error states and soft gold focus ring.
 * @startingPoint section="Forms" subtitle="Brand text field" viewport="700x140"
 */
export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size" | "style"> {
  label?: string;
  hint?: string;
  error?: string;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  iconLeft?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
}

/** Labeled text field with hint/error states. */
export function Input(props: InputProps): JSX.Element;
