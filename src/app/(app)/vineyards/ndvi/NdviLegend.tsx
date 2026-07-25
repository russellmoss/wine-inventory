"use client";

import { useMemo } from "react";
import { PALETTES, VIGOR_CLASSIC, reversePalette, legendStops, colorAtNormalized, type ColorDomain, type ColorScaleMode } from "@/lib/gis/color";

export type DisplayMetaLite = {
  wgs84Bbox: [number, number, number, number] | null;
  acquiredAt: string | null;
  sourceResolutionM: number;
  validPixelCount: number;
  domain: ColorDomain & { clamped: boolean };
  histogram: { edges: number[]; counts: number[]; total: number };
};

const rgb = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`;

export function NdviLegend({
  meta,
  paletteId,
  reverse,
  mode,
}: {
  meta: DisplayMetaLite;
  paletteId: string;
  reverse: boolean;
  mode: ColorScaleMode;
}) {
  const palette = useMemo(() => {
    const base = PALETTES.find((p) => p.id === paletteId) ?? VIGOR_CLASSIC;
    return reverse ? reversePalette(base) : base;
  }, [paletteId, reverse]);

  const { domain, histogram } = meta;
  const spread = domain.max - domain.min;
  const gradient = useMemo(() => {
    const stops = legendStops(domain, palette, 7).map((s, i, arr) => `${rgb(s.color)} ${(i / (arr.length - 1)) * 100}%`);
    return `linear-gradient(to right, ${stops.join(", ")})`;
  }, [domain, palette]);

  const maxCount = Math.max(1, ...histogram.counts);

  return (
    <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
      {/* Value histogram over the colour ramp. */}
      <div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 44 }}>
          {histogram.counts.map((c, i) => {
            const t = histogram.counts.length === 1 ? 0 : i / (histogram.counts.length - 1);
            return (
              <div
                key={i}
                title={`${(histogram.edges[i] ?? 0).toFixed(2)}–${(histogram.edges[i + 1] ?? 0).toFixed(2)}: ${Math.round(c)}`}
                style={{ flex: 1, height: `${(c / maxCount) * 100}%`, minHeight: c > 0 ? 2 : 0, background: rgb(colorAtNormalized(t, palette)), borderRadius: "1px 1px 0 0" }}
              />
            );
          })}
        </div>
        <div style={{ height: 12, borderRadius: 3, background: gradient, marginTop: 3 }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
          <span>{domain.min.toFixed(2)}</span>
          <span>NDVI</span>
          <span>{domain.max.toFixed(2)}</span>
        </div>
      </div>

      {/* Honesty badges. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, fontSize: 11 }}>
        <Badge tone="neutral">{`${meta.sourceResolutionM} m source · display ${mode === "VINEYARD_SCENE" ? "p5–p95" : mode.toLowerCase()}`}</Badge>
        <Badge tone="neutral">{`spread ${spread.toFixed(2)}`}</Badge>
        {meta.acquiredAt && <Badge tone="neutral">{`acquired ${meta.acquiredAt.slice(0, 10)}`}</Badge>}
        {domain.clamped && <Badge tone="warn">near-uniform — domain padded to 0.15 (colour spread is not real vigor)</Badge>}
        {!domain.clamped && domain.narrow && <Badge tone="warn">narrow domain — small colour differences are within scene noise</Badge>}
        {domain.degenerate && <Badge tone="warn">every value identical</Badge>}
      </div>
      <p style={{ margin: 0, fontSize: 11, color: "var(--text-secondary)" }}>
        Estate AOI, masked to valid pixels (cloud/shadow removed). Contains modified Copernicus Sentinel data.
      </p>
    </div>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "neutral" | "warn" }) {
  const warn = tone === "warn";
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 999,
        border: `1px solid ${warn ? "var(--warning, #b26a00)" : "var(--border)"}`,
        color: warn ? "var(--warning, #b26a00)" : "var(--text-secondary)",
        background: warn ? "var(--warning-bg, #fff6e6)" : "transparent",
      }}
    >
      {children}
    </span>
  );
}
