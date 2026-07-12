"use client";

import React from "react";
import { Card, Button, Badge } from "@/components/ui";
import type { WorkOrderTaskView } from "@/lib/work-orders/data";
import type { BottlingTaskFormData } from "@/lib/bottling/bottling-task-data";
import { startTaskAction, completeTaskAction } from "@/lib/work-orders/actions";
import { consumedForBottles, suggestBottles, casesAndLoose } from "@/lib/bottling/draw";
import { type PackagingPlanLine, theoreticalConsumption } from "@/lib/bottling/packaging-bom";

// Plan 053 E15: the run-time bottling sub-form on the work-order execute screen. Pick the source vessels,
// the bottle count, the measured ABV and the destination; the SAME completeTaskAction the generic executor
// uses runs runBottlingTx inside the work order's single ledger tx (real BOTTLE op + COGS + finished goods).
// The SKU name/vintage prefill from the template's process defaults (plannedPayload) but stay editable.

const big: React.CSSProperties = { fontSize: 16, padding: "12px 12px", minHeight: 44, borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface)", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 13, color: "var(--text-muted)", display: "block", marginBottom: 4 };

export function BottlingTaskForm({ task, data, onDone }: { task: WorkOrderTaskView; data: BottlingTaskFormData | null; onDone: () => void }) {
  const commandId = React.useMemo(() => crypto.randomUUID(), []);
  const planned = (task.plannedPayload ?? {}) as Record<string, unknown>;
  const vessels = data?.vessels ?? [];
  const locations = data?.locations ?? [];

  // Plan 056: the planned packaging BoM (glass/cork/capsule/label/case + per-line factor) authored on the
  // task. Actual consumption is DERIVED from the bottle count × factor; the crew edits only the variance.
  const plannedPackaging = React.useMemo<PackagingPlanLine[]>(
    () => (Array.isArray(planned.packaging) ? (planned.packaging as PackagingPlanLine[]).filter((l) => l && l.materialId) : []),
    [planned.packaging],
  );
  const pkgOptById = React.useMemo(() => new Map((data?.packagingOptions ?? []).map((o) => [o.id, o])), [data?.packagingOptions]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [skuName, setSkuName] = React.useState(planned.skuName != null ? String(planned.skuName) : "");
  const [skuVintage, setSkuVintage] = React.useState(planned.skuVintage != null ? String(planned.skuVintage) : String(new Date().getFullYear()));
  const [bottles, setBottles] = React.useState(planned.packagingBottles != null ? String(planned.packagingBottles) : "");
  const [abv, setAbv] = React.useState("");
  const [destinationLocationId, setDestinationLocationId] = React.useState(locations[0]?.id ?? "");
  const [note, setNote] = React.useState("");
  // Per-material ACTUAL override (blank/undefined ⇒ track the theoretical derived from the bottle count).
  const [actualOverride, setActualOverride] = React.useState<Record<string, string>>({});
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const availableL = vessels.filter((v) => selected.has(v.id)).reduce((a, v) => a + v.volumeL, 0);
  const bottleCount = Number(bottles) || 0;
  const consumedL = bottleCount > 0 ? consumedForBottles(bottleCount) : 0;
  const suggested = suggestBottles(availableL);
  const { cases, loose } = casesAndLoose(bottleCount);
  const short = consumedL > availableL + 1e-9;

  // Plan 056: per-line derived theoretical (bottles × factor) + resolved actual (override or theoretical).
  const packagingRows = plannedPackaging.map((line) => {
    const opt = pkgOptById.get(line.materialId);
    const theoretical = theoreticalConsumption(line, bottleCount);
    const ov = actualOverride[line.materialId];
    const actual = ov !== undefined && ov !== "" ? Math.max(0, Math.floor(Number(ov) || 0)) : theoretical;
    const onHand = opt?.onHand ?? null;
    const shortStock = onHand != null && actual > onHand;
    return { line, opt, theoretical, actual, onHand, shortStock };
  });
  const anyShortStock = packagingRows.some((r) => r.shortStock);

  function complete() {
    setError(null);
    const vesselIds = [...selected];
    if (vesselIds.length === 0) return setError("Pick at least one source vessel to bottle from.");
    if (!skuName.trim()) return setError("Give the bottled wine a name.");
    if (!(bottleCount >= 1)) return setError("Enter the number of bottles produced (at least 1).");
    const abvNum = Number(abv);
    if (!(abvNum > 0)) return setError("Enter the wine's alcohol by volume (%) — required to classify the wine for TTB.");
    if (!destinationLocationId) return setError("Pick a destination location for the bottles.");
    if (short) return setError(`Not enough wine: ${bottleCount} bottles need ${consumedL} L but only ${availableL} L is selected.`);

    const actualPayload: Record<string, unknown> = {
      vesselIds,
      destinationLocationId,
      skuName: skuName.trim(),
      skuVintage: Number(skuVintage) || new Date().getFullYear(),
      bottlesProduced: bottleCount,
      abv: abvNum,
      note: note.trim() || undefined,
    };
    // Plan 056: the ACTUAL packaging consumed (materialId + eaches). Zero-qty lines are dropped.
    const packaging = packagingRows.map((r) => ({ materialId: r.line.materialId, qty: r.actual })).filter((p) => p.qty > 0);
    if (packaging.length > 0) actualPayload.packaging = packaging;
    startTransition(async () => {
      try {
        await completeTaskAction({ taskId: task.id, commandId, actualPayload, completionNote: note.trim() || undefined });
        onDone();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't record the bottling.");
      }
    });
  }

  const canStart = task.status === "PENDING";
  const header = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 18 }}>{task.seq}. {task.title}</div>
        <Badge tone="gold">{task.status.replace(/_/g, " ").toLowerCase()}</Badge>
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 14px" }}>bottling</div>
    </>
  );

  if (vessels.length === 0) {
    return (
      <Card style={{ padding: 18 }}>
        {header}
        <div style={{ fontSize: 13.5, color: "var(--text-muted)" }}>Nothing to bottle — no active vessel is holding wine.</div>
      </Card>
    );
  }

  return (
    <Card style={{ padding: 18 }}>
      {header}

      <div style={lbl}>Source vessels (bottle from)</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
        {vessels.map((v) => (
          <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, padding: "6px 2px", cursor: "pointer" }}>
            <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggle(v.id)} style={{ width: 20, height: 20 }} />
            <span>{v.code} <span style={{ color: "var(--text-muted)", fontSize: 13 }}>· {v.volumeL} L · {v.lotSummary}</span></span>
          </label>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <label style={lbl}>Wine name
          <input value={skuName} onChange={(e) => setSkuName(e.target.value)} placeholder="e.g. Estate Merlot" style={big} />
        </label>
        <label style={lbl}>Vintage
          <input type="number" inputMode="numeric" step="1" value={skuVintage} onChange={(e) => setSkuVintage(e.target.value)} style={big} />
        </label>
        <label style={lbl}>Bottles produced
          <input type="number" inputMode="decimal" step="1" value={bottles} onChange={(e) => setBottles(e.target.value)} placeholder={suggested > 0 ? `up to ~${suggested}` : ""} style={big} />
        </label>
        <label style={lbl}>ABV (%)
          <input type="number" inputMode="decimal" step="any" value={abv} onChange={(e) => setAbv(e.target.value)} placeholder="e.g. 13.5" style={big} />
        </label>
        <label style={{ ...lbl, gridColumn: "1 / -1" }}>Destination location
          <select style={big} value={destinationLocationId} onChange={(e) => setDestinationLocationId(e.target.value)}>
            <option value="">— pick —</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </div>

      {plannedPackaging.length > 0 ? (
        <div style={{ marginTop: 16, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: 12, background: "var(--surface)" }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Packaging consumed (dry goods)</div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "2px 0 10px" }}>
            Theoretical is derived from the bottle count. Adjust only for breakage or mangled labels.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {packagingRows.map((r) => (
              <div key={r.line.materialId} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ flex: "1 1 150px", minWidth: 0, fontSize: 14, fontWeight: 500 }}>
                  {r.opt?.label ?? "packaging item"}
                  {r.onHand != null ? <span style={{ color: r.shortStock ? "var(--danger)" : "var(--text-muted)", fontWeight: 400, fontSize: 12 }}> · {Number(r.onHand).toLocaleString()}{r.opt?.unit ? ` ${r.opt.unit}` : ""} on hand</span> : null}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)", minWidth: 96 }}>Theoretical: {r.theoretical.toLocaleString()}</span>
                <label style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Actual
                  <input
                    type="number" inputMode="numeric" step="1" min="0"
                    value={actualOverride[r.line.materialId] !== undefined ? actualOverride[r.line.materialId] : String(r.theoretical)}
                    onChange={(e) => setActualOverride((prev) => ({ ...prev, [r.line.materialId]: e.target.value }))}
                    style={{ ...big, width: 110, minHeight: 40, marginLeft: 6, borderColor: r.shortStock ? "var(--danger)" : "var(--border)" }}
                  />
                </label>
              </div>
            ))}
          </div>
          {anyShortStock ? (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--danger)", border: "1px solid var(--danger)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
              Packaging cost incomplete — one or more items exceed on-hand stock. Bottling will still proceed (stock draws to zero), but the finished-goods cost will be flagged for reconciliation. Receive the missing packaging to correct it.
            </div>
          ) : null}
        </div>
      ) : null}

      <label style={{ ...lbl, marginTop: 12 }}>Note (optional)
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" style={big} />
      </label>

      <div style={{ fontSize: 13, color: short ? "var(--danger)" : "var(--text-muted)", marginTop: 12 }}>
        {bottleCount > 0 ? `${bottleCount} bottles (${cases}c + ${loose}) need ${consumedL} L` : "Enter a bottle count"}
        {availableL > 0 ? ` · ${availableL} L selected` : ""}
      </div>

      {error ? <div style={{ color: "var(--danger)", fontSize: 14, marginTop: 10 }}>{error}</div> : null}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        {canStart ? <Button size="lg" variant="secondary" disabled={pending} onClick={() => startTransition(async () => { await startTaskAction({ taskId: task.id }); })}>Start</Button> : null}
        <Button size="lg" fullWidth disabled={pending} onClick={complete}>{pending ? "Bottling…" : "Complete — record the bottling"}</Button>
      </div>
    </Card>
  );
}
