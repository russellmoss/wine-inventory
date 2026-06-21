"use client";

import React from "react";
import { Button, Modal, Badge, ExportCsvButton } from "@/components/ui";
import { parseInventoryCsv, type ParsedInventoryRow, type RowError } from "@/lib/inventory/csv";
import { closestMatch } from "@/lib/inventory/similarity";
import { importInventory, type ImportSummary } from "@/lib/inventory/actions";

type DisplayRow =
  | { lineNo: number; ok: true; row: ParsedInventoryRow }
  | { lineNo: number; ok: false; message: string };

type Suggestion = { value: string; match: string; score: number };
type Decision = "accept" | "reject";

const TEMPLATE_COLUMNS = [
  { key: "item", label: "Item" },
  { key: "vintage", label: "Vintage" },
  { key: "category", label: "Category" },
  { key: "location", label: "Location" },
  { key: "quantity", label: "Quantity" },
];
const TEMPLATE_ROW = [{ item: "Chateau Bon Vivant", vintage: 2024, category: "Wine", location: "Wine Bar", quantity: 100 }];

const cellTd: React.CSSProperties = { padding: "8px 12px", borderTop: "1px solid var(--border-strong)", verticalAlign: "top" };
const headTh: React.CSSProperties = { padding: "8px 12px", fontWeight: 500, color: "var(--text-muted)", textAlign: "left" };

export function ImportCsvModal({
  categories,
  locations,
}: {
  categories: Array<{ name: string }>;
  locations: Array<{ name: string }>;
}) {
  const [open, setOpen] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<ParsedInventoryRow[]>([]);
  const [parseErrors, setParseErrors] = React.useState<RowError[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  // Per-distinct-value decisions for "did you mean" suggestions. Absent = undecided
  // (treated as "keep what they typed" — suggestions never block the import).
  const [catDecision, setCatDecision] = React.useState<Record<string, Decision>>({});
  const [locDecision, setLocDecision] = React.useState<Record<string, Decision>>({});
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const catNames = React.useMemo(() => categories.map((c) => c.name), [categories]);
  const locNames = React.useMemo(() => locations.map((l) => l.name), [locations]);
  const existingCats = React.useMemo(() => new Set(catNames.map((n) => n.toLowerCase())), [catNames]);
  const existingLocs = React.useMemo(() => new Set(locNames.map((n) => n.toLowerCase())), [locNames]);

  const newCats = React.useMemo(
    () => [...new Set(rows.map((r) => r.category).filter((c) => !existingCats.has(c.toLowerCase())))],
    [rows, existingCats],
  );
  const newLocs = React.useMemo(
    () => [...new Set(rows.map((r) => r.location).filter((l) => !existingLocs.has(l.toLowerCase())))],
    [rows, existingLocs],
  );

  // "Wine" is the reserved keyword that routes a row to bottled wine (see csv.ts). Never
  // suggest it as a target and never second-guess a literal "Wine" — remapping it would
  // desync the row's kind (already decided at parse time) from its category.
  const catCandidates = React.useMemo(() => catNames.filter((n) => n.toLowerCase() !== "wine"), [catNames]);
  const catSuggestions = React.useMemo(
    () => buildSuggestions(newCats.filter((v) => v.toLowerCase() !== "wine"), catCandidates),
    [newCats, catCandidates],
  );
  const locSuggestions = React.useMemo(() => buildSuggestions(newLocs, locNames), [newLocs, locNames]);

  // Accepted suggestions become a value->canonical remap, applied to every row with
  // that value before import. The server then reuses the existing record (its
  // find-or-create is case-insensitive), so no near-duplicate is born.
  const catRemap = React.useMemo(() => remapFrom(catSuggestions, catDecision), [catSuggestions, catDecision]);
  const locRemap = React.useMemo(() => remapFrom(locSuggestions, locDecision), [locSuggestions, locDecision]);

  const effectiveRows = React.useMemo(
    () => rows.map((r) => ({ ...r, category: catRemap[r.category] ?? r.category, location: locRemap[r.location] ?? r.location })),
    [rows, catRemap, locRemap],
  );

  // O(1) lookup of the originally-typed values per line, so the preview can show
  // "(was X)" without scanning all rows for every cell it renders.
  const originalByLine = React.useMemo(() => {
    const m = new Map<number, { category: string; location: string }>();
    for (const r of rows) m.set(r.lineNo, { category: r.category, location: r.location });
    return m;
  }, [rows]);

  // What the import will actually create: a typed value that wasn't remapped onto an
  // existing record.
  const remainingNewCats = React.useMemo(() => newCats.filter((c) => !catRemap[c]), [newCats, catRemap]);
  const remainingNewLocs = React.useMemo(() => newLocs.filter((l) => !locRemap[l]), [newLocs, locRemap]);

  const display: DisplayRow[] = React.useMemo(() => {
    const merged: DisplayRow[] = [
      ...effectiveRows.map((r) => ({ lineNo: r.lineNo, ok: true as const, row: r })),
      ...parseErrors.map((e) => ({ lineNo: e.lineNo, ok: false as const, message: e.message })),
    ];
    return merged.sort((a, b) => a.lineNo - b.lineNo);
  }, [effectiveRows, parseErrors]);

  function reset() {
    setFileName(null);
    setRows([]);
    setParseErrors([]);
    setError(null);
    setSummary(null);
    setCatDecision({});
    setLocDecision({});
    if (inputRef.current) inputRef.current.value = "";
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setError(null);
    setSummary(null);
    setCatDecision({});
    setLocDecision({});
    if (!file) return;
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = parseInventoryCsv(text);
      setRows(result.rows);
      setParseErrors(result.errors);
    } catch {
      setError("Could not read that file.");
      setRows([]);
      setParseErrors([]);
    }
  }

  function doImport() {
    if (effectiveRows.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await importInventory(effectiveRows);
        setSummary(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Import failed.");
      }
    });
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Import CSV
      </Button>

      <Modal open={open} onClose={close} title="Bulk import inventory" subtitle="Upload a CSV to receive stock in bulk" maxWidth={760}>
        {summary ? (
          <div>
            <p style={{ fontSize: 15, marginBottom: 12 }}>
              Imported <strong>{summary.received}</strong> {summary.received === 1 ? "row" : "rows"}.
            </p>
            {summary.newSkus.length > 0 ? <SummaryLine label="New wines" items={summary.newSkus} /> : null}
            {summary.newGoods.length > 0 ? <SummaryLine label="New items" items={summary.newGoods} /> : null}
            {summary.newCategories.length > 0 ? <SummaryLine label="New categories" items={summary.newCategories} /> : null}
            {summary.newLocations.length > 0 ? <SummaryLine label="New locations" items={summary.newLocations} /> : null}
            {summary.rowErrors.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 6 }}>{summary.rowErrors.length} row(s) could not be imported:</p>
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize: 13 }}>
                  {summary.rowErrors.map((e, i) => (
                    <li key={i}>Line {e.lineNo}: {e.message}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
              <Button variant="secondary" size="sm" onClick={reset}>Import another</Button>
              <Button variant="primary" size="sm" onClick={close}>Done</Button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
              <input ref={inputRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ fontSize: 14 }} />
              <ExportCsvButton filename="inventory-template.csv" label="Download template" columns={TEMPLATE_COLUMNS} rows={TEMPLATE_ROW} />
            </div>

            <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
              Columns: <strong>Item, Vintage, Category, Location, Quantity</strong>. Rows in the <strong>Wine</strong> category need a vintage
              (a year in the item name works too). Quantities are <strong>received</strong> — added on top of what is already on hand.
            </p>

            <ReferencePanel categories={catNames} locations={locNames} />

            {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p> : null}

            {fileName && display.length > 0 ? (
              <>
                <SuggestionBlock
                  pluralNoun="categories"
                  suggestions={catSuggestions}
                  decision={catDecision}
                  onDecide={(value, d) => setCatDecision((prev) => ({ ...prev, [value]: d }))}
                />
                <SuggestionBlock
                  pluralNoun="locations"
                  suggestions={locSuggestions}
                  decision={locDecision}
                  onDecide={(value, d) => setLocDecision((prev) => ({ ...prev, [value]: d }))}
                />

                {remainingNewCats.length > 0 || remainingNewLocs.length > 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                    {remainingNewLocs.length > 0 ? <>Will create {remainingNewLocs.length} new location(s): <strong>{remainingNewLocs.join(", ")}</strong>. </> : null}
                    {remainingNewCats.length > 0 ? <>Will create {remainingNewCats.length} new category(ies): <strong>{remainingNewCats.join(", ")}</strong>.</> : null}
                  </p>
                ) : null}

                <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <thead>
                      <tr>
                        <th style={headTh}>Line</th>
                        <th style={headTh}>Item</th>
                        <th style={headTh}>Vintage</th>
                        <th style={headTh}>Category</th>
                        <th style={headTh}>Location</th>
                        <th style={{ ...headTh, textAlign: "right" }}>Qty</th>
                        <th style={headTh}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {display.map((d) =>
                        d.ok ? (
                          <tr key={d.lineNo}>
                            <td style={{ ...cellTd, color: "var(--text-muted)" }}>{d.lineNo}</td>
                            <td style={cellTd}>{d.row.name}</td>
                            <td style={cellTd}>{d.row.vintage ?? "—"}</td>
                            <td style={cellTd}><Remapped original={originalByLine.get(d.lineNo)?.category ?? d.row.category} effective={d.row.category} /></td>
                            <td style={cellTd}><Remapped original={originalByLine.get(d.lineNo)?.location ?? d.row.location} effective={d.row.location} /></td>
                            <td style={{ ...cellTd, textAlign: "right" }}>{d.row.qty}</td>
                            <td style={cellTd}><Badge tone="green" variant="soft">ok</Badge></td>
                          </tr>
                        ) : (
                          <tr key={`e-${d.lineNo}`} style={{ background: "rgba(180,40,40,0.05)" }}>
                            <td style={{ ...cellTd, color: "var(--text-muted)" }}>{d.lineNo}</td>
                            <td style={{ ...cellTd, color: "var(--danger)" }} colSpan={5}>{d.message}</td>
                            <td style={cellTd}><Badge tone="red" variant="soft">skip</Badge></td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>

                <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "10px 0 0" }}>
                  {rows.length} valid, {parseErrors.length} skipped.
                </p>

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
                  <Button variant="secondary" size="sm" onClick={reset} disabled={pending}>Clear</Button>
                  <Button variant="primary" size="sm" onClick={doImport} disabled={pending || rows.length === 0}>
                    {pending ? "Importing..." : `Import ${rows.length} ${rows.length === 1 ? "row" : "rows"}`}
                  </Button>
                </div>
              </>
            ) : fileName ? (
              <p style={{ fontSize: 13.5, color: "var(--text-muted)" }}>No rows found in this file.</p>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  );
}

/** For each new value, the closest existing name (or nothing). Shared by category + location. */
function buildSuggestions(values: string[], candidates: string[]): Suggestion[] {
  return values
    .map((v) => ({ v, m: closestMatch(v, candidates) }))
    .filter((x): x is { v: string; m: NonNullable<typeof x.m> } => x.m !== null)
    .map((x) => ({ value: x.v, match: x.m.match, score: x.m.score }));
}

/** Build a value->canonical remap from the accepted suggestions only. */
function remapFrom(suggestions: Suggestion[], decision: Record<string, Decision>): Record<string, string> {
  const m: Record<string, string> = {};
  for (const s of suggestions) if (decision[s.value] === "accept") m[s.value] = s.match;
  return m;
}

/** Show the effective value; if it was remapped, note what the user originally typed. */
function Remapped({ original, effective }: { original: string; effective: string }) {
  if (original === effective) return <>{effective}</>;
  return (
    <span>
      {effective}{" "}
      <span style={{ color: "var(--text-muted)", fontSize: 12 }}>(was “{original}”)</span>
    </span>
  );
}

/** Copyable chips of the names already in the registry, so users reuse them. */
function ReferencePanel({ categories, locations }: { categories: string[]; locations: string[] }) {
  if (categories.length === 0 && locations.length === 0) return null;
  return (
    <div style={{ marginBottom: 14, padding: "10px 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--surface-sunken, rgba(0,0,0,0.02))" }}>
      <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "0 0 8px" }}>
        Reuse an existing name (click to copy) — new names are allowed, but reusing these keeps the list tidy.
      </p>
      <ChipRow label="Categories" names={categories} />
      <ChipRow label="Locations" names={locations} />
    </div>
  );
}

function ChipRow({ label, names }: { label: string; names: string[] }) {
  const [copied, setCopied] = React.useState<string | null>(null);
  const sorted = React.useMemo(() => [...names].sort((a, b) => a.localeCompare(b)), [names]);
  async function copy(name: string) {
    try {
      await navigator.clipboard?.writeText(name);
      setCopied(name);
      window.setTimeout(() => setCopied((c) => (c === name ? null : c)), 1200);
    } catch {
      /* clipboard unavailable — chips still show as reference */
    }
  }
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap", margin: "4px 0" }}>
      <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 72 }}>{label}:</span>
      {sorted.length === 0 ? (
        <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>none yet</span>
      ) : (
        sorted.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => copy(name)}
            title="Copy"
            style={{
              cursor: "pointer", fontSize: 12.5, padding: "2px 8px", borderRadius: 999,
              border: "1px solid var(--border-strong)", background: "var(--surface-raised)", color: "var(--text-secondary)",
            }}
          >
            {copied === name ? "✓ copied" : name}
          </button>
        ))
      )}
    </div>
  );
}

/** "You entered X — did you mean Y?" with accept (remap) / keep controls, per value. */
function SuggestionBlock({
  pluralNoun,
  suggestions,
  decision,
  onDecide,
}: {
  pluralNoun: string;
  suggestions: Suggestion[];
  decision: Record<string, Decision>;
  onDecide: (value: string, d: Decision) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div style={{ marginBottom: 12, padding: "10px 12px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "rgba(180,140,40,0.06)" }}>
      <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 8px" }}>
        Possible duplicate {pluralNoun} — choose one for each:
      </p>
      {suggestions.map((s) => {
        const state = decision[s.value];
        return (
          <div key={s.value} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "4px 0", fontSize: 13.5 }}>
            <span>
              You entered <strong>“{s.value}”</strong> — did you mean <strong>“{s.match}”</strong>?
            </span>
            <Button size="sm" variant={state === "accept" ? "primary" : "secondary"} onClick={() => onDecide(s.value, "accept")}>
              {state === "accept" ? `Using “${s.match}”` : `Use “${s.match}”`}
            </Button>
            <Button size="sm" variant={state === "reject" ? "primary" : "ghost"} onClick={() => onDecide(s.value, "reject")}>
              {state === "reject" ? `Keeping “${s.value}”` : `Keep “${s.value}”`}
            </Button>
          </div>
        );
      })}
    </div>
  );
}

function SummaryLine({ label, items }: { label: string; items: string[] }) {
  return (
    <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "2px 0" }}>
      {label}: <strong>{items.join(", ")}</strong>
    </p>
  );
}
