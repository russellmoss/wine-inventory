import * as React from "react";

/**
 * Surface container — white on paper, soft warm shadow, ecru hairline.
 * @startingPoint section="Core" subtitle="Brand card surface" viewport="700x220"
 */
export interface CardProps {
  children?: React.ReactNode;
  /** Adds hover lift + pointer cursor. @default false */
  interactive?: boolean;
  /** CSS padding value. @default "var(--space-5)" */
  padding?: string;
  /** Element tag to render. @default "div" */
  as?: keyof JSX.IntrinsicElements;
  style?: React.CSSProperties;
}

/** Surface container. */
export function Card(props: CardProps): JSX.Element;
