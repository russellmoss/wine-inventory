"use client";

import React from "react";
import { buttonMetrics, type ButtonSize } from "./button-sizes";

type Variant = "primary" | "secondary" | "ghost" | "inverse" | "link";
type Size = ButtonSize;

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "style"> {
  variant?: Variant;
  size?: Size;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  /**
   * In flight. Sets `aria-busy`, blocks pointer AND keyboard activation, and
   * swaps the label for `pendingLabel` without changing the button's width.
   */
  pending?: boolean;
  /**
   * Present-participle label shown while `pending` ("Recording…"). The resting
   * label reserves the width, so keep this no wider than the resting label —
   * that is what makes the button hold its exact size mid-submit.
   */
  pendingLabel?: string;
  style?: React.CSSProperties;
}

/**
 * Button — the primary action control. Wine solid for primary; ink outline /
 * quiet ghost for the rest. Sentence-case labels.
 *
 * Heights are 44/48/56/68 (v2 §B6) — 44px is the floor at every width, not a
 * phone-only rule. See ./button-sizes.ts.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  disabled = false,
  fullWidth = false,
  pending = false,
  pendingLabel,
  type = "button",
  style,
  onClick,
  onKeyDown,
  onFocus,
  onBlur,
  ...rest
}: ButtonProps) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const [focusRing, setFocusRing] = React.useState(false);

  const s = buttonMetrics(size);
  const inert = disabled || pending;

  const base: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: s.gap,
    height: s.height,
    padding: s.padding,
    fontFamily: "var(--font-body)",
    fontSize: s.fontSize,
    fontWeight: "var(--weight-medium)" as unknown as number,
    lineHeight: 1,
    letterSpacing: "var(--tracking-normal)",
    borderRadius: "var(--radius-md)",
    // Longhand (not the `border` shorthand) so variants can override `borderColor`
    // alone without React 19's shorthand/longhand conflict warning.
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: "transparent",
    cursor: disabled ? "not-allowed" : pending ? "progress" : "pointer",
    width: fullWidth ? "100%" : "auto",
    transition:
      "background var(--duration-fast) var(--ease-standard), color var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard), box-shadow var(--duration-fast) var(--ease-standard), transform var(--duration-fast) var(--ease-standard)",
    transform: active && !inert ? "translateY(0.5px)" : "none",
    whiteSpace: "nowrap",
    userSelect: "none",
  };

  const variants: Record<Variant, React.CSSProperties> = {
    primary: {
      background: active ? "var(--accent-press)" : hover ? "var(--accent-hover)" : "var(--accent)",
      color: "var(--accent-on)",
      boxShadow: hover && !inert ? "var(--shadow-sm)" : "none",
    },
    secondary: {
      background: hover ? "var(--paper-100)" : "var(--surface-raised)",
      color: "var(--text-primary)",
      borderColor: "var(--border-strong)",
    },
    ghost: {
      background: hover ? "var(--accent-soft)" : "transparent",
      color: "var(--text-accent)",
    },
    inverse: {
      background: hover ? "var(--paper-50)" : "var(--white)",
      color: "var(--ink)",
    },
    // v2 §B6: `link` used to be `height: auto; padding: 0`, which floated it off
    // the baseline beside its 48px siblings and made it indistinguishable from
    // `ghost`. It now shares the sibling height and carries a persistent underline.
    link: {
      background: "transparent",
      color: "var(--text-accent)",
      textDecoration: "underline",
      textUnderlineOffset: "3px",
      textDecorationThickness: hover ? "2px" : "1px",
    },
  };

  /**
   * v2 §B6 "CHANGED — disabled": `opacity: 0.45` over cream reads as a mauve
   * variant of the button rather than an unavailable control. A real surface says
   * it plainly. Applied after the variant so it wins on every variant.
   */
  const disabledLook: React.CSSProperties = disabled
    ? {
        background: "var(--paper-200)",
        color: "var(--ink-600)",
        borderColor: "var(--paper-300)",
        boxShadow: "none",
        textDecorationColor: "var(--ink-600)",
      }
    : {};

  const merged: React.CSSProperties = {
    ...base,
    ...(variants[variant] || variants.primary),
    ...disabledLook,
    ...style,
  };

  /**
   * The focus ring, applied LAST and unconditionally.
   *
   * The global `:focus-visible` rule in tokens/base.css sets `box-shadow`, but an
   * inline `boxShadow` (which `primary` sets on every render, and which a caller's
   * `style` prop may set too) beats any stylesheet selector. So the global rule
   * never reached this component. Re-deriving `:focus-visible` here is the fix —
   * `matches()` keeps the keyboard-only semantics rather than ringing on click.
   */
  if (focusRing) merged.boxShadow = "var(--shadow-focus)";

  const label = pending && pendingLabel ? pendingLabel : null;

  return (
    <button
      // `rest` first, so the handlers and ARIA below cannot be silently clobbered
      // by a caller passing its own onFocus/onBlur/aria-busy.
      {...rest}
      type={type}
      disabled={disabled}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      onFocus={(e) => {
        // `:focus-visible` is not expressible inline; ask the element directly.
        let visible = true;
        try {
          visible = e.currentTarget.matches(":focus-visible");
        } catch {
          /* engine without :focus-visible — ring on every focus rather than none */
        }
        setFocusRing(visible);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocusRing(false);
        onBlur?.(e);
      }}
      onClick={(e) => {
        // aria-busy alone does not stop a double-submit; the guard does.
        if (pending) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick?.(e);
      }}
      onKeyDown={(e) => {
        if (pending && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          return;
        }
        onKeyDown?.(e);
      }}
      style={merged}
    >
      {/* The resting content stays in flow even while pending — it is what reserves
          the width, so the button cannot resize mid-submit. */}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: s.gap,
          visibility: label ? "hidden" : "visible",
        }}
      >
        {iconLeft ? <span style={{ display: "inline-flex" }}>{iconLeft}</span> : null}
        {children}
        {iconRight ? <span style={{ display: "inline-flex" }}>{iconRight}</span> : null}
      </span>
      {label ? (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      ) : null}
    </button>
  );
}
