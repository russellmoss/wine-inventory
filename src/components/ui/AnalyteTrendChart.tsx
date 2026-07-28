"use client";

import React from "react";
import { TimeSeriesChart } from "./TimeSeriesChart";

// Per-analyte trend chart. As of the v2 consolidation this is a THIN WRAPPER over
// TimeSeriesChart — it and BrixChart were two components doing one job on the same
// scale math (doc 06 §31). Kept so the existing call site migrates on its own
// schedule instead of in the same commit as the consolidation.

export type TrendPoint = { date: number; value: number }; // date = epoch ms

export interface AnalyteTrendChartProps {
  label: string;
  unit: string;
  points: TrendPoint[];
  /** Optional target band (e.g. free-SO₂ target range) drawn as threshold lines. */
  targetBand?: { min?: number; max?: number };
  /** Decimal places for value labels/tooltips. */
  precision?: number;
  height?: number;
  style?: React.CSSProperties;
}

/**
 * Thin wrapper over TimeSeriesChart, kept for one release so the existing call
 * site migrates on its own schedule rather than in the same commit as the
 * consolidation (v2 doc 06 §31 — two components were doing one job).
 *
 * The target band becomes two labelled threshold lines. A shaded rect carried no
 * information a screen reader could reach; a labelled line does, and the label
 * states the value AND its meaning.
 */
export function AnalyteTrendChart({
  label,
  unit,
  points,
  targetBand,
  precision = 1,
  height = 300,
  style,
}: AnalyteTrendChartProps) {
  const thresholds = [
    targetBand?.min != null ? { value: targetBand.min, label: `min ${targetBand.min} ${unit}` } : null,
    targetBand?.max != null ? { value: targetBand.max, label: `max ${targetBand.max} ${unit}` } : null,
  ].filter((t): t is { value: number; label: string } => t !== null);

  return (
    <TimeSeriesChart
      caption={`${label} over time`}
      leftUnit={unit}
      height={height}
      style={style}
      thresholds={thresholds}
      emptyMessage={`No ${label.toLowerCase()} readings yet.`}
      series={[{ id: "series", label, unit, points, precision, viz: 1 }]}
    />
  );
}
