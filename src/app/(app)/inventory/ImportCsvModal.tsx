"use client";

import React from "react";
import { Button, Modal, Badge, ExportCsvButton } from "@/components/ui";
import { parseInventoryCsv, type ParsedInventoryRow, type RowError } from "@/lib/inventory/csv";
import { importInventory, type ImportSummary } from "@/lib/inventory/actions";

type DisplayRow =
  | { lineNo: number; ok: true; row: ParsedInventoryRow }
  | { lineNo: number; ok: false; message: string };

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
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const existingCats = React.useMemo(() => new Set(categories.map((c) => c.name.toLowerCase())), [categories]);
  const existingLocs = React.useMemo(() => new Set(locations.map((l) => l.name.toLowerCase())), [locations]);

  const newCats = React.useMemo(
    () => [...new Set(rows.map((r) => r.category).filter((c) => !existingCats.has(c.toLowerCase())))],
    [rows, existingCats],
  );
  const newLocs = React.useMemo(
    () => [...new Set(rows.map((r) => r.location).filter((l) => !existingLocs.has(l.toLowerCase())))],
    [rows, existingLocs],
  );

  const display: DisplayRow[] = React.useMemo(() => {
    const merged: DisplayRow[] = [
      ...rows.map((r) => ({ lineNo: r.lineNo, ok: true as const, row: r })),
      ...parseErrors.map((e) => ({ lineNo: e.lineNo, ok: false as const, message: e.message })),
    ];
    return merged.sort((a, b) => a.lineNo - b.lineNo);
  }, [rows, parseErrors]);

  function reset() {
    setFileName(null);
    setRows([]);
    setParseErrors([]);
    setError(null);
    setSummary(null);
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
    if (rows.length === 0) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await importInventory(rows);
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

            {error ? <p style={{ color: "var(--danger)", fontSize: 13.5, marginBottom: 12 }}>{error}</p> : null}

            {fileName && display.length > 0 ? (
              <>
                {newCats.length > 0 || newLocs.length > 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>
                    {newLocs.length > 0 ? <>Will create {newLocs.length} new location(s): <strong>{newLocs.join(", ")}</strong>. </> : null}
                    {newCats.length > 0 ? <>Will create {newCats.length} new category(ies): <strong>{newCats.join(", ")}</strong>.</> : null}
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
                            <td style={cellTd}>{d.row.category}</td>
                            <td style={cellTd}>{d.row.location}</td>
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

function SummaryLine({ label, items }: { label: string; items: string[] }) {
  return (
    <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "2px 0" }}>
      {label}: <strong>{items.join(", ")}</strong>
    </p>
  );
}
