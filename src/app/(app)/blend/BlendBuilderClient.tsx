"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Button, Badge } from "@/components/ui";
import { blendLotsAction, markTrialPromotedAction } from "@/lib/blend/actions";
import { weightedRollup } from "@/lib/blend/compose";
import type { BlendVessel, TrialPrefill } from "@/lib/blend/data";

const field: React.CSSProperties = {
  height: 38,
  padding: "0 10px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 14,
  color: "var(--text-primary)",
};

// A source is a whole VESSEL, not an individual lot. Once wine is commingled in a vessel it is
// ONE liquid — you can only draw the mixture, never a single component variety. A multi-lot
// vessel (a blend already sitting in the barrel) therefore shows as ONE source; a partial draw
// is split proportionally across its resident lots so the blend ratio is preserved and lineage
// to every parent component is kept.
type SourceKey = string; // vesselId
type SourceComponent = {
  lotId: string;
  code: string;
  volumeL: number;
  varietyName: string | null;
  vineyardName: string | null;
  vintageYear: number | null;
};
type SelectedSource = {
  vesselId: string;
  vesselCode: string;
  label: string; // blend name, or the single lot's code, or a varieties summary
  available: number; // total litres across all resident lots in the vessel
  drawL: string;
  deplete: boolean;
  components: SourceComponent[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const isBarrel = (v: BlendVessel) => v.type === "BARREL";
const vesselTypeLabel = (v: BlendVessel) => `${isBarrel(v) ? "Barrel" : "Tank"} ${v.code}`;

// Natural order: by the numeric value of the code (so 2 sorts before 10), then barrels before
// tanks of the same number — Barrel 1, Tank 1, Barrel 2, Tank 2, … rather than 1, 10, 11, 2.
const codeNum = (v: BlendVessel) => {
  const m = v.code.match(/\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
};
const vesselSort = (a: BlendVessel, b: BlendVessel) =>
  codeNum(a) - codeNum(b) ||
  (isBarrel(a) ? 0 : 1) - (isBarrel(b) ? 0 : 1) ||
  a.code.localeCompare(b.code, undefined, { numeric: true });
const residentText = (v: BlendVessel) =>
  v.residents.length === 0 ? "empty" : v.residents.length === 1 ? `holds ${v.residents[0].code}` : `${v.residents.length} lots`;

/** What to call a vessel's contents in the source list: its blend name, else the lone lot code, else a varieties summary. */
function sourceLabel(v: BlendVessel): string {
  if (v.blendName) return v.blendName;
  if (v.residents.length === 1) return v.residents[0].code;
  const vars = [...new Set(v.residents.map((r) => r.varietyName).filter(Boolean))] as string[];
  return vars.length > 0 ? vars.join(" / ") : `${v.residents.length}-lot blend`;
}

function toComponents(v: BlendVessel): SourceComponent[] {
  return v.residents.map((r) => ({
    lotId: r.lotId,
    code: r.code,
    volumeL: r.volumeL,
    varietyName: r.varietyName,
    vineyardName: r.vineyardName,
    vintageYear: r.vintageYear,
  }));
}

function makeSource(v: BlendVessel, drawL?: number): SelectedSource {
  const available = round2(v.residents.reduce((a, r) => a + r.volumeL, 0));
  return {
    vesselId: v.id,
    vesselCode: v.code,
    label: sourceLabel(v),
    available,
    drawL: String(drawL != null ? Math.min(drawL, available) : available),
    deplete: false,
    components: toComponents(v),
  };
}

/**
 * Expand a vessel-level draw into per-lot draws for the ledger. Deplete pulls every resident in
 * full. A partial draw splits proportionally by each lot's share of the vessel; the last lot
 * absorbs rounding so the parts sum to the requested volume, and each is capped at what that lot
 * holds (so blendLotsCore never sees an over-draw).
 */
function expandDraws(s: SelectedSource): { vesselId: string; lotId: string; drawL: number; deplete: boolean }[] {
  if (s.deplete) {
    return s.components.map((c) => ({ vesselId: s.vesselId, lotId: c.lotId, drawL: round2(c.volumeL), deplete: true }));
  }
  const total = Number(s.drawL);
  if (!(total > 0)) return [];
  if (s.components.length === 1) {
    return [{ vesselId: s.vesselId, lotId: s.components[0].lotId, drawL: round2(Math.min(total, s.components[0].volumeL)), deplete: false }];
  }
  let allocated = 0;
  return s.components.map((c, i) => {
    const draw =
      i === s.components.length - 1
        ? round2(Math.min(total - allocated, c.volumeL))
        : Math.min(round2((total * c.volumeL) / (s.available || 1)), c.volumeL);
    allocated = round2(allocated + draw);
    return { vesselId: s.vesselId, lotId: c.lotId, drawL: draw, deplete: false };
  });
}

function Bars({ title, slices }: { title: string; slices: { label: string; pct: number }[] }) {
  if (slices.length === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{title}</div>
      {slices.map((s) => (
        <div key={s.label} style={{ marginBottom: 5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
            <span>{s.label}</span>
            <span style={{ color: "var(--text-secondary)" }}>{s.pct}%</span>
          </div>
          <div style={{ height: 5, background: "var(--surface-sunken)", borderRadius: "var(--radius-pill)", overflow: "hidden", marginTop: 2 }}>
            <div style={{ width: `${Math.min(100, s.pct)}%`, height: "100%", background: "var(--accent)" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function seedFromPrefill(vessels: BlendVessel[], prefill?: TrialPrefill): Map<SourceKey, SelectedSource> {
  const map = new Map<SourceKey, SelectedSource>();
  if (!prefill) return map;
  // Trials reference individual lots; sum a trial's litres per VESSEL, then select that whole
  // vessel (we can't pull a single component out of a commingled vessel). If a vessel holds lots
  // beyond the trial's, the proportional split will include them — the winemaker tweaks litres.
  const litresByVessel = new Map<string, number>();
  for (const pc of prefill.components) {
    if (pc.depleted || !pc.vesselId) continue;
    litresByVessel.set(pc.vesselId, round2((litresByVessel.get(pc.vesselId) ?? 0) + pc.litres));
  }
  for (const [vesselId, litres] of litresByVessel) {
    const v = vessels.find((x) => x.id === vesselId);
    if (!v || v.residents.length === 0) continue;
    map.set(v.id, makeSource(v, litres || undefined));
  }
  return map;
}

export function BlendBuilderClient({ vessels, prefill }: { vessels: BlendVessel[]; prefill?: TrialPrefill }) {
  const router = useRouter();
  const sortedVessels = React.useMemo(() => [...vessels].sort(vesselSort), [vessels]);
  const occupied = sortedVessels.filter((v) => v.residents.length > 0);

  const [selected, setSelected] = React.useState<Map<SourceKey, SelectedSource>>(() => seedFromPrefill(vessels, prefill));
  const [destIds, setDestIds] = React.useState<Set<string>>(() => new Set());
  const [destVol, setDestVol] = React.useState<Map<string, string>>(() => new Map());
  const [destFilter, setDestFilter] = React.useState<"ALL" | "TANK" | "BARREL">("ALL");
  const [token, setToken] = React.useState("");
  const [vintage, setVintage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const sources = [...selected.values()];

  function toggle(v: BlendVessel) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(v.id)) next.delete(v.id);
      else next.set(v.id, makeSource(v));
      return next;
    });
  }

  function patch(k: SourceKey, p: Partial<SelectedSource>) {
    setSelected((prev) => {
      const cur = prev.get(k);
      if (!cur) return prev;
      const next = new Map(prev);
      next.set(k, { ...cur, ...p });
      return next;
    });
  }

  // Running totals + live composition. Everything downstream works off the EXPANDED per-lot draws
  // so the numbers match what the ledger will actually record.
  const expandedBySource = sources.map((s) => ({ source: s, draws: expandDraws(s) }));
  const sourceDraw = (s: SelectedSource) => expandDraws(s).reduce((a, d) => a + d.drawL, 0);
  const runningTotal = round2(expandedBySource.reduce((a, e) => a + e.draws.reduce((b, d) => b + d.drawL, 0), 0));

  // Destination(s). One vessel → NEW_LOT (empty, needs a tag) or GROW_EXISTING (one resident).
  // Two or more → split ONE new child lot across them (NEW_LOT only); each must be empty.
  function toggleDest(v: BlendVessel) {
    const has = destIds.has(v.id);
    setDestIds((prev) => {
      const next = new Set(prev);
      if (has) next.delete(v.id);
      else next.add(v.id);
      return next;
    });
    setDestVol((prev) => {
      const next = new Map(prev);
      if (has) {
        next.delete(v.id);
      } else {
        // Default a new destination's volume to whatever's still unallocated, capped at capacity.
        const curAlloc = [...next.values()].reduce((a, x) => a + (Number(x) || 0), 0);
        const remaining = Math.max(0, round2(runningTotal - curAlloc));
        const def = Math.min(v.capacityL, remaining);
        next.set(v.id, def > 0 ? String(def) : "");
      }
      return next;
    });
  }
  const patchDestVol = (id: string, val: string) => setDestVol((prev) => new Map(prev).set(id, val));

  const destVessels = ([...destIds].map((id) => vessels.find((v) => v.id === id)).filter(Boolean) as BlendVessel[]).sort(vesselSort);
  const n = destVessels.length;
  const isSplit = n >= 2;
  const allDestEmpty = destVessels.every((v) => v.residents.length === 0);
  const mode: "NEW_LOT" | "GROW_EXISTING" | "INVALID" =
    n === 0
      ? "INVALID"
      : n === 1
        ? destVessels[0].residents.length === 0
          ? "NEW_LOT"
          : destVessels[0].residents.length === 1
            ? "GROW_EXISTING"
            : "INVALID"
        : allDestEmpty
          ? "NEW_LOT"
          : "INVALID";
  const growCode = mode === "GROW_EXISTING" ? sourceLabel(destVessels[0]) : null;
  const filteredDestVessels = sortedVessels.filter((v) =>
    destFilter === "ALL" ? true : destFilter === "BARREL" ? isBarrel(v) : !isBarrel(v),
  );

  // Split allocation: per-vessel volumes must sum to the blended total and fit each capacity.
  const allocated = round2(destVessels.reduce((a, v) => a + (Number(destVol.get(v.id)) || 0), 0));
  const unallocated = round2(runningTotal - allocated);
  const destOverCap = destVessels.filter((v) => (Number(destVol.get(v.id)) || 0) > v.capacityL + 1e-9).map((v) => v.id);
  const splitOk =
    !isSplit ||
    (Math.abs(unallocated) < 0.005 && destOverCap.length === 0 && destVessels.every((v) => (Number(destVol.get(v.id)) || 0) > 0));
  const rollup = weightedRollup(
    expandedBySource.flatMap(({ source, draws }) => {
      const drawByLot = new Map(draws.map((d) => [d.lotId, d.drawL]));
      return source.components.map((c) => ({
        weight: drawByLot.get(c.lotId) ?? 0,
        varietyName: c.varietyName,
        vineyardName: c.vineyardName,
        vintageYear: c.vintageYear,
      }));
    }),
  );

  // Validation + interaction states. A draw is checked at the VESSEL level (you can't pull more
  // than the vessel holds); the proportional split keeps each lot within bounds automatically.
  const overDrawn = sources.filter((s) => !(sourceDraw(s) > 0) || sourceDraw(s) > s.available + 1e-9).map((s) => s.vesselId);
  const tokenValid = /^[A-Za-z]{2,4}$/.test(token.trim());
  const vintageNum = vintage.trim() === "" ? null : Number(vintage);
  const vintageValid = vintageNum == null || (Number.isInteger(vintageNum) && vintageNum >= 1900 && vintageNum <= 2100);
  const enough = sources.length >= 2;
  const canExecute =
    enough &&
    mode !== "INVALID" &&
    overDrawn.length === 0 &&
    vintageValid &&
    (mode !== "NEW_LOT" || tokenValid) &&
    splitOk &&
    !pending;

  let hint = "";
  if (!enough) hint = "Pick at least two wines to blend.";
  else if (mode === "INVALID" && n === 0) hint = "Choose a destination vessel.";
  else if (mode === "INVALID" && isSplit) hint = "Multiple destinations must all be empty vessels.";
  else if (mode === "INVALID") hint = "That vessel holds more than one lot — pick an empty vessel or one with a single lot.";
  else if (overDrawn.length) hint = "A draw exceeds what that vessel holds.";
  else if (mode === "NEW_LOT" && !tokenValid) hint = "Enter a 2–4 letter tag for the new blend lot.";
  else if (isSplit && destOverCap.length) hint = "A destination volume exceeds that vessel's capacity.";
  else if (isSplit && Math.abs(unallocated) >= 0.005)
    hint = `Allocate all ${runningTotal} L across the chosen vessels (${unallocated} L unallocated).`;

  function execute() {
    setError(null);
    startTransition(async () => {
      try {
        // Expand each vessel source into proportional per-lot component draws for the ledger.
        const components = expandedBySource.flatMap((e) => e.draws);
        const res = await blendLotsAction(
          isSplit
            ? {
                mode: "NEW_LOT",
                components,
                destinations: destVessels.map((v) => ({ vesselId: v.id, volumeL: Number(destVol.get(v.id)) || 0 })),
                token: token.trim(),
                vintage: vintageNum,
              }
            : {
                mode: mode === "NEW_LOT" ? "NEW_LOT" : "GROW_EXISTING",
                components,
                toVesselId: destVessels[0].id,
                ...(mode === "NEW_LOT" ? { token: token.trim(), vintage: vintageNum } : {}),
              },
        );
        if (prefill?.trialId) {
          try {
            await markTrialPromotedAction(prefill.trialId, res.childLotId);
          } catch {
            // The blend is real even if the trial flip fails; don't block the navigation.
          }
        }
        router.push(`/lots/${res.childLotId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record the blend.");
      }
    });
  }

  if (occupied.length === 0) {
    return (
      <div style={{ maxWidth: 720 }}>
        <Eyebrow rule>Blend</Eyebrow>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 16px" }}>Build a blend</h1>
        <Card>
          <p style={{ color: "var(--text-secondary)", margin: 0 }}>
            No wine in any vessel yet. Fill a vessel under <strong>Wine in-progress</strong> first, then come back to blend.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <div>
          <Eyebrow rule>Blend</Eyebrow>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, margin: "10px 0 6px" }}>Build a blend</h1>
        </div>
        <Link href="/blend/trials" style={{ color: "var(--text-accent)", fontSize: 14 }}>
          → Bench trials
        </Link>
      </div>
      <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
        Pick the wines to blend, set how much of each, then choose where it lands. An empty vessel mints a new blend lot; a
        vessel with one lot grows that lot. A vessel that already holds a blend is drawn as a whole — its share comes out
        in the blend&rsquo;s own ratio.
      </p>
      {prefill ? (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--accent-soft)", borderRadius: "var(--radius-md)", fontSize: 13.5 }}>
          Promoting trial <strong>{prefill.name}</strong> — ratios scaled to fit the cellar. Tweak the litres, then execute.
          {prefill.anyDepleted ? (
            <span style={{ color: "var(--danger)" }}> Some components have drained since the trial and were left out.</span>
          ) : null}
        </div>
      ) : null}
      {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 14 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Main column: source picker (one row per vessel) + per-source volumes */}
        <div style={{ flex: "1 1 440px", minWidth: 300 }}>
          <Eyebrow tone="ink">Sources</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {occupied.map((v) => {
              const sel = selected.get(v.id);
              const isDest = destIds.has(v.id);
              const multi = v.residents.length > 1;
              return (
                <Card key={v.id} padding="0" style={{ borderColor: sel ? "var(--accent)" : undefined, opacity: isDest ? 0.5 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", flexWrap: "wrap" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: isDest ? "default" : "pointer", flex: "1 1 200px" }}>
                      <input type="checkbox" checked={!!sel} disabled={isDest} onChange={() => toggle(v)} />
                      <span>
                        <span style={{ fontWeight: 600 }}>{sourceLabel(v)}</span>{" "}
                        {multi ? (
                          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                            blend · {v.residents.length} components
                          </span>
                        ) : (
                          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                            {[v.residents[0].varietyName, v.residents[0].vineyardName, v.residents[0].vintageYear].filter(Boolean).join(" · ") || "—"}
                          </span>
                        )}
                      </span>
                      <Badge tone="neutral" variant="soft">{vesselTypeLabel(v)}</Badge>
                      <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{round2(v.residents.reduce((a, r) => a + r.volumeL, 0))} L</span>
                    </label>
                    {sel ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          value={sel.drawL}
                          onChange={(e) => patch(v.id, { drawL: e.target.value })}
                          inputMode="decimal"
                          disabled={sel.deplete}
                          aria-label={`Litres of ${sel.label} to blend`}
                          style={{ ...field, width: 90, opacity: sel.deplete ? 0.5 : 1, borderColor: overDrawn.includes(v.id) ? "var(--danger)" : "var(--border-strong)" }}
                        />
                        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" }}>
                          <input type="checkbox" checked={sel.deplete} onChange={(e) => patch(v.id, { deplete: e.target.checked })} /> deplete
                        </label>
                      </div>
                    ) : null}
                  </div>
                  {/* For a commingled blend, show its make-up read-only — the draw pulls the whole, proportionally. */}
                  {multi ? (
                    <div style={{ padding: "0 14px 10px 40px", display: "flex", flexWrap: "wrap", gap: "2px 14px" }}>
                      {v.residents.map((r) => (
                        <span key={r.lotId} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {[r.varietyName, r.vineyardName].filter(Boolean).join(" ") || r.code} · {round2(r.volumeL)} L
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        </div>

        {/* Sticky summary: total, mode banner, composition, execute */}
        <div style={{ flex: "0 1 320px", minWidth: 280, position: "sticky", top: 16 }}>
          <Card>
            <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Running total</div>
            <div style={{ fontSize: 30, fontFamily: "var(--font-display)", margin: "2px 0 12px" }}>{runningTotal} L</div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                Destination{n > 0 ? ` · ${n} selected` : ""}
              </label>
              <div style={{ display: "flex", gap: 4 }}>
                {(["ALL", "TANK", "BARREL"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setDestFilter(f)}
                    style={{
                      fontSize: 11.5,
                      padding: "2px 8px",
                      borderRadius: "var(--radius-pill)",
                      border: "1px solid var(--border-strong)",
                      cursor: "pointer",
                      background: destFilter === f ? "var(--accent)" : "var(--surface-raised)",
                      color: destFilter === f ? "var(--accent-contrast, #fff)" : "var(--text-secondary)",
                    }}
                  >
                    {f === "ALL" ? "All" : f === "TANK" ? "Tanks" : "Barrels"}
                  </button>
                ))}
              </div>
            </div>
            <div
              role="group"
              aria-label="Destination vessels"
              style={{
                maxHeight: 200,
                overflowY: "auto",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-raised)",
              }}
            >
              {filteredDestVessels.map((v) => {
                const checked = destIds.has(v.id);
                const isSource = selected.has(v.id);
                return (
                  <label
                    key={v.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      minHeight: 40,
                      cursor: isSource ? "not-allowed" : "pointer",
                      opacity: isSource ? 0.5 : 1,
                      borderBottom: "1px solid var(--border-subtle, var(--surface-sunken))",
                    }}
                  >
                    <input type="checkbox" checked={checked} disabled={isSource} onChange={() => toggleDest(v)} />
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{vesselTypeLabel(v)}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)", marginLeft: "auto" }}>
                      {residentText(v)} · {v.capacityL} L
                    </span>
                  </label>
                );
              })}
            </div>

            {/* Per-vessel volumes when splitting one lot across multiple destinations */}
            {isSplit ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                  Volume per vessel
                </div>
                {destVessels.map((v) => (
                  <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <span style={{ flex: "1 1 auto", fontSize: 13 }}>{vesselTypeLabel(v)}</span>
                    <input
                      value={destVol.get(v.id) ?? ""}
                      onChange={(e) => patchDestVol(v.id, e.target.value)}
                      inputMode="decimal"
                      aria-label={`Litres into ${vesselTypeLabel(v)}`}
                      style={{ ...field, width: 84, borderColor: destOverCap.includes(v.id) ? "var(--danger)" : "var(--border-strong)" }}
                    />
                    <span style={{ fontSize: 11, color: "var(--text-muted)", width: 70 }}>/ {v.capacityL} L</span>
                  </div>
                ))}
                <p style={{ fontSize: 12, marginTop: 8, color: Math.abs(unallocated) < 0.005 ? "var(--text-muted)" : "var(--danger)" }}>
                  Allocated {allocated} / {runningTotal} L
                  {Math.abs(unallocated) >= 0.005 ? ` · ${unallocated} L unallocated` : " ✓"}
                </p>
              </div>
            ) : null}

            {/* Mode banner */}
            {mode === "NEW_LOT" ? (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--accent-soft)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-accent)" }}>
                  Creating new lot {vintage.trim() || "NV"}-BL-{token.trim().toUpperCase() || "···"}
                  {isSplit ? ` · split across ${n} vessels` : ""}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={token} onChange={(e) => setToken(e.target.value.toUpperCase())} maxLength={4} placeholder="Tag" aria-label="Blend tag" style={{ ...field, width: 90 }} />
                  <input value={vintage} onChange={(e) => setVintage(e.target.value)} inputMode="numeric" placeholder="Vintage (opt)" aria-label="Vintage" style={{ ...field, width: 120 }} />
                </div>
              </div>
            ) : mode === "GROW_EXISTING" ? (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--surface-sunken)", borderRadius: "var(--radius-md)", fontSize: 13, fontWeight: 600 }}>
                Adding to {growCode}
              </div>
            ) : null}

            {/* Live composition */}
            {sources.length > 0 ? (
              <div style={{ marginTop: 14 }}>
                <Bars title="Variety" slices={rollup.byVariety} />
                <Bars title="Vineyard" slices={rollup.byVineyard} />
                <Bars title="Vintage" slices={rollup.byVintage} />
                {rollup.vintageEligible ? (
                  <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
                    {rollup.vintageEligible.year} eligible ({rollup.vintageEligible.pct}%)
                  </p>
                ) : null}
              </div>
            ) : null}

            <Button variant="primary" disabled={!canExecute} onClick={execute} style={{ width: "100%", minHeight: 44, marginTop: 16 }}>
              {pending ? "Blending…" : "Execute blend"}
            </Button>
            <p aria-live="polite" style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8, minHeight: 18 }}>{hint}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
