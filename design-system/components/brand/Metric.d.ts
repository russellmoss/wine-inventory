import * as React from "react";

/**
 * The deck's "Metric # / Caption" stat block.
 * @startingPoint section="Brand" subtitle="Big-figure stat block" viewport="700x200"
 */
export interface MetricProps {
  /** The figure, e.g. "$2.4B" or "98%". */
  value?: React.ReactNode;
  /** Supporting caption beneath. */
  caption?: React.ReactNode;
  /** @default "left" */
  align?: "left" | "center";
  /** Gold top rule. @default true */
  rule?: boolean;
  /** Render the figure in Big Caslon. @default false */
  serif?: boolean;
  /** @default "md" */
  size?: "sm" | "md" | "lg";
  style?: React.CSSProperties;
}

/** The deck's "Metric # / Caption" stat block. */
export function Metric(props: MetricProps): JSX.Element;
