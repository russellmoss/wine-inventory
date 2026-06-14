import * as React from "react";

export interface EyebrowProps {
  children?: React.ReactNode;
  /** @default "gold" */
  tone?: "gold" | "ink" | "onDark";
  /** Show a leading hairline rule. @default false */
  rule?: boolean;
  style?: React.CSSProperties;
}

/** Uppercase, tracked kicker label that sits above a title. */
export function Eyebrow(props: EyebrowProps): JSX.Element;
