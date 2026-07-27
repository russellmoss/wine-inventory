"use client";

import React from "react";
import { Badge, Button, Card } from "@/components/ui";
import { getBlockSoilAction, pullBlockSoilAction } from "@/lib/soil/actions";
import type { BlockSoilContext, SoilSnapshotView } from "@/lib/soil/read";
import type { SoilComponent } from "@/lib/soil/schema";
import type { Unit } from "@/lib/vineyard/units";
import { formatAreaHa } from "@/lib/units/display";

// VI-P4 — the block panel's NRCS soil section. Cards-only (no map components). Every soil map unit gets
// its own property card (no blended block property — SOIL-1). Reads via getBlockSoilAction on mount and
// after a pull; the pull itself is pullBlockSoilAction (audited, tenant-scoped, geometry-version CAS).

// Plan 098 review: through the display authority (kills the twin inline conversion + the "ac" label).
function areaLabel(sqM: number, unit: Unit): string {
  return formatAreaHa(sqM / 10_000, unit === "metric" ? "HA" : "ACRES");
}
const pct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 1 : 0)}%`;

const CLASS_TONE: Record<string, "blue" | "gold"> = {
  water: "blue",
  "non-soil": "gold",
  uncovered: "gold",
};

function SoilCard({ c, unit }: { c: SoilComponent; unit: Unit }) {
  const isSoil = c.class === "soil" || c.class === "mixed";
  return (
    <div style={{ padding: "10px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface-raised)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text-primary)" }}>
          {pct(c.areaPct)} · {c.muname}
        </span>
        <span style={{ fontSize: 12.5, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{areaLabel(c.areaSqM, unit)}</span>
      </div>
      {c.class === "water" || c.class === "non-soil" ? (
        <div style={{ marginTop: 4 }}>
          <Badge tone={CLASS_TONE[c.class]} variant="soft">
            {c.class === "water" ? "Water — not a soil" : "Non-soil (rock/urban/pit)"}
          </Badge>
        </div>
      ) : null}
      {isSoil ? (
        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: "4px 14px", fontSize: 12.75, color: "var(--text-secondary)" }}>
          {c.drainageClass ? <span>{c.drainageClass}{c.drainageBasis ? ` (${c.drainageBasis})` : ""}</span> : null}
          {c.ph != null ? <span>pH {c.ph}{c.phBasis ? ` (${c.phBasis})` : ""}</span> : null}
          {c.restrictiveDepthCm != null ? <span>restrictive layer {c.restrictiveDepthCm} cm</span> : <span>no restrictive layer</span>}
          {c.comppct != null ? <span>major component {c.comppct}%</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Snapshot({ view, unit }: { view: SoilSnapshotView; unit: Unit }) {
  const [showSlivers, setShowSlivers] = React.useState(false);
  if (view.components == null) {
    return (
      <Badge tone="gold" variant="soft">
        Stored snapshot is unreadable — pull again to refresh.
      </Badge>
    );
  }
  const meaningful = view.components.filter((c) => c.class !== "uncovered" && !c.belowFloor);
  const slivers = view.components.filter((c) => c.belowFloor && c.class !== "uncovered");
  const uncovered = view.components.find((c) => c.class === "uncovered");

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>
        NRCS SSURGO · pulled {view.pulledAt.toLocaleDateString()} · {pct(view.coveredPct)} of the drawn boundary covered
        {view.surveyAreaSymbol ? ` · survey ${view.surveyAreaSymbol}` : ""}
        {view.surveyAreaVersion ? ` (${view.surveyAreaVersion})` : ""}
        {view.stale ? (
          <>
            {" "}
            <Badge tone="gold" variant="soft">Boundary changed — re-pull</Badge>
          </>
        ) : null}
      </div>

      {view.coverageState === "over" ? (
        <Badge tone="gold" variant="soft">Coverage exceeds the boundary — treat shares as approximate (possible overlap).</Badge>
      ) : null}
      {view.coverageState === "none" ? (
        <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>No NRCS survey coverage was returned for this location.</span>
      ) : null}

      {meaningful.map((c) => (
        <SoilCard key={c.mukey} c={c} unit={unit} />
      ))}

      {uncovered ? (
        <div style={{ fontSize: 13, color: "var(--warning)" }}>{pct(uncovered.areaPct)} of the boundary is uncovered by the survey.</div>
      ) : null}

      {slivers.length > 0 ? (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowSlivers((s) => !s)}>
            {showSlivers ? "Hide" : `Other (${slivers.length} sliver${slivers.length > 1 ? "s" : ""} under 1%)`}
          </Button>
          {showSlivers ? (
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {slivers.map((c) => (
                <SoilCard key={c.mukey} c={c} unit={unit} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>
        Areas are polygon-derived; planted acreage above is from row/vine spacing. {view.attribution}
      </div>
    </div>
  );
}

const ELIGIBILITY_HINT: Record<string, string> = {
  "no-polygon": "Draw a block boundary first, then pull soil.",
  "invalid-polygon": "This block's boundary can't be read — redraw it, then pull soil.",
  "out-of-region": "NRCS soil data covers the United States only.",
};

const PULL_MESSAGE: Record<string, string> = {
  "sda-unavailable": "NRCS didn't respond — the last snapshot is unchanged. Try again shortly.",
  "stale-during-fetch": "The boundary changed while pulling — nothing was overwritten. Pull again.",
  "out-of-region": "This block is outside NRCS (US) coverage.",
  "no-polygon": "Draw a boundary first.",
  "no-coverage": "No NRCS survey coverage for this location.",
};

export function BlockSoilCards({ blockId, unit }: { blockId: string; unit: Unit }) {
  const [ctx, setCtx] = React.useState<BlockSoilContext | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await getBlockSoilAction(blockId);
    if (res.ok) setCtx(res.data);
  }, [blockId]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot on-mount load of the block soil context
    void load();
  }, [load]);

  async function pull() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await pullBlockSoilAction(blockId, ctx?.view != null);
      if (res.ok && PULL_MESSAGE[res.data.state]) setMsg(PULL_MESSAGE[res.data.state]);
      else if (!res.ok) setMsg(res.error);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const eligibility = ctx?.eligibility ?? "ok";
  const canPull = eligibility === "ok" && !busy;
  const hasSnapshot = ctx?.view != null;

  return (
    <Card style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)" }}>Soil (NRCS SSURGO)</span>
        <Button variant={hasSnapshot ? "ghost" : "primary"} size="sm" onClick={pull} disabled={!canPull}>
          {busy ? "Pulling…" : hasSnapshot ? "Refresh soil" : "Pull soil"}
        </Button>
      </div>

      {eligibility !== "ok" ? (
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>{ELIGIBILITY_HINT[eligibility]}</div>
      ) : null}
      {msg ? (
        <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>{msg}</div>
      ) : null}

      <div style={{ marginTop: 12 }}>
        {ctx == null ? (
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</span>
        ) : ctx.view ? (
          <Snapshot view={ctx.view} unit={unit} />
        ) : eligibility === "ok" ? (
          <span style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>No soil pulled yet. Pull once to store a dated NRCS snapshot for this block.</span>
        ) : null}
      </div>
    </Card>
  );
}
