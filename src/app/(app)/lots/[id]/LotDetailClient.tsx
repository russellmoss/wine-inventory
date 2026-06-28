"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Metric, Button, Modal, ConfirmButton } from "@/components/ui";
import { formatL, type TimelineEvent, type TimelineLeg } from "@/lib/lot/timeline";
import type { LotDetail } from "@/lib/lot/data";
import { RATE_BASES, RATE_BASIS_LABELS, type RateBasis } from "@/lib/cellar/additions-math";
import { deleteOperationAction, editOperationAction, correctOperationAction } from "@/lib/cellar/actions";

type Tone = React.ComponentProps<typeof Badge>["tone"];

const NEUTRAL_OPS = new Set(["ADDITION", "FINING", "CAP_MGMT"]);
const REVERTABLE_OPS = new Set(["TOPPING", "FILTRATION", "LOSS"]);

function formLabel(form: string): string {
  const s = form.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function formTone(form: string): Tone {
  if (form === "FINISHED") return "green";
  if (form === "BOTTLED_IN_PROCESS") return "maroon";
  return "neutral";
}
function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}
function statusTone(status: string): Tone {
  return status === "ACTIVE" ? "green" : "neutral";
}

// Operation type -> Badge tone. Type is ALSO shown as text, so this is never color-only.
function opTone(type: string): Tone {
  switch (type) {
    case "SEED":
      return "green";
    case "RACK":
    case "TOPPING":
      return "blue";
    case "BOTTLE":
      return "maroon";
    case "LOSS":
    case "FILTRATION":
    case "CORRECTION":
      return "red";
    case "ADDITION":
    case "FINING":
    case "CAP_MGMT":
      return "gold";
    default:
      return "neutral"; // ADJUST, DEPLETE
  }
}

// Human label for an op type badge (sentence-case, never raw enum where it reads oddly).
function opLabel(type: string): string {
  switch (type) {
    case "CAP_MGMT":
      return "CAP MGMT";
    default:
      return type;
  }
}

function signed(leg: TimelineLeg): string {
  const sign = leg.deltaL >= 0 ? "+" : "−";
  return `${sign}${formatL(Math.abs(leg.deltaL))} L`;
}

function LegLine({ leg }: { leg: TimelineLeg }) {
  const vol = (
    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{signed(leg)}</span>
  );
  if (leg.isExternal) {
    return (
      <div style={{ color: "var(--text-muted)", fontSize: 13 }}>
        → outside the cellar{leg.reason ? ` (${leg.reason})` : ""} {vol}
      </div>
    );
  }
  return (
    <div style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "baseline" }}>
      {leg.vesselId ? (
        <Link href={`/vessels#vessel-${leg.vesselId}`} style={{ color: "var(--text-accent)" }}>
          {leg.label}
        </Link>
      ) : (
        <span style={{ color: "var(--text-secondary)" }}>{leg.label}</span>
      )}
      {vol}
    </div>
  );
}

/** Whether this event can be acted on from the timeline (edit/delete/revert). */
function isActionable(event: TimelineEvent): boolean {
  if (event.corrected || event.isCorrection) return false;
  return NEUTRAL_OPS.has(event.type) || REVERTABLE_OPS.has(event.type);
}

function TimelineItem({ event, editMode, onEdit }: { event: TimelineEvent; editMode: boolean; onEdit: (e: TimelineEvent) => void }) {
  const dim = event.corrected;
  return (
    <li
      style={{
        position: "relative",
        listStyle: "none",
        borderLeft: "1px solid var(--border-strong)",
        padding: "0 0 24px 20px",
        marginLeft: 4,
        opacity: dim ? 0.6 : 1,
      }}
    >
      {/* node on the rail */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: -5,
          top: 4,
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: "var(--surface-page)",
          border: "1.5px solid var(--border-strong)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
        <Badge tone={opTone(event.type)} variant="soft" uppercase>
          {opLabel(event.type)}
        </Badge>
        {event.corrected ? (
          <Badge tone="neutral" variant="outline">
            {event.voided ? "voided" : "corrected"}
          </Badge>
        ) : null}
        {editMode && isActionable(event) ? (
          <Button variant="ghost" size="sm" onClick={() => onEdit(event)} style={{ minHeight: 32, marginLeft: "auto" }}>
            Edit
          </Button>
        ) : null}
      </div>
      <div style={{ fontSize: 15.5, color: "var(--text-primary)", marginBottom: 4 }}>{event.summary}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: event.legs.length ? 8 : 0 }}>
        <time dateTime={event.observedAt}>{event.dateLabel}</time>
        {" · "}
        {event.enteredBy}
        {event.captureMethod && event.captureMethod !== "MANUAL" ? ` · ${event.captureMethod.toLowerCase()}` : ""}
      </div>
      {event.legs.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {event.legs.map((leg, i) => (
            <LegLine key={i} leg={leg} />
          ))}
        </div>
      ) : null}
      {event.note ? (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, fontStyle: "italic" }}>{event.note}</div>
      ) : null}
    </li>
  );
}

function LineageRefs({ label, refs }: { label: string; refs: { lotId: string; code: string }[] }) {
  if (refs.length === 0) return null;
  return (
    <div style={{ fontSize: 14, color: "var(--text-secondary)" }}>
      {label}:{" "}
      {refs.map((r, i) => (
        <React.Fragment key={r.lotId}>
          {i > 0 ? ", " : ""}
          <Link href={`/lots/${r.lotId}`} style={{ color: "var(--text-accent)" }}>
            {r.code}
          </Link>
        </React.Fragment>
      ))}
    </div>
  );
}

export function LotDetailClient({ lot }: { lot: LotDetail }) {
  const origin = [lot.varietyName, lot.vineyardName, lot.vintageYear != null ? String(lot.vintageYear) : null].filter(
    (x): x is string => !!x,
  );
  const empty = lot.current.locations.length === 0;

  const [editMode, setEditMode] = React.useState(false);
  const [selected, setSelected] = React.useState<TimelineEvent | null>(null);
  const anyActionable = lot.events.some(isActionable);

  return (
    <div>
      <Link href="/lots" style={{ fontSize: 13.5, color: "var(--text-accent)" }}>
        ‹ All lots
      </Link>

      {/* 1 — What it is */}
      <div style={{ marginTop: 10 }}>
        <Eyebrow rule>Lot</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "10px 0 6px" }}>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: 0 }}>{lot.code}</h1>
          <Badge tone={formTone(lot.form)} variant="soft">
            {formLabel(lot.form)}
          </Badge>
          <Badge tone={statusTone(lot.status)} variant="soft">
            {statusLabel(lot.status)}
          </Badge>
          {lot.isLegacy ? (
            <Badge tone="neutral" variant="soft">
              legacy
            </Badge>
          ) : null}
        </div>
      </div>

      {/* 2 — Where it is now + 3 — Provenance */}
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "stretch", margin: "16px 0 28px" }}>
        <Card style={{ flex: "1 1 280px" }}>
          {empty ? (
            <div>
              <Eyebrow tone="ink">Where it is now</Eyebrow>
              <p style={{ marginTop: 10, color: "var(--text-secondary)" }}>Not currently in any vessel.</p>
            </div>
          ) : (
            <>
              <Metric value={`${formatL(lot.current.totalL)} L`} caption="currently in the cellar" />
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 }}>
                {lot.current.locations.map((l) => (
                  <Link key={l.vesselId} href={`/vessels#vessel-${l.vesselId}`}>
                    <Badge tone="neutral" variant="soft">
                      {l.label} · {formatL(l.volumeL)} L
                    </Badge>
                  </Link>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card style={{ flex: "1 1 280px" }}>
          <Eyebrow tone="ink">Provenance</Eyebrow>
          <p style={{ marginTop: 10, fontSize: 16, color: "var(--text-primary)" }}>
            {origin.length ? origin.join(" · ") : "—"}
          </p>
          {lot.lineage.parents.length || lot.lineage.children.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
              <LineageRefs label="Blended from" refs={lot.lineage.parents} />
              <LineageRefs label="Split into" refs={lot.lineage.children} />
            </div>
          ) : null}
        </Card>
      </div>

      {/* Timeline rail */}
      <Eyebrow rule>History</Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", margin: "10px 0 18px" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 24, margin: 0 }}>Operation timeline</h2>
        {anyActionable ? (
          <Button variant={editMode ? "primary" : "ghost"} size="sm" onClick={() => setEditMode((v) => !v)} style={{ minHeight: 36 }}>
            {editMode ? "Done editing" : "Edit timeline"}
          </Button>
        ) : null}
      </div>
      {editMode ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "-8px 0 14px" }}>
          Pick an event to edit or remove. Additions, fining and cap management can be edited or deleted; topping,
          filtration and dumps can be reverted (they stay on the timeline, marked).
        </p>
      ) : null}
      <ol style={{ margin: 0, padding: 0 }}>
        {lot.events.map((e) => (
          <TimelineItem key={e.id} event={e} editMode={editMode} onEdit={setSelected} />
        ))}
      </ol>

      <TimelineEditModal event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// Edit/delete/revert one timeline event. Neutral ops (Add/Fine/Cap) are editable + hard-
// deletable; topping/filtration/dump are revertable (compensating correction). Every action
// confirms before applying, then refreshes the page from the server.
function TimelineEditModal({ event, onClose }: { event: TimelineEvent | null; onClose: () => void }) {
  if (!event) return null;
  // Key by op id so the panel remounts (fresh form state from props) per event — no effect.
  return (
    <Modal open onClose={onClose} title="Edit timeline event" subtitle={event.summary}>
      <EditPanel key={event.id} event={event} onClose={onClose} />
    </Modal>
  );
}

function EditPanel({ event, onClose }: { event: TimelineEvent; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const tr = event.treatments[0];
  const isDose = event.type === "ADDITION" || event.type === "FINING";
  const isCap = event.type === "CAP_MGMT";
  const isNeutral = NEUTRAL_OPS.has(event.type);
  const isRevertable = REVERTABLE_OPS.has(event.type);

  // Prefilled from the event's treatment via lazy initializers (no reset effect needed).
  const [material, setMaterial] = React.useState(tr?.materialName ?? "");
  const [rate, setRate] = React.useState(tr?.rateValue != null ? String(tr.rateValue) : "");
  const [basis, setBasis] = React.useState<RateBasis>((tr?.rateBasis as RateBasis) ?? "G_HL");
  const [capKind, setCapKind] = React.useState<"PUMPOVER" | "PUNCHDOWN">(tr?.kind === "PUNCHDOWN" ? "PUNCHDOWN" : "PUMPOVER");
  const [duration, setDuration] = React.useState(tr?.durationMin != null ? String(tr.durationMin) : "");
  const [note, setNote] = React.useState(event.note ?? "");

  function act(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onClose();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      }
    });
  }

  function saveEdit() {
    const opId = event.id;
    if (isDose) {
      const r = Number(rate);
      if (!material.trim() || !(r > 0)) {
        setError("Enter a material and a rate greater than 0.");
        return;
      }
      act(() => editOperationAction({ operationId: opId, materialName: material.trim(), rateValue: r, rateBasis: basis, note }));
    } else if (isCap) {
      act(() => editOperationAction({ operationId: opId, capKind, durationMin: duration ? Number(duration) : null, note }));
    }
  }

  const fieldStyle: React.CSSProperties = {
    height: 44,
    padding: "0 10px",
    border: "1px solid var(--border-strong)",
    borderRadius: "var(--radius-md)",
    background: "var(--surface-raised)",
    fontFamily: "var(--font-body)",
    fontSize: 14,
    color: "var(--text-primary)",
  };

  return (
    <div>
      <div>
        {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p> : null}

        {isDose ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            <input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="Material" style={fieldStyle} aria-label="Material" />
            <div style={{ display: "flex", gap: 8 }}>
              <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" placeholder="Rate" style={{ ...fieldStyle, width: 110 }} aria-label="Rate" />
              <select value={basis} onChange={(e) => setBasis(e.target.value as RateBasis)} style={{ ...fieldStyle, flex: 1 }} aria-label="Basis">
                {RATE_BASES.map((b) => (
                  <option key={b} value={b}>
                    {RATE_BASIS_LABELS[b]}
                  </option>
                ))}
              </select>
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={fieldStyle} aria-label="Note" />
            <ConfirmButton onConfirm={saveEdit} confirmLabel="Save changes" disabled={pending}>
              Save changes
            </ConfirmButton>
          </div>
        ) : null}

        {isCap ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            <select value={capKind} onChange={(e) => setCapKind(e.target.value as "PUMPOVER" | "PUNCHDOWN")} style={fieldStyle} aria-label="Cap kind">
              <option value="PUMPOVER">Pump-over</option>
              <option value="PUNCHDOWN">Punch-down</option>
            </select>
            <input value={duration} onChange={(e) => setDuration(e.target.value)} inputMode="decimal" placeholder="Minutes (optional)" style={fieldStyle} aria-label="Duration" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" style={fieldStyle} aria-label="Note" />
            <ConfirmButton onConfirm={saveEdit} confirmLabel="Save changes" disabled={pending}>
              Save changes
            </ConfirmButton>
          </div>
        ) : null}

        <div style={{ borderTop: "1px solid var(--border-strong)", paddingTop: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {isNeutral ? (
            <>
              <ConfirmButton onConfirm={() => act(() => deleteOperationAction(event.id))} confirmLabel="Delete it" disabled={pending}>
                Delete entirely
              </ConfirmButton>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Removes it from the timeline (an audit record is kept).</span>
            </>
          ) : isRevertable ? (
            <>
              <ConfirmButton onConfirm={() => act(() => correctOperationAction(event.id))} confirmLabel="Revert it" disabled={pending}>
                Revert
              </ConfirmButton>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Moved wine — it stays on the timeline, marked as reverted.</span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>This operation can&rsquo;t be edited or deleted from here.</span>
          )}
        </div>
      </div>
    </div>
  );
}
