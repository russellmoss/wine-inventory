"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import { createBottlingRun } from "@/lib/bottling/actions";
import { suggestBottles, consumedForBottles, casesAndLoose } from "@/lib/bottling/draw";

export type VesselOpt = { id: string; code: string; availableL: number; contents: string[] };
export type LocOpt = { id: string; name: string };
export type RunRow = { id: string; date: string; sku: string; bottles: number; location: string; sources: string[] };

const selectStyle: React.CSSProperties = {
  height: 44,
  padding: "0 12px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-md)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  fontSize: 15,
  color: "var(--text-primary)",
  width: "100%",
};

export function BottlingClient({ vessels, locations, runs }: { vessels: VesselOpt[]; locations: LocOpt[]; runs: RunRow[] }) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [vesselId, setVesselId] = React.useState(vessels[0]?.id ?? "");
  const [bottles, setBottles] = React.useState<number>(0);

  const vessel = vessels.find((v) => v.id === vesselId);
  const maxBottles = vessel ? suggestBottles(vessel.availableL) : 0;
  const consumed = consumedForBottles(bottles || 0);
  const split = casesAndLoose(bottles || 0);

  React.useEffect(() => {
    // Default to the full suggested count when the vessel changes.
    setBottles(vessel ? suggestBottles(vessel.availableL) : 0);
  }, [vesselId]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    setError(null);
    startTransition(async () => {
      try {
        await createBottlingRun(fd);
        form.reset();
        setVesselId(vessels[0]?.id ?? "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Bottling failed.");
      }
    });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <Eyebrow rule>Bottling</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Bottle a vessel</h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "64ch" }}>
        Draw from a vessel into a bottled SKU. The wine is deducted proportionally across the
        vessel&rsquo;s components, and the run is traceable to its exact composition.
      </p>

      {vessels.length === 0 ? (
        <Card><p style={{ margin: 0, color: "var(--text-secondary)" }}>No vessels have wine to bottle. Fill one in <strong>Bulk wine</strong> first.</p></Card>
      ) : (
        <Card style={{ maxWidth: 640, marginBottom: 32 }}>
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Vessel</span>
              <select name="vesselId" value={vesselId} onChange={(e) => setVesselId(e.target.value)} style={selectStyle} required>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>{v.code} — {v.availableL} L available</option>
                ))}
              </select>
            </label>

            {vessel ? (
              <div style={{ fontSize: 13, color: "var(--text-muted)", background: "var(--surface-sunken)", padding: 12, borderRadius: "var(--radius-md)" }}>
                {vessel.contents.map((c, i) => <div key={i}>{c}</div>)}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <Input label="Wine name" name="skuName" placeholder="Ser Kem Marp Reserve" required style={{ flex: "1 1 220px" }} />
              <Input label="Vintage" name="skuVintage" type="number" placeholder="2025" required style={{ flex: "0 1 120px" }} />
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: "0 1 160px" }}>
                <Input
                  label={`Bottles (max ${maxBottles})`}
                  name="bottlesProduced"
                  type="number"
                  min="1"
                  max={maxBottles}
                  value={bottles || ""}
                  onChange={(e) => setBottles(Number(e.target.value))}
                  required
                />
              </div>
              <span style={{ fontSize: 13, color: "var(--text-muted)", paddingBottom: 12 }}>
                = {split.cases} cases + {split.loose} · uses {consumed} L
              </span>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 220px" }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" }}>Destination location</span>
                <select name="destinationLocationId" style={selectStyle} required defaultValue="">
                  <option value="" disabled>Choose location</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
              <Input label="Bottling date" name="date" type="date" defaultValue={today} style={{ flex: "0 1 180px" }} />
            </div>

            {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, margin: 0 }}>{error}</p> : null}
            <Button type="submit" variant="primary" disabled={pending || maxBottles < 1}>
              {pending ? "Bottling..." : "Record bottling run"}
            </Button>
          </form>
        </Card>
      )}

      <Eyebrow rule>Recent runs</Eyebrow>
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {runs.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>No bottling runs yet.</p>
        ) : (
          runs.map((r) => {
            const s = casesAndLoose(r.bottles);
            return (
              <Card key={r.id}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <strong>{r.sku}</strong>
                  <Badge tone="gold" variant="soft">{r.bottles} bottles · {s.cases}c + {s.loose}</Badge>
                </div>
                <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                  {r.date} → {r.location}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-muted)", marginTop: 8 }}>
                  {r.sources.map((src, i) => <div key={i}>↳ {src}</div>)}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
