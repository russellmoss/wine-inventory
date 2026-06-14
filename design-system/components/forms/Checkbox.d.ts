import * as React from "react";

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean, e: React.ChangeEvent<HTMLInputElement>) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  style?: React.CSSProperties;
}

/** Square checkbox with gold fill when checked. */
export function Checkbox(props: CheckboxProps): JSX.Element;
