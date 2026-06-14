import * as React from "react";

/**
 * Testimonial / mission block led by the oversized serif quote mark.
 * @startingPoint section="Brand" subtitle="Editorial quote block" viewport="760x300"
 */
export interface QuoteProps {
  /** The quote text. */
  children?: React.ReactNode;
  name?: string;
  role?: string;
  /** Dramatic black register with white quote mark. @default false */
  onDark?: boolean;
  /** Override the quote-mark image path (defaults to the bundled asset). */
  markSrc?: string;
  /** @default "left" */
  align?: "left" | "center";
  style?: React.CSSProperties;
}

/** Testimonial / mission block. */
export function Quote(props: QuoteProps): JSX.Element;
