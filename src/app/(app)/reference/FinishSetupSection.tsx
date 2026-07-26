"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Card } from "@/components/ui";
import { getPlantingStructure, autoCreatePlantingAreasAction } from "@/lib/plantingArea/actions";

// VI — "finish the vineyard" step, folded into the Reference vineyard editor (was a separate Planting
// setup page). Once blocks are drawn, one click groups them into planting area(s) (road-safe: only joins
// blocks touching within 1 m) so NDVI, soil, and the rest of the analysis layer just work. All-or-nothing;
// never mutates the block polygons.
export function FinishSetupSection({ vineyardId, hasBlocksWithPolygons }: { vineyardId: string; hasBlocksWithPolygons: boolean }) {
  const router = useRouter();
  const [migrated, setMigrated] = React.useState<boolean | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const s = await getPlantingStructure(vineyardId);
      setMigrated(s.migrated);
    } catch {
      setMigrated(null);
    }
  }, [vineyardId]);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot load of the planting status
    void load();
  }, [load]);

  async function finish() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await autoCreatePlantingAreasAction(vineyardId);
      if (res.ok) {
        const n = res.data.createdIds.length;
        setMsg(`Done — created ${n} planting area${n === 1 ? "" : "s"}. Soil and NDVI are ready for this vineyard.`);
        await load();
        router.refresh();
      } else {
        setMsg(res.error);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card style={{ marginTop: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)" }}>Finish setup</span>
          {migrated === true ? <Badge tone="green" variant="soft">Planting area ready</Badge> : null}
        </span>
        {migrated === false && hasBlocksWithPolygons ? (
          <Button variant="primary" size="sm" onClick={finish} disabled={busy}>
            {busy ? "Finishing…" : "Create planting area"}
          </Button>
        ) : null}
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
        {migrated === null ? (
          "Checking setup…"
        ) : migrated === true ? (
          "This vineyard is fully set up — NDVI, soil, and analysis layers are enabled on Map Explorer."
        ) : !hasBlocksWithPolygons ? (
          "Draw each block's boundary on the map above, then finish setup to enable NDVI + soil for this vineyard."
        ) : (
          "Your blocks are drawn. One click groups them into a planting area (roads keep separate blocks apart) so NDVI + soil work for this vineyard."
        )}
      </div>
      {msg ? <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>{msg}</div> : null}
    </Card>
  );
}
