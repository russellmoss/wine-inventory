"use client";

import React from "react";
import { Card, Button, Badge, Eyebrow } from "@/components/ui";
import { SatelliteMap } from "@/components/ui/SatelliteMap.client";
import { loadVineyardDetail } from "@/lib/vineyard/actions";
import type { VineyardDetailPayload } from "@/lib/vineyard/data";
import { polygonsToVectorOverlay, type MapOverlay } from "@/lib/gis/overlay";
import {
  getPlantingStructure,
  loadPlantingAreasForMap,
  proposePlantingMigration,
  confirmPlantingMigration,
  type PlantingAreaMapRow,
} from "@/lib/plantingArea/actions";
import type { PlantingStructure } from "@/lib/plantingArea/planting-area-core";
import type { MigrationProposal } from "@/lib/plantingArea/migration-core";

type Vineyard = { id: string; name: string };

const PLANTING_STYLE = { color: "#f5c518", weight: 3, fillColor: "#f5c518", fillOpacity: 0.08, dashArray: "6 4" };

function sevColor(sev: string): string {
  if (sev === "MASK_BREAKING") return "var(--danger, #c0392b)";
  if (sev === "ADVISORY") return "var(--warning, #b8860b)";
  return "var(--success, #2e7d32)";
}

export function PlantingSetupClient({ vineyards, memberVineyardIds }: { vineyards: Vineyard[]; memberVineyardIds: string[] }) {
  const visible = vineyards.filter((v) => memberVineyardIds.length === 0 || memberVineyardIds.includes(v.id));
  const [selected, setSelected] = React.useState<Vineyard | null>(null);

  return (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
      <Card padding="var(--space-5)" style={{ flex: "0 0 260px", minWidth: 240 }}>
        <Eyebrow>Vineyard Intelligence</Eyebrow>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, margin: "6px 0 12px" }}>Planting setup</h2>
        {visible.length === 0 && <p style={{ color: "var(--text-muted)" }}>No vineyards available.</p>}
        {visible.map((v) => (
          <div key={v.id} style={{ padding: "8px 0", borderTop: "1px solid var(--border-strong)" }}>
            <Button variant={selected?.id === v.id ? "primary" : "secondary"} size="sm" onClick={() => setSelected(v)} style={{ width: "100%", justifyContent: "flex-start" }}>
              {v.name}
            </Button>
          </div>
        ))}
      </Card>

      {selected ? (
        <PlantingSetupPanel key={selected.id} vineyard={selected} />
      ) : (
        <Card padding="var(--space-5)" style={{ flex: 1, minWidth: 320 }}>
          <p style={{ color: "var(--text-muted)" }}>Select a vineyard to review its planting areas, migrate existing blocks, and inspect topology.</p>
        </Card>
      )}
    </div>
  );
}

function PlantingSetupPanel({ vineyard }: { vineyard: Vineyard }) {
  const [detail, setDetail] = React.useState<VineyardDetailPayload | null>(null);
  const [structure, setStructure] = React.useState<PlantingStructure | null>(null);
  const [plantings, setPlantings] = React.useState<PlantingAreaMapRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [proposals, setProposals] = React.useState<MigrationProposal[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  // No synchronous setState here: `loading` starts true and the panel remounts per vineyard (keyed in
  // the parent), so the first setState lands AFTER the await — keeps the effect free of a synchronous
  // setState (React 19 cascading-render lint rule).
  const refetch = React.useCallback(async () => {
    try {
      const [d, s, p] = await Promise.all([
        loadVineyardDetail(vineyard.id),
        getPlantingStructure(vineyard.id),
        loadPlantingAreasForMap(vineyard.id),
      ]);
      setDetail(d);
      setStructure(s);
      setPlantings(p);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [vineyard.id]);

  React.useEffect(() => {
    // Standard load-on-mount: refetch's setState lands after the await (async), not the synchronous
    // cascading render this rule targets. Same pattern as MapsClient's MapModal.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refetch();
  }, [refetch]);

  const overlays: MapOverlay[] = React.useMemo(
    () => (plantings.length ? [polygonsToVectorOverlay("planting-areas", plantings.map((p) => ({ geometry: p.geometry, properties: { name: p.name } })), PLANTING_STYLE, { title: "Planting areas", entries: [{ label: "Planting boundary", color: PLANTING_STYLE.color }] })] : []),
    [plantings],
  );

  async function onPropose() {
    setBusy("propose");
    setError(null);
    try {
      const res = await proposePlantingMigration(vineyard.id);
      setProposals(res.proposals);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onConfirm() {
    if (!proposals) return;
    setBusy("confirm");
    setError(null);
    try {
      await confirmPlantingMigration({
        vineyardId: vineyard.id,
        proposals: proposals.map((p) => ({ name: p.name, geometry: p.geometry, memberBlockIds: p.memberBlockIds })),
      });
      setProposals(null);
      await refetch();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card padding="var(--space-5)" style={{ flex: 1, minWidth: 360 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24 }}>{vineyard.name}</h2>
        {structure && (structure.migrated ? <Badge tone="green">Migrated</Badge> : <Badge tone="neutral">Not migrated</Badge>)}
      </div>

      {error && <p style={{ color: "var(--danger, #c0392b)", marginTop: 8 }}>{error}</p>}
      {loading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}

      {detail && (
        <div style={{ margin: "12px 0" }}>
          <SatelliteMap
            lat={detail.detail?.gpsLat ?? null}
            lng={detail.detail?.gpsLng ?? null}
            blocks={detail.blocks}
            unit="imperial"
            height={360}
            overlays={overlays}
            exportName={vineyard.name}
          />
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
            <span style={{ color: PLANTING_STYLE.color }}>▬</span> planting-area boundaries (governed layer stack) · blocks in their own colors
          </p>
        </div>
      )}

      {/* Planting areas + topology */}
      {structure && (
        <div style={{ marginTop: 8 }}>
          <Eyebrow>Planting areas ({structure.plantingAreas.length})</Eyebrow>
          {structure.plantingAreas.length === 0 && (
            <p style={{ color: "var(--text-muted)" }}>No planting areas yet. Migrate the existing blocks below, or draw one on the map.</p>
          )}
          {structure.plantingAreas.map((pa) => {
            const row = plantings.find((p) => p.id === pa.id);
            return (
              <div key={pa.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border-strong)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <strong>{pa.name}</strong>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{pa.source} · v{pa.geometryVersion} · {pa.blockCount} block{pa.blockCount === 1 ? "" : "s"}</span>
                </div>
                {row?.areaGeodesicM2 != null && (
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    Boundary footprint: {(row.areaGeodesicM2 / 4046.856).toFixed(2)} ac ({row.areaGeodesicM2.toFixed(0)} m²) — includes headlands/margins, for satellite analysis
                  </div>
                )}
                {pa.topology.map((f, i) => (
                  <div key={i} style={{ fontSize: 12, color: sevColor(f.severity), marginTop: 2 }}>
                    ⚠ {f.code}: {f.message}
                  </div>
                ))}
              </div>
            );
          })}
          {structure.unassignedBlocks.length > 0 && (
            <p style={{ fontSize: 12, color: "var(--warning, #b8860b)", marginTop: 8 }}>
              {structure.unassignedBlocks.length} block(s) not yet assigned to a planting area.
            </p>
          )}
        </div>
      )}

      {/* Migration flow */}
      {structure && !structure.migrated && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--border-strong)", paddingTop: 12 }}>
          <Eyebrow>Migrate existing blocks → planting areas</Eyebrow>
          {!proposals && (
            <>
              <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "6px 0" }}>
                Union your existing block polygons into proposed planting parents. Originals are never modified. Continuous blocks (touching within 1 m) group together; a road or creek keeps them apart.
              </p>
              <Button size="sm" onClick={onPropose} disabled={busy === "propose"}>{busy === "propose" ? "Proposing…" : "Propose planting areas"}</Button>
            </>
          )}
          {proposals && (
            <div style={{ marginTop: 8 }}>
              <p style={{ fontSize: 13, margin: "6px 0" }}>Review {proposals.length} proposed planting area{proposals.length === 1 ? "" : "s"}. Confirm outlines continuous vines (not a bridged road):</p>
              {proposals.map((p) => (
                <div key={p.index} style={{ padding: "8px 0", borderTop: "1px solid var(--border-strong)", fontSize: 13 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <strong>{p.name}</strong>
                    <span style={{ color: "var(--text-muted)" }}>{p.memberBlockIds.length} block(s) · {(p.areaGeodesicM2 / 4046.856).toFixed(2)} ac</span>
                  </div>
                  {p.defects.map((d, i) => (
                    <div key={i} style={{ color: sevColor(d.severity), fontSize: 12 }}>⚠ {d.code}: {d.message}</div>
                  ))}
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <Button size="sm" onClick={onConfirm} disabled={busy === "confirm"}>{busy === "confirm" ? "Migrating…" : "Confirm migration (all-or-nothing)"}</Button>
                <Button size="sm" variant="secondary" onClick={() => setProposals(null)} disabled={busy === "confirm"}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
