"use client";

import React from "react";
import { TimeSeriesChart, Metric, EmptyState, Skeleton } from "@/components/ui";
import type { TankDetailFacts } from "@/lib/vessels/tank-detail-facts";

/**
 * The Fermentation tab (SC-11) — the Brix + temperature curve, and the numbers.
 *
 * AC-S27 is held here by construction: every number on this panel comes out of
 * `facts.formatted`, and `facts.ariaSentence` is composed from those same strings. This
 * component does not format a single value itself. If you find yourself reaching for
 * `toFixed` in this file, the invariant is already broken.
 *
 * No yeast temperature floor line: DM-44 is class D ("yeast strain and its temperature range
 * are not modelled") with the instruction to omit it until the model exists. An annotation
 * whose source we cannot name is exactly the kind that ends up contradicting the numbers.
 */
export function TankFermentPanel({
  facts,
  loading,
  onRecordReading,
}: {
  facts: TankDetailFacts | null;
  loading: boolean;
  onRecordReading?: () => void;
}) {
  // The chart area reserves its exact height while loading (SC-11), so the panel does not
  // jump when the curve arrives.
  if (loading && !facts) {
    return (
      <div>
        <Skeleton variant="block" height={180} label="Loading readings…" />
      </div>
    );
  }

  if (!facts || facts.series.length === 0) {
    return (
      <EmptyState
        title="No readings yet for this tank"
        actions={
          onRecordReading ? (
            <button type="button" onClick={onRecordReading} style={{ minHeight: "var(--touch-min)" }}>
              Record a reading
            </button>
          ) : null
        }
      >
        Record one and the curve appears here.
      </EmptyState>
    );
  }

  const f = facts.formatted;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", marginBottom: 14 }}>
        {f.latestBrix ? <Metric size="sm" caption="Latest Brix" value={f.latestBrix} /> : null}
        {f.brixDelta ? <Metric size="sm" caption="Since the reading before" value={f.brixDelta} /> : null}
        {f.latestTemp ? <Metric size="sm" caption="Latest temperature" value={f.latestTemp} /> : null}
        {f.tempDelta ? <Metric size="sm" caption="Temperature change" value={f.tempDelta} /> : null}
      </div>

      {/* caption doubles as the svg's accessible name (doc 10 §9), and it is the SAME
          sentence the metrics above are built from. */}
      <TimeSeriesChart
        series={facts.series}
        caption={facts.ariaSentence}
        height={180}
        leftUnit="Bx"
        rightUnit="°C"
        tableVisibility="disclosure"
      />
    </div>
  );
}
