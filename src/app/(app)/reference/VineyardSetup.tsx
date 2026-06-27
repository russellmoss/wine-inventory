"use client";

import React from "react";
import { Button, ConfirmButton, Badge } from "@/components/ui";
import {
  upsertVineyardDetail,
  createBlock,
  updateBlock,
  deleteBlock,
  setBlockColor,
  saveBlockPolygon,
  createSubblock,
  deleteSubblock,
} from "@/lib/vineyard/actions";
import { effectiveColor } from "@/lib/vineyard/colors";
import {
  blockArea,
  fromCanonicalSpacing,
  toCanonicalSpacing,
  formatArea,
  vinesPerRow,
  spacingUnitLabel,
  type Unit,
} from "@/lib/vineyard/units";
import type { SerializedBlock, SerializedDetail } from "@/lib/vineyard/data";
import { BlockDetails } from "./BlockDetails";

type VarietyOption = { id: string; name: string; color: string | null };

export interface VineyardSetupProps {
  vineyardId: string;
  detail: SerializedDetail | null;
  blocks: SerializedBlock[];
  varietyOptions: VarietyOption[];
  unit: Unit;
  /** When true, the per-block "Draw / edit shape" button drives the shared map's draw mode. */
  drawEnabled?: boolean;
  /** The block currently in draw mode (owned by VineyardModal), or null. */
  activeBlockId?: string | null;
  /** Toggle draw mode for a block on the shared map. */
  onDraw?: (blockId: string) => void;
  onChanged: () => void;
}

const sel: React.CSSProperties = {
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

const fieldInput: React.CSSProperties = { ...sel, height: 40, fontSize: 14 };

type BlockDraft = {
  blockLabel: string;
  numRows: string;
  rowSpacing: string;
  vineSpacing: string;
  varietyId: string;
  clone: string;
  rootstock: string;
  vineCount: string;
  yearPlanted: string;
  irrigated: string; // "", "yes", "no"
  color: string; // "" = inherit variety color
};

function numStr(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "";
  return String(Number(v.toFixed(4)));
}

function draftFromBlock(b: SerializedBlock, unit: Unit): BlockDraft {
  return {
    blockLabel: b.blockLabel ?? "",
    numRows: b.numRows != null ? String(b.numRows) : "",
    rowSpacing: numStr(fromCanonicalSpacing(b.rowSpacingM, unit)),
    vineSpacing: numStr(fromCanonicalSpacing(b.vineSpacingM, unit)),
    varietyId: b.varietyId ?? "",
    clone: b.clone ?? "",
    rootstock: b.rootstock ?? "",
    vineCount: b.vineCount != null ? String(b.vineCount) : "",
    yearPlanted: b.yearPlanted != null ? String(b.yearPlanted) : "",
    irrigated: b.irrigated == null ? "" : b.irrigated ? "yes" : "no",
    color: b.color ?? "",
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-secondary)" }}>{label}</span>
      {children}
    </label>
  );
}

export function VineyardSetup({
  vineyardId,
  detail,
  blocks,
  varietyOptions,
  unit,
  drawEnabled = false,
  activeBlockId = null,
  onDraw,
  onChanged,
}: VineyardSetupProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<BlockDraft | null>(null);
  const [draftUnit, setDraftUnit] = React.useState<Unit>(unit);
  const [viewId, setViewId] = React.useState<string | null>(null); // read-only detail open

  const spLabel = spacingUnitLabel(unit);

  // When the unit toggles mid-edit, re-seed the draft's spacing from the block's
  // canonical value so the displayed numbers always mean the active unit. Done
  // during render (React's sanctioned "adjust state on prop change" pattern).
  if (draftUnit !== unit) {
    setDraftUnit(unit);
    if (expandedId && draft) {
      const b = blocks.find((x) => x.id === expandedId);
      if (b) {
        setDraft({
          ...draft,
          rowSpacing: numStr(fromCanonicalSpacing(b.rowSpacingM, unit)),
          vineSpacing: numStr(fromCanonicalSpacing(b.vineSpacingM, unit)),
        });
      }
    }
  }

  function run(fn: () => Promise<void>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        after?.();
        onChanged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function expand(b: SerializedBlock) {
    setError(null);
    setViewId(null);
    setExpandedId(b.id);
    setDraft(draftFromBlock(b, unit));
  }
  function collapse() {
    setExpandedId(null);
    setDraft(null);
  }
  function toggleView(id: string) {
    setViewId((cur) => (cur === id ? null : id));
  }

  function draftFormData(d: BlockDraft): FormData {
    const fd = new FormData();
    fd.set("unit", unit);
    fd.set("blockLabel", d.blockLabel);
    fd.set("numRows", d.numRows);
    fd.set("rowSpacing", d.rowSpacing);
    fd.set("vineSpacing", d.vineSpacing);
    fd.set("varietyId", d.varietyId);
    fd.set("clone", d.clone);
    fd.set("rootstock", d.rootstock);
    fd.set("vineCount", d.vineCount);
    fd.set("yearPlanted", d.yearPlanted);
    fd.set("irrigated", d.irrigated);
    fd.set("color", d.color);
    return fd;
  }

  function saveBlock(id: string) {
    if (!draft) return;
    run(() => updateBlock(id, draftFormData(draft)), collapse);
  }

  // Live computed planted area for the expanded draft (in the active unit).
  const draftArea = React.useMemo(() => {
    if (!draft) return null;
    // convert displayed spacing back to canonical meters for the math
    const rM = toCanonicalSpacing(Number(draft.rowSpacing), unit);
    const vM = toCanonicalSpacing(Number(draft.vineSpacing), unit);
    return blockArea(rM, vM, Number(draft.vineCount), unit);
  }, [draft, unit]);

  function detailVal(name: keyof SerializedDetail, fallback = ""): string {
    const v = detail?.[name];
    return v == null ? fallback : String(v);
  }
  const elevationDisplay =
    detail?.elevationM == null ? "" : numStr(fromCanonicalSpacing(detail.elevationM, unit));

  return (
    <div>
      {error ? (
        <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p>
      ) : null}

      {/* ── Vineyard metadata ─────────────────────────────── */}
      <form
        key={`${vineyardId}-${unit}`}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          fd.set("unit", unit);
          run(() => upsertVineyardDetail(vineyardId, fd));
        }}
        style={{ marginBottom: 24 }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 12,
          }}
        >
          <Field label="Latitude">
            <input name="gpsLat" defaultValue={detailVal("gpsLat")} placeholder="27.4728" style={fieldInput} inputMode="decimal" />
          </Field>
          <Field label="Longitude">
            <input name="gpsLng" defaultValue={detailVal("gpsLng")} placeholder="89.6390" style={fieldInput} inputMode="decimal" />
          </Field>
          <Field label={`Elevation (${spLabel})`}>
            <input name="elevation" defaultValue={elevationDisplay} placeholder={unit === "metric" ? "e.g. 2300" : "e.g. 7500"} style={fieldInput} inputMode="decimal" />
          </Field>
          <Field label="Soil type">
            <input name="soilType" defaultValue={detailVal("soilType")} placeholder="e.g. schist" style={fieldInput} />
          </Field>
          <Field label="Vineyard manager">
            <input name="manager" defaultValue={detailVal("manager")} placeholder="Name" style={fieldInput} />
          </Field>
        </div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          Save details
        </Button>
      </form>

      {/* ── Blocks ────────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 18, margin: 0 }}>
          Blocks
        </h3>
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() => run(() => createBlock(vineyardId, (() => { const fd = new FormData(); fd.set("unit", unit); return fd; })()))}
        >
          Add block
        </Button>
      </div>

      {blocks.length === 0 ? (
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          No blocks yet. Add a block to record what&rsquo;s planted.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          {blocks.map((b) => {
            const expanded = expandedId === b.id;
            const color = effectiveColor({ blockColor: b.color, varietyColor: b.variety?.color, varietyId: b.varietyId });
            const area = blockArea(b.rowSpacingM, b.vineSpacingM, b.vineCount, unit);
            return (
              <div key={b.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                {/* Compact row — clicking the info area opens a read-only summary */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => toggleView(b.id)}
                    aria-expanded={viewId === b.id}
                    title="Show block details"
                    style={{
                      flex: 1,
                      minWidth: 220,
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: 0,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      font: "inherit",
                      color: "inherit",
                    }}
                  >
                    <span aria-hidden style={{ width: 14, height: 14, borderRadius: "var(--radius-xs)", background: color, border: "1px solid var(--border-subtle)", flex: "0 0 auto" }} />
                    <span aria-hidden style={{ color: "var(--text-muted)", fontSize: 13, transform: viewId === b.id ? "rotate(90deg)" : "none", transition: "transform var(--duration-fast, 0.15s) ease", display: "inline-block", flex: "0 0 auto" }}>▸</span>
                    <span style={{ minWidth: 80, fontSize: 14.5 }}>{b.blockLabel || "Untitled block"}</span>
                    <span style={{ flex: 1, minWidth: 100, color: "var(--text-secondary)", fontSize: 13.5 }}>
                      {b.variety?.name ?? <span style={{ color: "var(--text-muted)" }}>No variety</span>}
                    </span>
                    <span style={{ fontSize: 13.5, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>
                      {b.vineCount != null ? `${b.vineCount} vines` : "—"}
                    </span>
                    <span style={{ fontSize: 13.5, fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}>
                      {area != null ? formatArea(area, unit) : "—"}
                    </span>
                  </button>
                  <Button
                    variant={activeBlockId === b.id ? "primary" : "ghost"}
                    size="sm"
                    disabled={!drawEnabled}
                    onClick={() => onDraw?.(b.id)}
                    title={
                      drawEnabled
                        ? "Draw / edit this block's shape on the map"
                        : "Add a location in Set up to draw shapes"
                    }
                  >
                    {activeBlockId === b.id
                      ? "Cancel draw"
                      : b.polygon != null
                        ? "Edit shape"
                        : "Draw shape"}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => (expanded ? collapse() : expand(b))}>
                    {expanded ? "Close" : "Edit"}
                  </Button>
                </div>

                {/* Read-only summary (click the row); hidden while editing */}
                {viewId === b.id && !expanded ? (
                  <div style={{ padding: "4px 14px 16px", background: "var(--surface-sunken)" }}>
                    <BlockDetails block={b} unit={unit} />
                    <div style={{ display: "flex", marginTop: 14 }}>
                      <span style={{ flex: 1 }} />
                      <Button variant="ghost" size="sm" onClick={() => expand(b)}>
                        Edit block
                      </Button>
                    </div>
                  </div>
                ) : null}

                {/* Expanded editor */}
                {expanded && draft ? (
                  <div style={{ padding: "4px 14px 16px", background: "var(--surface-sunken)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                      <Field label="Block #">
                        <input value={draft.blockLabel} onChange={(e) => setDraft({ ...draft, blockLabel: e.target.value })} placeholder="e.g. Block 1" style={fieldInput} />
                      </Field>
                      <Field label="# of rows">
                        <input value={draft.numRows} onChange={(e) => setDraft({ ...draft, numRows: e.target.value })} inputMode="numeric" style={fieldInput} />
                      </Field>
                      <Field label={`Row spacing (${spLabel})`}>
                        <input value={draft.rowSpacing} onChange={(e) => setDraft({ ...draft, rowSpacing: e.target.value })} inputMode="decimal" style={fieldInput} />
                      </Field>
                      <Field label={`Vine spacing (${spLabel})`}>
                        <input value={draft.vineSpacing} onChange={(e) => setDraft({ ...draft, vineSpacing: e.target.value })} inputMode="decimal" style={fieldInput} />
                      </Field>
                      <Field label="Variety">
                        <select value={draft.varietyId} onChange={(e) => setDraft({ ...draft, varietyId: e.target.value })} style={fieldInput}>
                          <option value="">— none —</option>
                          {varietyOptions.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Clone">
                        <input value={draft.clone} onChange={(e) => setDraft({ ...draft, clone: e.target.value })} placeholder="e.g. 115" style={fieldInput} />
                      </Field>
                      <Field label="Rootstock">
                        <input value={draft.rootstock} onChange={(e) => setDraft({ ...draft, rootstock: e.target.value })} placeholder="e.g. 3309C" style={fieldInput} />
                      </Field>
                      <Field label="# of vines">
                        <input value={draft.vineCount} onChange={(e) => setDraft({ ...draft, vineCount: e.target.value })} inputMode="numeric" style={fieldInput} />
                      </Field>
                      <Field label="Year planted">
                        <input value={draft.yearPlanted} onChange={(e) => setDraft({ ...draft, yearPlanted: e.target.value })} inputMode="numeric" placeholder="e.g. 2018" style={fieldInput} />
                      </Field>
                      <Field label="Irrigation">
                        <select value={draft.irrigated} onChange={(e) => setDraft({ ...draft, irrigated: e.target.value })} style={fieldInput}>
                          <option value="">—</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      </Field>
                      <Field label="Polygon color">
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 40 }}>
                          <input
                            type="color"
                            value={effectiveColor({ blockColor: draft.color, varietyColor: b.variety?.color, varietyId: draft.varietyId })}
                            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                            style={{ width: 40, height: 36, padding: 0, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-sm)", background: "var(--surface-raised)", cursor: "pointer" }}
                            aria-label="Polygon color override"
                          />
                          {draft.color ? (
                            <Button variant="ghost" size="sm" onClick={() => setDraft({ ...draft, color: "" })}>
                              Use variety color
                            </Button>
                          ) : (
                            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Using variety color</span>
                          )}
                        </span>
                      </Field>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "14px 0", flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5 }}>
                        Planted area (spacing-based):{" "}
                        <strong style={{ fontVariantNumeric: "tabular-nums" }}>
                          {draftArea != null ? formatArea(draftArea, unit) : "—"}
                        </strong>
                      </span>
                      {vinesPerRow(Number(draft.vineCount), Number(draft.numRows)) != null ? (
                        <Badge tone="neutral" variant="soft">
                          ~{Math.round(vinesPerRow(Number(draft.vineCount), Number(draft.numRows))!)} vines/row
                        </Badge>
                      ) : null}
                    </div>

                    <div style={{ borderTop: "1px solid var(--border-strong)", paddingTop: 12, marginBottom: 14 }}>
                      <div style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
                        Subblocks{" "}
                        <span style={{ textTransform: "none", letterSpacing: 0 }}>
                          (optional · differential picks / experiments · appear in lot codes)
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                        {b.subblocks.length === 0 ? (
                          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>None.</span>
                        ) : (
                          b.subblocks.map((sb) => (
                            <span
                              key={sb.id}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 6px 3px 10px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-pill)", fontSize: 13 }}
                            >
                              <strong style={{ letterSpacing: "0.03em" }}>{sb.code}</strong>
                              {sb.label ? <span style={{ color: "var(--text-muted)" }}>{sb.label}</span> : null}
                              <button
                                type="button"
                                onClick={() => run(() => deleteSubblock(sb.id))}
                                disabled={pending}
                                aria-label={`Remove subblock ${sb.code}`}
                                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 16, lineHeight: 1, padding: 0 }}
                              >
                                ×
                              </button>
                            </span>
                          ))
                        )}
                      </div>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const fd = new FormData(form);
                          run(() => createSubblock(b.id, fd), () => form.reset());
                        }}
                        style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}
                      >
                        <input name="code" placeholder="Code (e.g. A)" maxLength={8} required style={{ ...fieldInput, width: 120, textTransform: "uppercase" }} />
                        <input name="label" placeholder="Label (optional)" style={{ ...fieldInput, width: 170 }} />
                        <Button type="submit" variant="secondary" size="sm" disabled={pending}>Add subblock</Button>
                      </form>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Button variant="primary" size="sm" disabled={pending} onClick={() => saveBlock(b.id)}>
                        Save block
                      </Button>
                      <Button variant="ghost" size="sm" disabled={pending} onClick={collapse}>
                        Cancel
                      </Button>
                      <span style={{ flex: 1 }} />
                      {b.polygon != null ? (
                        <ConfirmButton
                          confirmLabel="Clear shape"
                          onConfirm={() => run(() => saveBlockPolygon(b.id, null))}
                          disabled={pending}
                        >
                          Clear shape
                        </ConfirmButton>
                      ) : null}
                      {b.color ? (
                        <ConfirmButton
                          confirmLabel="Clear color"
                          onConfirm={() => run(() => setBlockColor(b.id, null))}
                          disabled={pending}
                        >
                          Clear color
                        </ConfirmButton>
                      ) : null}
                      <ConfirmButton onConfirm={() => run(() => deleteBlock(b.id), collapse)} disabled={pending}>
                        Delete block
                      </ConfirmButton>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
