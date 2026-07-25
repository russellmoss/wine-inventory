"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { enqueueNdviJobAction, runNdviSweepNowAction } from "@/lib/spatial/actions";
import type { SerializedBlock } from "@/lib/vineyard/data";
import { NdviMapPanel, type NdviDataset } from "./NdviMapPanel";

export type NdviJobRow = { id: string; status: string; withheldReason: string | null; faultClass: string | null; createdAt: string };
export type NdviBlockRow = { block: string; ndviMean: number | null; acquiredAt: string | null; validPct: number | null; flags: string[]; geometryVersion: number | null };
export type NdviDatasetRow = NdviDataset;

const STATUS_COLOR: Record<string, string> = {
  COMPLETED: "var(--success, #2e7d32)",
  WITHHELD: "var(--warning, #b26a00)",
  FAILED: "var(--danger, #b00020)",
  PENDING: "var(--text-secondary)",
  IN_FLIGHT: "var(--text-secondary)",
  PROCESSING: "var(--text-secondary)",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export function NdviConsole({ vineyards, selectedId, selectedName, jobs, blocks, mapBlocks, center, datasets }: {
  vineyards: { id: string; name: string }[];
  selectedId: string | null;
  selectedName: string | null;
  jobs: NdviJobRow[];
  blocks: NdviBlockRow[];
  mapBlocks: SerializedBlock[];
  center: { lat: number; lng: number } | null;
  datasets: NdviDatasetRow[];
}) {
  const router = useRouter();
  const [date, setDate] = useState(todayIso());
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (vineyards.length === 0) {
    return <Card><p style={{ color: "var(--text-secondary)", margin: 0 }}>No vineyards you can access. Ask an admin to assign one.</p></Card>;
  }

  const queue = () =>
    start(async () => {
      setMsg(null);
      if (!selectedId) return;
      try {
        const res = await enqueueNdviJobAction({ vineyardId: selectedId, aroundIso: new Date(date).toISOString() });
        setMsg(res.deduped ? "Already queued for that day." : "Queued. It processes on the next satellite sweep (or press “Run sweep now”).");
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Could not queue.");
      }
    });

  const runNow = () =>
    start(async () => {
      setMsg(null);
      try {
        const res = await runNdviSweepNowAction();
        setMsg(`Sweep done — ${res.summary.completed} completed, ${res.summary.withheld} withheld, ${res.summary.failed} failed.`);
        router.refresh();
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Sweep failed.");
      }
    });

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Vineyard picker */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {vineyards.map((v) => (
          <a
            key={v.id}
            href={`/vineyards/ndvi?vineyard=${v.id}`}
            style={{
              padding: "6px 12px", borderRadius: 8, textDecoration: "none", fontSize: 14,
              border: "1px solid var(--border)", background: v.id === selectedId ? "var(--surface-raised, #f0efe9)" : "transparent",
              color: v.id === selectedId ? "var(--text-primary)" : "var(--text-secondary)", fontWeight: v.id === selectedId ? 600 : 400,
            }}
          >
            {v.name}
          </a>
        ))}
      </div>

      {selectedId && (
        <Card>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13, color: "var(--text-secondary)" }}>
              Look around date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 14 }} />
            </label>
            <button onClick={queue} disabled={pending} style={btn(true)}>{pending ? "Working…" : `Queue NDVI look for ${selectedName}`}</button>
            <button onClick={runNow} disabled={pending} style={btn(false)}>Run sweep now</button>
          </div>
          {msg && <p style={{ margin: "12px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>{msg}</p>}
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>
            The search widens ±7→14→30 days to find the clearest Sentinel-2 scene. Contains modified Copernicus Sentinel data.
          </p>
        </Card>
      )}

      {/* NDVI map (P3) */}
      {selectedId && (
        <NdviMapPanel datasets={datasets} blocks={mapBlocks} center={center} vineyardName={selectedName ?? "Vineyard"} />
      )}

      {/* Per-block NDVI */}
      {selectedId && (
        <Card>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 10px" }}>Per-block NDVI</h2>
          {blocks.length === 0 ? (
            <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: 14 }}>No blocks with geometry yet.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--text-secondary)", fontSize: 12 }}>
                  <th style={th}>Block</th><th style={th}>NDVI mean</th><th style={th}>Acquired</th><th style={th}>Valid %</th><th style={th}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => (
                  <tr key={b.block} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={td}>{b.block}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{b.ndviMean === null ? "—" : b.ndviMean.toFixed(3)}</td>
                    <td style={td}>{b.acquiredAt ? b.acquiredAt.slice(0, 10) : "—"}</td>
                    <td style={{ ...td, fontVariantNumeric: "tabular-nums" }}>{b.validPct === null ? "—" : `${b.validPct}%`}</td>
                    <td style={{ ...td, color: "var(--text-secondary)", fontSize: 12 }}>{b.flags.includes("INSUFFICIENT_VALID_COVERAGE") ? "too cloudy" : b.ndviMean === null ? "no data" : `v${b.geometryVersion}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {/* Jobs */}
      {selectedId && jobs.length > 0 && (
        <Card>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, margin: "0 0 10px" }}>Recent jobs</h2>
          <div style={{ display: "grid", gap: 6 }}>
            {jobs.map((j) => (
              <div key={j.id} style={{ display: "flex", gap: 12, alignItems: "baseline", fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: STATUS_COLOR[j.status] ?? "var(--text-primary)", minWidth: 92 }}>{j.status}</span>
                <span style={{ color: "var(--text-secondary)" }}>{j.createdAt.slice(0, 16).replace("T", " ")}</span>
                {j.withheldReason && <span style={{ color: "var(--warning, #b26a00)" }}>{j.withheldReason}</span>}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

const btn = (primary: boolean): React.CSSProperties => ({
  padding: "8px 14px", borderRadius: 8, fontSize: 14, cursor: "pointer", border: "1px solid var(--border)",
  background: primary ? "var(--accent, #1a1a1a)" : "transparent", color: primary ? "var(--accent-contrast, #fff)" : "var(--text-primary)",
});
const th: React.CSSProperties = { padding: "4px 8px", fontWeight: 500 };
const td: React.CSSProperties = { padding: "6px 8px" };
