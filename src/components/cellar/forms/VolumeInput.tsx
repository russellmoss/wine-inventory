"use client";

import React from "react";
import { volumeUnitLabel, type VolumeUnit } from "@/lib/units/display";
import { fieldStyle } from "./shared";

/**
 * Plan 098 U9 — a volume input with the unit rendered as an inline, non-editable adornment
 * INSIDE the box (council Gemini SF2: a misread unit on a transfer overflows a real tank).
 * Controlled; the caller owns hydrate/parse via volumeInputValue / volumeInputToLiters so the
 * dirty check (an untouched field never re-saves a re-converted value) stays with the state.
 */
export function VolumeInput({
  value,
  onChange,
  unit,
  placeholder,
  ariaLabel,
  width = 110,
  title,
}: {
  value: string;
  onChange: (raw: string) => void;
  unit: VolumeUnit;
  placeholder?: string;
  ariaLabel: string;
  width?: number;
  title?: string;
}) {
  const label = volumeUnitLabel(unit);
  return (
    <span style={{ position: "relative", display: "inline-flex", width }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        title={title}
        aria-label={ariaLabel}
        style={{ ...fieldStyle, width: "100%", paddingRight: label.length > 2 ? 38 : 30 }}
      />
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 10,
          top: "50%",
          transform: "translateY(-50%)",
          pointerEvents: "none",
          fontSize: 12,
          color: "var(--text-muted)",
        }}
      >
        {label}
      </span>
    </span>
  );
}
