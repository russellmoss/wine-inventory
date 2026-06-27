"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import { createRef, setRefActive, setVarietyColor, setAbbreviation, type RefKind } from "@/lib/reference/actions";
import { effectiveColor } from "@/lib/vineyard/colors";
import { VineyardModal } from "./VineyardModal";

type Row = { id: string; name: string; isActive: boolean; abbreviation: string | null };
type VarietyRow = Row & { color: string | null };
type VarietyOption = { id: string; name: string; color: string | null };

/** Inline editor for a variety/vineyard lot-code abbreviation (saves on blur if changed). */
function AbbrInput({
  kind,
  id,
  name,
  value,
  pending,
  run,
}: {
  kind: RefKind;
  id: string;
  name: string;
  value: string | null;
  pending: boolean;
  run: (fn: () => Promise<void>, after?: () => void) => void;
}) {
  const original = value ?? "";
  const [val, setVal] = React.useState(original);
  // Keep in sync if the server value changes under us (e.g. after a save elsewhere).
  React.useEffect(() => setVal(original), [original]);
  return (
    <input
      value={val}
      onChange={(e) => setVal(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
      onBlur={() => {
        if (val.trim() !== original) run(() => setAbbreviation(kind, id, val.trim() || null));
      }}
      placeholder="abbr"
      maxLength={4}
      disabled={pending}
      aria-label={`Lot-code abbreviation for ${name}`}
      title={`Lot-code abbreviation for ${name}`}
      style={{
        width: 58,
        textAlign: "center",
        textTransform: "uppercase",
        fontVariantNumeric: "tabular-nums",
        fontSize: 12.5,
        letterSpacing: "0.04em",
        padding: "3px 6px",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-raised)",
        fontFamily: "var(--font-body)",
      }}
    />
  );
}

function useRunner() {
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (fn: () => Promise<void>, after?: () => void) => {
      setError(null);
      startTransition(async () => {
        try {
          await fn();
          after?.();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Something went wrong.");
        }
      });
    },
    [],
  );
  return { error, pending, run };
}

const addForm = (
  kind: RefKind,
  pending: boolean,
  run: (fn: () => Promise<void>, after?: () => void) => void,
) => (
  <form
    onSubmit={(e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const fd = new FormData(form);
      run(
        async () => {
          await createRef(kind, fd);
        },
        () => form.reset(),
      );
    }}
    style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 14 }}
  >
    <Input name="name" placeholder={kind === "variety" ? "e.g. Merlot" : "e.g. Paro Vineyard"} size="sm" style={{ flex: 1 }} required />
    <Input name="abbreviation" placeholder={kind === "variety" ? "MR" : "PR"} size="sm" maxLength={4} style={{ width: 72, textTransform: "uppercase" }} title="Lot-code abbreviation (optional; 2–4 chars)" />
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      Add
    </Button>
  </form>
);

function ListShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card padding="var(--space-5)" style={{ flex: 1, minWidth: 280 }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, marginBottom: 14 }}>
        {title}
      </h2>
      {children}
    </Card>
  );
}

const rowStyle = (isActive: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "8px 0",
  borderTop: "1px solid var(--border-strong)",
  opacity: isActive ? 1 : 0.55,
});

function VarietyList({ rows }: { rows: VarietyRow[] }) {
  const { error, pending, run } = useRunner();
  return (
    <ListShell title="Varieties">
      {addForm("variety", pending, run)}
      {error ? <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{error}</p> : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>None yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} style={rowStyle(r.isActive)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                <label
                  title="Map color"
                  style={{ display: "inline-flex", width: 22, height: 22, borderRadius: "var(--radius-xs)", overflow: "hidden", border: "1px solid var(--border-strong)", cursor: "pointer", flex: "0 0 auto" }}
                >
                  <input
                    type="color"
                    value={effectiveColor({ varietyColor: r.color, varietyId: r.id })}
                    disabled={pending}
                    onChange={(e) => run(() => setVarietyColor(r.id, e.target.value))}
                    aria-label={`Map color for ${r.name}`}
                    style={{ width: "150%", height: "150%", margin: "-25%", border: "none", padding: 0, background: "none", cursor: "pointer" }}
                  />
                </label>
                {r.name}
                <AbbrInput kind="variety" id={r.id} name={r.name} value={r.abbreviation} pending={pending} run={run} />
                {r.color ? (
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setVarietyColor(r.id, null))}>
                    reset color
                  </Button>
                ) : null}
                {!r.isActive ? <Badge tone="neutral" variant="soft">inactive</Badge> : null}
              </span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setRefActive("variety", r.id, !r.isActive))}>
                {r.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          ))
        )}
      </div>
    </ListShell>
  );
}

function VineyardList({ rows, varietyOptions }: { rows: Row[]; varietyOptions: VarietyOption[] }) {
  const { error, pending, run } = useRunner();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const openRow = rows.find((r) => r.id === openId) ?? null;

  return (
    <ListShell title="Vineyards">
      {addForm("vineyard", pending, run)}
      {error ? <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{error}</p> : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>None yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} style={rowStyle(r.isActive)}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <Button variant="link" size="sm" onClick={() => setOpenId(r.id)} style={{ fontSize: 15 }}>
                  {r.name}
                </Button>
                <AbbrInput kind="vineyard" id={r.id} name={r.name} value={r.abbreviation} pending={pending} run={run} />
                {!r.isActive ? <Badge tone="neutral" variant="soft">inactive</Badge> : null}
              </span>
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setRefActive("vineyard", r.id, !r.isActive))}>
                {r.isActive ? "Deactivate" : "Reactivate"}
              </Button>
            </div>
          ))
        )}
      </div>
      {openRow ? (
        <VineyardModal
          vineyardId={openRow.id}
          vineyardName={openRow.name}
          varietyOptions={varietyOptions}
          open={openId !== null}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </ListShell>
  );
}

export function ReferenceClient({
  varieties,
  vineyards,
  varietyOptions,
}: {
  varieties: VarietyRow[];
  vineyards: Row[];
  varietyOptions: VarietyOption[];
}) {
  return (
    <div>
      <Eyebrow rule>Reference data</Eyebrow>
      <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>
        Varieties &amp; vineyards
      </h1>
      <p style={{ color: "var(--text-secondary)", marginBottom: 24, maxWidth: "60ch" }}>
        Managed lists used when filling vessels and bottling. Items in use can&rsquo;t be deleted,
        only deactivated, so history stays intact. Click a vineyard to see its blocks and set it up.
      </p>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <VarietyList rows={varieties} />
        <VineyardList rows={vineyards} varietyOptions={varietyOptions} />
      </div>
    </div>
  );
}
