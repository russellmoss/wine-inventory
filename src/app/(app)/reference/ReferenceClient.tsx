"use client";

import React from "react";
import { Card, Input, Button, Badge, Eyebrow } from "@/components/ui";
import {
  createRef,
  setRefActive,
  setVarietyColor,
  setAbbreviation,
  setVarietyDetails,
  type RefKind,
} from "@/lib/reference/actions";
import {
  BERRY_COLORS,
  VINE_SPECIES,
  BERRY_COLOR_LABELS,
  VINE_SPECIES_LABELS,
  MAX_DETAIL_LENGTH,
  type VarietyDetails,
} from "@/lib/reference/variety-details";
import { effectiveColor } from "@/lib/vineyard/colors";
import { VineyardModal } from "./VineyardModal";

type Row = { id: string; name: string; isActive: boolean; abbreviation: string | null };
type VarietyRow = Row & { color: string | null } & VarietyDetails;
type VarietyOption = { id: string; name: string; color: string | null };

/** The three free-text detail fields, in the order the winemaker thinks about them. */
const DETAIL_TEXT_FIELDS = [
  { key: "clone", label: "Clone", placeholder: "e.g. Dijon 115" },
  { key: "rootstock", label: "Rootstock", placeholder: "e.g. 101-14" },
  { key: "nursery", label: "Nursery", placeholder: "e.g. Novavine" },
] as const satisfies ReadonlyArray<{ key: keyof VarietyDetails; label: string; placeholder: string }>;

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 3,
  display: "block",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  fontSize: 13,
  padding: "5px 6px",
  border: "1px solid var(--border-strong)",
  borderRadius: "var(--radius-sm)",
  background: "var(--surface-raised)",
  fontFamily: "var(--font-body)",
  color: "var(--text-primary)",
};

/**
 * The five optional detail inputs, shared by the add form (uncontrolled, read from FormData)
 * and the per-row editor (controlled). `values`/`onChange` present => controlled.
 */
function VarietyDetailFields({
  disabled,
  values,
  onChange,
}: {
  disabled: boolean;
  values?: VarietyDetails;
  onChange?: (patch: Partial<VarietyDetails>) => void;
}) {
  const controlled = !!values && !!onChange;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
      {DETAIL_TEXT_FIELDS.map((f) => (
        <div key={f.key}>
          <label htmlFor={`variety-${f.key}`} style={labelStyle}>
            {f.label}
          </label>
          <Input
            id={`variety-${f.key}`}
            name={f.key}
            size="sm"
            placeholder={f.placeholder}
            maxLength={MAX_DETAIL_LENGTH}
            disabled={disabled}
            {...(controlled
              ? {
                  value: values[f.key] ?? "",
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    onChange({ [f.key]: e.target.value } as Partial<VarietyDetails>),
                }
              : {})}
          />
        </div>
      ))}
      <div>
        <label htmlFor="variety-berryColor" style={labelStyle}>
          Color
        </label>
        <select
          id="variety-berryColor"
          name="berryColor"
          disabled={disabled}
          style={selectStyle}
          {...(controlled
            ? {
                value: values.berryColor ?? "",
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                  onChange({ berryColor: (e.target.value || null) as VarietyDetails["berryColor"] }),
              }
            : {})}
        >
          <option value="">—</option>
          {BERRY_COLORS.map((c) => (
            <option key={c} value={c}>
              {BERRY_COLOR_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="variety-species" style={labelStyle}>
          Species
        </label>
        <select
          id="variety-species"
          name="species"
          disabled={disabled}
          style={selectStyle}
          {...(controlled
            ? {
                value: values.species ?? "",
                onChange: (e: React.ChangeEvent<HTMLSelectElement>) =>
                  onChange({ species: (e.target.value || null) as VarietyDetails["species"] }),
              }
            : {})}
        >
          <option value="">—</option>
          {VINE_SPECIES.map((s) => (
            <option key={s} value={s}>
              {VINE_SPECIES_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

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
  // Re-sync when the server value changes under us (React's adjust-state-during-render
  // pattern — not an effect), e.g. after a save elsewhere refreshes the list.
  const [prevOriginal, setPrevOriginal] = React.useState(original);
  if (original !== prevOriginal) {
    setPrevOriginal(original);
    setVal(original);
  }
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

function AddForm({
  kind,
  pending,
  run,
}: {
  kind: RefKind;
  pending: boolean;
  run: (fn: () => Promise<void>, after?: () => void) => void;
}) {
  // Opt-in, per the ticket: the details stay folded away so adding a variety is still one
  // box and a button. Nothing is submitted from a section that was never opened.
  const [showDetails, setShowDetails] = React.useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        run(
          async () => {
            await createRef(kind, fd);
          },
          () => {
            form.reset();
            setShowDetails(false);
          },
        );
      }}
      style={{ marginBottom: 14 }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <Input name="name" placeholder={kind === "variety" ? "e.g. Merlot" : "e.g. Paro Vineyard"} size="sm" style={{ flex: 1 }} required />
        <Input name="abbreviation" placeholder={kind === "variety" ? "MR" : "PR"} size="sm" maxLength={4} style={{ width: 72, textTransform: "uppercase" }} title="Lot-code abbreviation (optional; 2–4 chars)" />
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          Add
        </Button>
      </div>
      {kind === "variety" ? (
        <>
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => setShowDetails((v) => !v)}
            aria-expanded={showDetails}
            style={{ marginTop: 6, fontSize: 12.5 }}
          >
            {showDetails ? "− Hide vine details" : "+ Add vine details (optional)"}
          </Button>
          {showDetails ? (
            <div
              style={{
                marginTop: 8,
                padding: 10,
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-sm)",
                background: "var(--surface-sunken, var(--surface-raised))",
              }}
            >
              <VarietyDetailFields disabled={pending} />
            </div>
          ) : null}
        </>
      ) : null}
    </form>
  );
}

/** Inline editor for one variety's optional detail. Saves the whole set in one action. */
function VarietyDetailEditor({
  row,
  pending,
  run,
  onDone,
}: {
  row: VarietyRow;
  pending: boolean;
  run: (fn: () => Promise<void>, after?: () => void) => void;
  onDone: () => void;
}) {
  const initial: VarietyDetails = {
    clone: row.clone,
    rootstock: row.rootstock,
    nursery: row.nursery,
    berryColor: row.berryColor,
    species: row.species,
  };
  const [draft, setDraft] = React.useState<VarietyDetails>(initial);
  return (
    <div
      style={{
        padding: 10,
        marginBottom: 8,
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-sm)",
        background: "var(--surface-sunken, var(--surface-raised))",
      }}
    >
      <VarietyDetailFields
        disabled={pending}
        values={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Button
          variant="primary"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setVarietyDetails(row.id, draft), onDone)}
        >
          Save
        </Button>
        <Button variant="ghost" size="sm" disabled={pending} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Compact read-only summary of whatever detail has been recorded. */
function DetailSummary({ row }: { row: VarietyRow }) {
  const parts: string[] = [];
  if (row.berryColor) parts.push(BERRY_COLOR_LABELS[row.berryColor]);
  if (row.species) parts.push(VINE_SPECIES_LABELS[row.species]);
  if (row.clone) parts.push(`clone ${row.clone}`);
  if (row.rootstock) parts.push(`on ${row.rootstock}`);
  if (row.nursery) parts.push(row.nursery);
  if (parts.length === 0) return null;
  return (
    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{parts.join(" · ")}</span>
  );
}

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
  const [editingId, setEditingId] = React.useState<string | null>(null);
  return (
    <ListShell title="Varieties">
      <AddForm kind="variety" pending={pending} run={run} />
      {error ? <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 10 }}>{error}</p> : null}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {rows.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>None yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid var(--border-strong)", opacity: r.isActive ? 1 : 0.55 }}>
              <div style={{ ...rowStyle(r.isActive), borderTop: "none" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
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
                  <DetailSummary row={r} />
                </span>
                <span style={{ display: "inline-flex", gap: 4, flex: "0 0 auto" }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    aria-expanded={editingId === r.id}
                    onClick={() => setEditingId((id) => (id === r.id ? null : r.id))}
                  >
                    Details
                  </Button>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => setRefActive("variety", r.id, !r.isActive))}>
                    {r.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </span>
              </div>
              {editingId === r.id ? (
                <VarietyDetailEditor
                  key={`${r.id}-${r.clone}-${r.rootstock}-${r.nursery}-${r.berryColor}-${r.species}`}
                  row={r}
                  pending={pending}
                  run={run}
                  onDone={() => setEditingId(null)}
                />
              ) : null}
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
      <AddForm kind="vineyard" pending={pending} run={run} />
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
