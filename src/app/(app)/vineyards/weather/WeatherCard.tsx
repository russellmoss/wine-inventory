"use client";

// VI-P8 Unit 10 — the grower climate card. Simple on top (one-glance headline in the PRIMARY source's
// numbers), robust underneath (a "Compare sources" disclosure reveals the spread + per-source completeness +
// honesty lines). Renders offline from the stored summary. DESIGN.md tokens only.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClimateSummary } from "@/lib/weather/read-core";
import { coverageLabel, gddComparisonLabel, providerLabel, trustLabel } from "@/lib/weather/card-core";
import { backfillVineyardWeatherHistory, listNearbyStations, refreshVineyardWeatherCurrentSeason, setVineyardPrimarySource, setVineyardStation, type StationOption } from "@/lib/weather/actions";
import { C_TO_F_GDD } from "@/lib/weather/normals-core";
import { StationMapClient } from "./StationMap.client";
import { GddChart } from "./GddChart";

const gddF = (gddC: number) => Math.round(gddC * C_TO_F_GDD);

type VineyardOpt = { id: string; name: string };

const card: React.CSSProperties = {
  border: "1px solid var(--border-default)",
  borderRadius: 12,
  padding: 18,
  background: "var(--surface-raised)",
};
const label: React.CSSProperties = { fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, color: "var(--text-muted)" };
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
  const [mapData, setMapData] = useState<{ stations: StationOption[]; center: { lat: number; lon: number } } | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapLoading, setMapLoading] = useState(false);
  const [winklerWindow, setWinklerWindow] = useState<10 | 20>(20);
  const [backfilling, setBackfilling] = useState(false);

  async function loadHistory() {
    if (!selectedId) return;
    setBackfilling(true);
    setErr(null);
    const res = await backfillVineyardWeatherHistory(selectedId, 20);
    setBackfilling(false);
    if (!res.ok) setErr(res.error);
    else router.refresh();
  }

  async function refresh() {
    if (!selectedId) return;
    setBusy(true);
    setErr(null);
    const res = await refreshVineyardWeatherCurrentSeason(selectedId);
    setBusy(false);
    if (!res.ok) setErr(res.error);
    else router.refresh();
  }

  async function changeSource(value: string) {
    if (!selectedId) return;
    setBusy(true);
    setErr(null);
    // "auto" clears the override; a provider key sets it.
    const res = await setVineyardPrimarySource(selectedId, value === "auto" ? null : value);
    setBusy(false);
    if (!res.ok) setErr(res.error);
    else router.refresh();
  }

  async function toggleMap() {
    if (mapOpen) {
      setMapOpen(false);
      return;
    }
    setMapOpen(true);
    if (!mapData && selectedId) {
      setMapLoading(true);
      setErr(null);
      const res = await listNearbyStations(selectedId);
      setMapLoading(false);
      if (!res.ok) setErr(res.error);
      else setMapData({ stations: res.stations, center: res.center });
    }
  }

  async function pickStation(sid: string) {
    if (!selectedId || !mapData) return;
    const station = mapData.stations.find((s) => s.sid === sid);
    if (!station) return;
    setBusy(true);
    setErr(null);
    const res = await setVineyardStation(selectedId, station);
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
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-raised)", color: "var(--text-primary)" }}
          aria-label="Vineyard"
        >
          {vineyards.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
        <button
          onClick={refresh}
          disabled={busy || pending || !selectedId}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--accent)", color: "var(--accent-on)", cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "Refreshing…" : "Refresh weather"}
        </button>
        {summary?.lastRefreshAt && (
          <span style={{ ...label, textTransform: "none" }}>Updated {new Date(summary.lastRefreshAt).toLocaleString()}</span>
        )}
      </div>

      {err && <div style={{ ...card, borderColor: "var(--danger)", color: "var(--danger)" }}>{err}</div>}

      {!summary || !h ? (
        <div style={card}>
          <p style={{ margin: 0 }}>No weather has been pulled for this vineyard yet.</p>
          <p style={{ ...label, textTransform: "none", marginTop: 6 }}>Click <strong>Refresh weather</strong> to fetch this season from the terrain-aware gridded products + your nearest station.</p>
        </div>
      ) : (
        <>
          {/* Headline — cumulative GDD in °F (US viticulture convention), from the PRIMARY source (R14). */}
          <div style={{ ...card, display: "grid", gap: 10 }}>
            <div style={label}>Season {summary.seasonYear} · Cumulative Growing Degree Days (base 50 °F, Apr 1–Oct 31)</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={big}>{gddF(h.seasonGddC).toLocaleString()}<span style={{ fontSize: 18, color: "var(--text-muted)" }}> °F-GDD</span></span>
              <span style={{ color: "var(--text-muted)" }}>to date · {trustLabel(h.gddCompletenessPct)} confidence ({h.gddCompletenessPct}% of season) · {h.seasonGddC.toLocaleString()} °C</span>
            </div>
            {summary.normals.hasHistory ? (
              <GddChart series={summary.normals.comparison} />
            ) : (
              <div style={{ ...card, background: "var(--surface-muted)", display: "grid", gap: 8 }}>
                <div>Load 20 years of history to chart this season against the 10- and 20-year average curves and classify the Winkler region.</div>
                <button
                  onClick={loadHistory}
                  disabled={backfilling}
                  style={{ justifySelf: "start", padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--accent)", color: "var(--accent-on)", cursor: backfilling ? "wait" : "pointer" }}
                >
                  {backfilling ? "Loading history… (~20s)" : "Load 20-year history"}
                </button>
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <Panel title="Winkler region (long-term average)">
              {(() => {
                const n = winklerWindow === 10 ? summary.normals.winkler10 : summary.normals.winkler20;
                if (!n) {
                  return <div style={{ ...label, textTransform: "none" }}>Load history above to classify — Winkler needs the multi-year full-season average.</div>;
                }
                return (
                  <>
                    <div style={big}>{n.region}</div>
                    <div style={{ ...label, textTransform: "none" }}>{n.avgGddF.toLocaleString()} °F-GDD avg over {n.yearsUsed} yr</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {[10, 20].map((w) => (
                        <button
                          key={w}
                          onClick={() => setWinklerWindow(w as 10 | 20)}
                          style={{ padding: "4px 10px", borderRadius: 6, fontSize: 13, cursor: "pointer", border: "1px solid var(--border-default)", background: winklerWindow === w ? "var(--accent)" : "transparent", color: winklerWindow === w ? "var(--accent-on)" : "var(--text-secondary)" }}
                        >
                          {w}-yr
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
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

          {/* Station-vs-site + provider panel, with the grower's primary-source selector (R14). */}
          <Panel title="Where this estimate comes from">
            <div style={{ display: "grid", gap: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={label}>Primary source</span>
                <select
                  value={summary.primaryProviderOverride ?? "auto"}
                  onChange={(e) => changeSource(e.target.value)}
                  disabled={busy}
                  style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid var(--border-default)", background: "var(--surface-raised)", color: "var(--text-primary)" }}
                  aria-label="Primary climate source"
                >
                  <option value="auto">Auto — {providerLabel(summary.primaryProviderResolved, summary.station.name)} (recommended)</option>
                  {summary.perSource.map((p) => (
                    <option key={p.provider} value={p.provider}>
                      {providerLabel(p.provider, summary.station.name)} · {p.completenessPct}% complete
                    </option>
                  ))}
                </select>
                {summary.primaryProviderOverride && (
                  <button onClick={() => changeSource("auto")} disabled={busy} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 13, padding: 0 }}>
                    reset to auto
                  </button>
                )}
              </label>
              <div style={{ ...label, textTransform: "none" }}>
                {summary.primaryProviderOverride
                  ? `You chose ${providerLabel(summary.primaryProviderOverride, summary.station.name)} — the headline + assistant answer in this source.`
                  : `Auto-selected the nearest quality source. The headline + assistant answer in it; compare the others below.`}
              </div>
              <div>Coverage: {coverageLabel(summary.coverageState)}</div>
              {summary.station.name && (
                <div>
                  Active station: <strong>{summary.station.name}</strong>
                  {summary.station.distanceM != null && ` · ${Math.round(summary.station.distanceM / 100) / 10} km away`}
                  {summary.siteElevationM != null && ` · site ${Math.round(summary.siteElevationM)} m`}
                </div>
              )}
              {summary.coverageState === "US_HIGH_RES" && (
                <div>
                  <button
                    onClick={toggleMap}
                    disabled={busy}
                    style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: 14 }}
                    aria-expanded={mapOpen}
                  >
                    {mapOpen ? "▾ Hide station map" : "▸ Choose a different station on the map"}
                  </button>
                  {mapOpen && (
                    <div style={{ marginTop: 10 }}>
                      {mapLoading && <div style={{ ...label, textTransform: "none" }}>Finding nearby stations…</div>}
                      {mapData && mapData.stations.length > 0 ? (
                        <>
                          <StationMapClient center={mapData.center} stations={mapData.stations} activeSid={summary.station.id} onSelect={pickStation} busy={busy} />
                          <div style={{ ...label, textTransform: "none", marginTop: 6 }}>
                            Click a green dot to report from that station ({mapData.stations.length} within ~40 km). The dark-outlined dot is active.
                          </div>
                        </>
                      ) : (
                        !mapLoading && <div style={{ ...label, textTransform: "none" }}>No stations found near this vineyard.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {summary.attribution && <div style={{ ...label, textTransform: "none" }}>{summary.attribution}</div>}
            </div>
          </Panel>

          {/* Progressive disclosure — the spread, never a blend. */}
          <div style={card}>
            <button
              onClick={() => setShowCompare((s) => !s)}
              style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", padding: 0, fontSize: 14 }}
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
                    <tr style={{ textAlign: "left", color: "var(--text-muted)" }}>
                      <th style={{ padding: "4px 8px" }}>Source</th>
                      <th style={{ padding: "4px 8px" }}>Season GDD</th>
                      <th style={{ padding: "4px 8px" }}>Completeness</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.perSource.map((p) => (
                      <tr key={p.provider} style={{ borderTop: "1px solid var(--border-default)" }}>
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
