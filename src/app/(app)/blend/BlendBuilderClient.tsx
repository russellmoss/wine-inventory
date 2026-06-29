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

type SourceKey = string; // `${vesselId}::${lotId}`
type SelectedSource = {
  vesselId: string;
  vesselCode: string;
  lotId: string;
  code: string;
  available: number;
  drawL: string;
  deplete: boolean;
  varietyName: string | null;
  vineyardName: string | null;
  vintageYear: number | null;
};

const keyOf = (vesselId: string, lotId: string): SourceKey => `${vesselId}::${lotId}`;

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
  for (const pc of prefill.components) {
    if (pc.depleted || !pc.vesselId) continue;
    const v = vessels.find((x) => x.id === pc.vesselId);
    const r = v?.residents.find((x) => x.lotId === pc.lotId);
    if (!v || !r) continue;
    map.set(keyOf(v.id, r.lotId), {
      vesselId: v.id,
      vesselCode: v.code,
      lotId: r.lotId,
      code: r.code,
      available: r.volumeL,
      drawL: String(Math.min(pc.litres, r.volumeL) || r.volumeL),
      deplete: false,
      varietyName: r.varietyName,
      vineyardName: r.vineyardName,
      vintageYear: r.vintageYear,
    });
  }
  return map;
}

export function BlendBuilderClient({ vessels, prefill }: { vessels: BlendVessel[]; prefill?: TrialPrefill }) {
  const router = useRouter();
  const occupied = vessels.filter((v) => v.residents.length > 0);

  const [selected, setSelected] = React.useState<Map<SourceKey, SelectedSource>>(() => seedFromPrefill(vessels, prefill));
  const [destId, setDestId] = React.useState("");
  const [token, setToken] = React.useState("");
  const [vintage, setVintage] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  const sources = [...selected.values()];

  function toggle(v: BlendVessel, r: BlendVessel["residents"][number]) {
    const k = keyOf(v.id, r.lotId);
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(k)) next.delete(k);
      else
        next.set(k, {
          vesselId: v.id,
          vesselCode: v.code,
          lotId: r.lotId,
          code: r.code,
          available: r.volumeL,
          drawL: String(r.volumeL),
          deplete: false,
          varietyName: r.varietyName,
          vineyardName: r.vineyardName,
          vintageYear: r.vintageYear,
        });
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

  // Destination + mode. Empty vessel → NEW_LOT (needs a tag); one resident → GROW_EXISTING.
  const dest = vessels.find((v) => v.id === destId) ?? null;
  const destResidents = dest?.residents.length ?? 0;
  const mode: "NEW_LOT" | "GROW_EXISTING" | "INVALID" =
    !dest ? "INVALID" : destResidents === 0 ? "NEW_LOT" : destResidents === 1 ? "GROW_EXISTING" : "INVALID";
  const growCode = mode === "GROW_EXISTING" ? dest!.residents[0].code : null;

  // Running totals + live composition.
  const draws = sources.map((s) => ({ ...s, draw: Number(s.drawL) }));
  const runningTotal = Math.round(draws.reduce((a, s) => a + (Number.isFinite(s.draw) ? s.draw : 0), 0) * 100) / 100;
  const rollup = weightedRollup(
    draws.map((s) => ({ weight: Number.isFinite(s.draw) ? s.draw : 0, varietyName: s.varietyName, vineyardName: s.vineyardName, vintageYear: s.vintageYear })),
  );

  // Validation + interaction states.
  const overDrawn = draws.filter((s) => !(s.draw > 0) || s.draw > s.available + 1e-9).map((s) => keyOf(s.vesselId, s.lotId));
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
    !pending;

  let hint = "";
  if (!enough) hint = "Pick at least two wines to blend.";
  else if (mode === "INVALID" && !dest) hint = "Choose a destination vessel.";
  else if (mode === "INVALID") hint = "That vessel holds more than one lot — pick an empty vessel or one with a single lot.";
  else if (overDrawn.length) hint = "A draw exceeds what that position holds.";
  else if (mode === "NEW_LOT" && !tokenValid) hint = "Enter a 2–4 letter tag for the new blend lot.";

  function execute() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await blendLotsAction({
          mode: mode === "NEW_LOT" ? "NEW_LOT" : "GROW_EXISTING",
          components: draws.map((s) => ({ vesselId: s.vesselId, lotId: s.lotId, drawL: s.draw, deplete: s.deplete })),
          toVesselId: destId,
          ...(mode === "NEW_LOT" ? { token: token.trim(), vintage: vintageNum } : {}),
        });
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
        vessel with one lot grows that lot.
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
        {/* Main column: source picker + per-source volumes */}
        <div style={{ flex: "1 1 440px", minWidth: 300 }}>
          <Eyebrow tone="ink">Sources</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {occupied.map((v) =>
              v.residents.map((r) => {
                const k = keyOf(v.id, r.lotId);
                const sel = selected.get(k);
                const isDest = v.id === destId;
                return (
                  <Card key={k} padding="0" style={{ borderColor: sel ? "var(--accent)" : undefined, opacity: isDest ? 0.5 : 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", flexWrap: "wrap" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: isDest ? "default" : "pointer", flex: "1 1 200px" }}>
                        <input type="checkbox" checked={!!sel} disabled={isDest} onChange={() => toggle(v, r)} />
                        <span>
                          <span style={{ fontWeight: 600 }}>{r.code}</span>{" "}
                          <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
                            {[r.varietyName, r.vineyardName, r.vintageYear].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </span>
                        <Badge tone="neutral" variant="soft">{v.code}</Badge>
                        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{r.volumeL} L</span>
                      </label>
                      {sel ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            value={sel.drawL}
                            onChange={(e) => patch(k, { drawL: e.target.value })}
                            inputMode="decimal"
                            aria-label={`Litres of ${r.code} to blend`}
                            style={{ ...field, width: 90, borderColor: overDrawn.includes(k) ? "var(--danger)" : "var(--border-strong)" }}
                          />
                          <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--text-secondary)" }}>
                            <input type="checkbox" checked={sel.deplete} onChange={(e) => patch(k, { deplete: e.target.checked })} /> deplete
                          </label>
                        </div>
                      ) : null}
                    </div>
                  </Card>
                );
              }),
            )}
          </div>
        </div>

        {/* Sticky summary: total, mode banner, composition, execute */}
        <div style={{ flex: "0 1 320px", minWidth: 280, position: "sticky", top: 16 }}>
          <Card>
            <div style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Running total</div>
            <div style={{ fontSize: 30, fontFamily: "var(--font-display)", margin: "2px 0 12px" }}>{runningTotal} L</div>

            <label style={{ display: "block", fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 6 }}>Destination</label>
            <select value={destId} onChange={(e) => setDestId(e.target.value)} style={{ ...field, width: "100%" }} aria-label="Destination vessel">
              <option value="" disabled>Choose a vessel…</option>
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.code} ({v.residents.length === 0 ? "empty" : v.residents.length === 1 ? `holds ${v.residents[0].code}` : `${v.residents.length} lots`}, {v.capacityL} L)
                </option>
              ))}
            </select>

            {/* Mode banner */}
            {mode === "NEW_LOT" ? (
              <div style={{ marginTop: 12, padding: "10px 12px", background: "var(--accent-soft)", borderRadius: "var(--radius-md)" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-accent)" }}>
                  Creating new lot {vintage.trim() || "NV"}-BL-{token.trim().toUpperCase() || "···"}
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
