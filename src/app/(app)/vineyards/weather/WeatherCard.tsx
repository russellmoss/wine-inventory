"use client";

// VI-P8 Unit 10 — the grower climate card. Simple on top (one-glance headline in the PRIMARY source's
// numbers), robust underneath (a "Compare sources" disclosure reveals the spread + per-source completeness +
// honesty lines). Renders offline from the stored summary. DESIGN.md tokens only.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClimateSummary } from "@/lib/weather/read-core";
import { coverageLabel, gddComparisonLabel, sparklinePoints, trustLabel } from "@/lib/weather/card-core";
import { refreshVineyardWeatherCurrentSeason } from "@/lib/weather/actions";

type VineyardOpt = { id: string; name: string };

const card: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 12,
  padding: 18,
  background: "var(--color-surface)",
};
const label: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--color-text-muted)" };
const big: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 40, lineHeight: 1.05 };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={label}>{title}</div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

export function WeatherCard({
  vineyards,
  selectedId,
  summary,
}: {
  vineyards: VineyardOpt[];
  selectedId: string | null;
  summary: ClimateSummary | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showCompare, setShowCompare] = useState(false);

  async function refresh() {
    if (!selectedId) return;
    setBusy(true);
    setErr(null);
    const res = await refreshVineyardWeatherCurrentSeason(selectedId);
    setBusy(false);
    if (!res.ok) setErr(res.error);
    else router.refresh();
  }

  const h = summary?.headline;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={selectedId ?? ""}
          onChange={(e) => startTransition(() => router.push(`/vineyards/weather?vineyard=${e.target.value}`))}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text)" }}
          aria-label="Vineyard"
        >
          {vineyards.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button
          onClick={refresh}
          disabled={busy || pending || !selectedId}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--color-border)", background: "var(--color-accent)", color: "var(--color-on-accent, #fff)", cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "Refreshing…" : "Refresh weather"}
        </button>
        {summary?.lastRefreshAt && (
          <span style={{ ...label, textTransform: "none" }}>Updated {new Date(summary.lastRefreshAt).toLocaleString()}</span>
        )}
      </div>

      {err && <div style={{ ...card, borderColor: "var(--color-danger, #c0392b)", color: "var(--color-danger, #c0392b)" }}>{err}</div>}

      {!summary || !h ? (
        <div style={card}>
          <p style={{ margin: 0 }}>No weather has been pulled for this vineyard yet.</p>
          <p style={{ ...label, textTransform: "none", marginTop: 6 }}>Click <strong>Refresh weather</strong> to fetch this season from the terrain-aware gridded products + your nearest station.</p>
        </div>
      ) : (
        <>
          {/* Headline — in the PRIMARY source's numbers (R14). */}
          <div style={{ ...card, display: "grid", gap: 10 }}>
            <div style={label}>Season {summary.seasonYear} · Growing Degree Days (base 10 °C)</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={big}>{h.seasonGddC.toLocaleString()}</span>
              <span style={{ color: "var(--color-text-muted)" }}>GDD to date · {trustLabel(h.gddCompletenessPct)} confidence ({h.gddCompletenessPct}% of season)</span>
            </div>
            <div style={{ color: "var(--color-text)" }}>{gddComparisonLabel(h.priorYear?.deltaC ?? null)}</div>
            {h.gddCumulative.length > 1 && (
              <svg viewBox="0 0 320 60" width="100%" height="60" role="img" aria-label="Cumulative GDD this season" style={{ maxWidth: 480 }}>
                <polyline points={sparklinePoints(h.gddCumulative.map((p) => ({ date: p.date, cumC: p.cumC })), 320, 60, 3)} fill="none" stroke="var(--color-accent)" strokeWidth={2} />
              </svg>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Panel title="Winkler region">
              <div style={big}>{h.winkler.region}</div>
              {h.winkler.nearBoundary && (
                <div style={{ ...label, textTransform: "none", color: "var(--color-warning, #b8860b)" }}>
                  Only {h.winkler.nearestBoundaryDeltaC} GDD from the next class — treat as approximate.
                </div>
              )}
            </Panel>
            <Panel title="Growing-season temp (Jones)">
              <div style={big}>{h.gst.gstC ?? "—"}°C</div>
              <div style={{ ...label, textTransform: "none" }}>{h.gst.group ?? ""}</div>
            </Panel>
            <Panel title="Frost — vulnerable window">
              <div>{h.frost.vulnerableWindow.startIso} → {h.frost.vulnerableWindow.endIso}</div>
              <div style={{ marginTop: 4 }}>
                <strong>{h.frost.lightCount}</strong> light (≤0 °C) · <strong>{h.frost.killingCount}</strong> killing (≤−2 °C)
              </div>
              <div style={{ ...label, textTransform: "none", marginTop: 4 }}>Elevated-risk signal → check the vines. Not a damage report.</div>
            </Panel>
            <Panel title="Heat & rain">
              <div><strong>{h.heat.daysOverByThreshold["35"]}</strong> days ≥ 35 °C</div>
              <div style={{ marginTop: 4 }}><strong>{h.rainfall.totalMm}</strong> mm rain</div>
              <div style={{ ...label, textTransform: "none", marginTop: 4 }}>Regional Rainfall Estimate (≈4 km average, not your rain gauge).</div>
            </Panel>
          </div>

          {/* Station-vs-site + provider panel. */}
          <Panel title="Where this estimate comes from">
            <div style={{ display: "grid", gap: 4 }}>
              <div>Primary source: <strong>{summary.primaryProviderKey}</strong> · Coverage: {coverageLabel(summary.coverageState)}</div>
              {summary.station.name && (
                <div>
                  Nearest station: <strong>{summary.station.name}</strong>
                  {summary.station.distanceM != null && ` · ${Math.round(summary.station.distanceM / 100) / 10} km away`}
                  {summary.siteElevationM != null && ` · site ${Math.round(summary.siteElevationM)} m`}
                </div>
              )}
              {summary.attribution && <div style={{ ...label, textTransform: "none" }}>{summary.attribution}</div>}
            </div>
          </Panel>

          {/* Progressive disclosure — the spread, never a blend. */}
          <div style={card}>
            <button
              onClick={() => setShowCompare((s) => !s)}
              style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", padding: 0, fontSize: 14 }}
              aria-expanded={showCompare}
            >
              {showCompare ? "▾ Hide" : "▸ Compare sources / data trust"}
            </button>
            {showCompare && (
              <div style={{ marginTop: 12 }}>
                {summary.spread && (
                  <p style={{ marginTop: 0 }}>
                    GDD across sources: <strong>{summary.spread.min}–{summary.spread.max}</strong> ({summary.spread.range} spread).
                    We show the range, never a blended average — the accumulator has to stay reproducible.
                  </p>
                )}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                  <thead>
                    <tr style={{ textAlign: "left", color: "var(--color-text-muted)" }}>
                      <th style={{ padding: "4px 8px" }}>Source</th>
                      <th style={{ padding: "4px 8px" }}>Season GDD</th>
                      <th style={{ padding: "4px 8px" }}>Completeness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.perSource.map((p) => (
                      <tr key={p.provider} style={{ borderTop: "1px solid var(--color-border)" }}>
                        <td style={{ padding: "4px 8px" }}>{p.provider}{p.provider === summary.primaryProviderKey ? " (primary)" : ""}</td>
                        <td style={{ padding: "4px 8px" }}>{p.seasonGddC}</td>
                        <td style={{ padding: "4px 8px" }}>{p.completenessPct}% ({trustLabel(p.completenessPct)})</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {h.gridFilledGddC != null && (
                  <p style={{ ...label, textTransform: "none", marginTop: 10 }}>
                    Continuous (grid-filled) series total: {h.gridFilledGddC} GDD — a derived gap-fill view, composed on read, never the headline.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
