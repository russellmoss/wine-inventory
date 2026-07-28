"use client";

import React from "react";
import { TimeSeriesChart, Metric, EmptyState, Skeleton, Button } from "@/components/ui";
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
  error = false,
  onRetry,
}: {
  facts: TankDetailFacts | null;
  loading: boolean;
  /** A failed read is NOT an empty tank. See the error branch below. */
  error?: boolean;
  onRetry?: () => void;
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

  // A failed read must never render as "no readings". One is a fact about the cellar, the
  // other is a fact about the network, and on a ferment screen the difference is whether a
  // winemaker believes nobody has sampled this tank.
  if (error) {
    return (
      <EmptyState
        title="Couldn't load this tank's readings"
        actions={onRetry ? <Button size="sm" onClick={onRetry}>Try again</Button> : null}
      >
        The Brix and temperature history could not be read. This is not the same as there being none.
      </EmptyState>
    );
  }

  if (!facts || facts.series.length === 0) {
    return (
      <EmptyState title="No readings yet for this tank">Record one and the curve appears here.</EmptyState>
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
