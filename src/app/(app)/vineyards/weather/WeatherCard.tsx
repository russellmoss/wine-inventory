"use client";

// VI-P8 Unit 10 — the grower climate card. Simple on top (one-glance headline in the PRIMARY source's
// numbers), robust underneath (a "Compare sources" disclosure reveals the spread + per-source completeness +
// honesty lines). Renders offline from the stored summary. DESIGN.md tokens only.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClimateSummary } from "@/lib/weather/read-core";
import { coverageLabel, providerLabel, trustLabel } from "@/lib/weather/card-core";
import { backfillVineyardWeatherHistory, listNearbyStations, refreshVineyardWeatherCurrentSeason, setVineyardPrimarySource, setVineyardStation, setVineyardUnitSystem, type StationOption } from "@/lib/weather/actions";
import { formatGdd, formatPrecip, formatTemp, gddFToC, type UnitSystem } from "@/lib/weather/units-core";
import { formatDistance, formatLength } from "@/lib/units/display";
import { StationMapClient } from "./StationMap.client";
import { GddChart } from "./GddChart";
import { RainfallSectionClient } from "./RainfallSection.client";
import { ForecastStrip } from "./ForecastStrip";

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
  const autoTried = useRef<Set<string>>(new Set());

  // Weather should "just be there": on first view auto-fetch the current season (by the nearest station), then
  // auto-load the 20-yr history so the graph + Winkler populate — no clicking Refresh. Guarded per vineyard.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      if (!summary && !busy) {
        const k = `r:${selectedId}`;
        if (autoTried.current.has(k)) return;
        autoTried.current.add(k);
        setBusy(true);
        setErr(null);
        const res = await refreshVineyardWeatherCurrentSeason(selectedId);
        if (cancelled) return;
        setBusy(false);
        if (!res.ok) setErr(res.error);
        else router.refresh();
      } else if (summary && !summary.normals.hasHistory && !backfilling && summary.coverageState !== "UNAVAILABLE") {
        const k = `h:${selectedId}`;
        if (autoTried.current.has(k)) return;
        autoTried.current.add(k);
        setBackfilling(true);
        const res = await backfillVineyardWeatherHistory(selectedId, 20);
        if (cancelled) return;
        setBackfilling(false);
        if (res.ok) router.refresh();
      }
    })();
    return () => { cancelled = true; };
  }, [selectedId, summary, busy, backfilling, router]);

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
  // Display units (plan 096 U3 / plan 098) — the RESOLVED system; every number renders through it.
  const unit: UnitSystem = summary?.unitSystem ?? "METRIC";
  // The vineyard's explicit override; null = Auto (winery display units → geo default).
  const unitOverride: UnitSystem | null = summary?.unitSystemOverride ?? null;

  async function changeUnits(next: UnitSystem | null) {
    if (!selectedId || next === unitOverride) return;
    setErr(null);
    const res = await setVineyardUnitSystem(selectedId, next);
    if (!res.ok) setErr(res.error);
    else router.refresh();
  }

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

      {/* 7-day forecast strip (plan 096 U16) — at the top, above the retrospective climate. */}
      {selectedId && (
        <div style={card}>
          <ForecastStrip vineyardId={selectedId} />
        </div>
      )}

      {!summary || !h ? (
        <div style={card}>
          {busy ? (
            <p style={{ margin: 0 }}>Fetching this season&apos;s weather from the nearest station + gridded products…</p>
          ) : (
            <>
              <p style={{ margin: 0 }}>No weather for this vineyard yet.</p>
              <p style={{ ...label, textTransform: "none", marginTop: 6 }}>It loads automatically — or click <strong>Refresh weather</strong> to fetch it now.</p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Source fidelity (docs/analysis/bhutan-nasa-power-elevation-bias.md) — when the primary
              series describes a point well above/below the vines, say so BEFORE any number, and let
              the withheld classifications below point back here. §3.4: confidence beside the value. */}
          {summary.sourceFidelity.reason && (
            <div
              style={{
                ...card,
                borderColor: summary.sourceFidelity.classificationAllowed ? "var(--warning)" : "var(--danger)",
                display: "grid",
                gap: 4,
              }}
            >
              <div style={{ ...label, color: summary.sourceFidelity.classificationAllowed ? "var(--warning)" : "var(--danger)" }}>
                {summary.sourceFidelity.classificationAllowed ? "Source elevation caveat" : "Climate classifications withheld"}
              </div>
              <div style={{ textTransform: "none" }}>{summary.sourceFidelity.reason}</div>
              <div style={{ ...label, textTransform: "none", color: "var(--text-muted)" }}>
                Daily readings, trends and the forecast are unaffected — it is the season totals and class labels that
                depend on the source sitting at the vineyard&apos;s elevation.
              </div>
            </div>
          )}

          {/* Headline — cumulative GDD in the vineyard's display units, from the PRIMARY source (R14). */}
          <div style={{ ...card, display: "grid", gap: 10 }}>
            <div style={label}>Season {summary.seasonYear} · Cumulative Growing Degree Days ({unit === "IMPERIAL" ? "base 50 °F" : "base 10 °C"}, Apr 1–Oct 31)</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <span style={big}>{formatGdd(h.seasonGddC, unit)}</span>
              <span style={{ color: "var(--text-muted)" }}>
                to date · {trustLabel(h.gddCompletenessPct)} confidence ({h.gddCompletenessPct}% of season) ·{" "}
                {formatGdd(h.seasonGddC, unit === "IMPERIAL" ? "METRIC" : "IMPERIAL")}
              </span>
            </div>
            {summary.normals.hasHistory ? (
              <GddChart series={summary.normals.comparison} unitSystem={unit} />
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
                // Two distinct reasons this can be blank, and they must never read as each other:
                // "we don't have the history yet" vs "the source doesn't describe this site" (§3.6).
                if (!summary.sourceFidelity.classificationAllowed) {
                  return <div style={{ ...label, textTransform: "none" }}>Withheld — the weather source doesn&apos;t describe this site closely enough to classify. See the note above.</div>;
                }
                const n = winklerWindow === 10 ? summary.normals.winkler10 : summary.normals.winkler20;
                if (!n) {
                  return <div style={{ ...label, textTransform: "none" }}>Load history above to classify — Winkler needs the multi-year full-season average.</div>;
                }
                return (
                  <>
                    <div style={big}>{n.region}</div>
                    <div style={{ ...label, textTransform: "none" }}>{formatGdd(gddFToC(n.avgGddF), unit)} avg over {n.yearsUsed} yr</div>
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
              <div style={big}>{formatTemp(h.gst.gstC, unit, 1)}</div>
              <div style={{ ...label, textTransform: "none" }}>
                {h.gst.group ?? (summary.sourceFidelity.classificationAllowed ? "" : "Class withheld — source elevation mismatch")}
              </div>
            </Panel>
            <Panel title="Frost — vulnerable window">
              <div>{h.frost.vulnerableWindow.startIso} → {h.frost.vulnerableWindow.endIso}</div>
              <div style={{ marginTop: 4 }}>
                <strong>{h.frost.lightCount}</strong> light (≤{formatTemp(0, unit)}) · <strong>{h.frost.killingCount}</strong> killing (≤{formatTemp(-2, unit)})
              </div>
              <div style={{ ...label, textTransform: "none", marginTop: 4 }}>Elevated-risk signal → check the vines. Not a damage report.</div>
            </Panel>
            <Panel title="Heat & rain">
              <div><strong>{h.heat.daysOverByThreshold["35"]}</strong> days ≥ {formatTemp(35, unit)}</div>
              <div style={{ marginTop: 4 }}><strong>{formatPrecip(h.rainfall.totalMm, unit)}</strong> rain</div>
              <div style={{ ...label, textTransform: "none", marginTop: 4 }}>Regional Rainfall Estimate (≈4 km average, not your rain gauge).</div>
            </Panel>
          </div>

          {/* Rainfall over time (plan 096 U9) — bars + cumulative, range control, honest stats. */}
          {selectedId && <RainfallSectionClient vineyardId={selectedId} unitSystem={unit} />}

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
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={label}>Units</span>
                {/* 3-state (plan 098): explicit °F / °C override this vineyard; Auto follows the winery's
                    display units (falling back to the geo default). Coarse by design — whole system. */}
                {([
                  { value: "IMPERIAL" as UnitSystem | null, text: "°F / in" },
                  { value: "METRIC" as UnitSystem | null, text: "°C / mm" },
                  { value: null as UnitSystem | null, text: `Auto (${(summary?.unitSystemAuto ?? "METRIC") === "IMPERIAL" ? "°F" : "°C"})` },
                ]).map(({ value, text }) => (
                  <button
                    key={text}
                    onClick={() => changeUnits(value)}
                    disabled={busy}
                    style={{ padding: "4px 10px", borderRadius: 6, fontSize: 13, cursor: "pointer", border: "1px solid var(--border-default)", background: unitOverride === value ? "var(--accent)" : "transparent", color: unitOverride === value ? "var(--accent-on)" : "var(--text-secondary)" }}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <div>Coverage: {coverageLabel(summary.coverageState)}</div>
              {summary.station.name && (
                <div>
                  Active station: <strong>{summary.station.name}</strong>
                  {summary.station.distanceM != null && ` · ${formatDistance(summary.station.distanceM / 1000, unit)} away`}
                  {summary.siteElevationM != null && ` · site ${formatLength(summary.siteElevationM, unit === "IMPERIAL" ? "FT" : "M")}`}
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
