"use client";

import React from "react";
import { TimeSeriesChart, type ChartMarker } from "./TimeSeriesChart";

export type BrixChartSeries = {
  blockId: string;
  label: string;
  color: string;
  points: { date: number; brix: number }[]; // date = epoch ms
};

export type BrixChartMarker = { blockId: string; date: number; brix: number | null };

export interface BrixChartProps {
  series: BrixChartSeries[];
  /** Harvest picks to overlay (rendered where their Brix is known). */
  markers?: BrixChartMarker[];
  /** SVG user-space height; width is responsive. */
  height?: number;
  style?: React.CSSProperties;
}

/**
 * Brix-over-time, one line per block, with optional harvest-pick markers.
 *
 * As of the v2 consolidation this is a THIN WRAPPER over TimeSeriesChart (doc 06
 * §31). Block colours are variety colours, so they are passed through explicitly
 * rather than taking the --viz-* palette — but each series still gets a distinct
 * dash and marker from the shared encoding, so the chart survives greyscale and
 * colour-vision deficiency even when its hues are caller-chosen.
 */
export function BrixChart({ series, markers = [], height = 300, style }: BrixChartProps) {
  return (
    <TimeSeriesChart
      caption="Brix over time by block"
      leftUnit="Brix"
      height={height}
      style={style}
      emptyMessage="No Brix readings yet for this vineyard. Log readings in the manager view and the ripening curve appears here."
      series={series.map((s) => ({
        id: s.blockId,
        label: s.label,
        unit: "Brix",
        color: s.color,
        points: s.points.map((p) => ({ date: p.date, value: p.brix })),
      }))}
      markers={markers.map<ChartMarker>((m) => ({ seriesId: m.blockId, date: m.date, value: m.brix }))}
    />
  );
}
