"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Eyebrow, Badge, Button, Input, Collapsible } from "@/components/ui";
import { useCurrency } from "@/components/money/CurrencyProvider";
import {
  MATERIAL_CATEGORIES, CATEGORY_LABELS, BUILTIN_FAMILIES, type MaterialCategory,
} from "@/lib/cellar/material-taxonomy";
import { matchMaterials, type MaterialCandidate } from "@/lib/cellar/material-match";
import { matchVendorsByName, type VendorRow } from "@/lib/vendors/vendors-shared";
import {
  updateIngestedInvoiceLineAction, updateIngestedInvoiceAction, applyIngestedInvoiceAction,
} from "@/lib/ingest/actions";
import {
  isReceiptDoc, effectiveDecision, landedPreview, isForeignCurrency, canConfirmDoc,
  buildPrecommitSummary, summarySentence,
  type ReviewDoc, type ReviewLine, type ReviewDocType,
} from "./ingest-review-model";

// Plan 072 Unit 8 — the human review screen for a batch of ingested documents. Receipts (invoice/proforma)
// are the primary panels; COA/other collapse under "Supporting docs". Each line is editable, the dedup
// control is backed by matchMaterials, a proforma gate blocks Confirm until answered, and Confirm applies
// through the frozen apply core (surfacing needsAck / errors INLINE — never a thrown ActionError). ALL
// non-trivial logic lives in the pure ingest-review-model; this file is the shell + persistence wiring.

const num = { fontVariantNumeric: "tabular-nums" } as const;

const selectStyle: React.CSSProperties = {
  height: 40, padding: "0 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)",
  background: "var(--surface-raised)", fontFamily: "var(--font-body)", fontSize: 14, color: "var(--text-primary)",
  maxWidth: "100%",
};

const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 4 };

/** Track a narrow viewport so the dense line grid collapses to stacked cards (SSR-safe). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return narrow;
}

type ApplyState = {
  pending: boolean;
  error: string | null;
  needsAck: "reconcile" | "partial-ap" | null;
  acks: { reconcile: boolean; partial: boolean };
  result: { supplyLotIds: string[]; apLineCount: number } | null;
};

const emptyApply: ApplyState = { pending: false, error: null, needsAck: null, acks: { reconcile: false, partial: false }, result: null };

export function IngestReviewClient({
  batchId, docs: initial, candidates, vendors,
}: {
  batchId: string;
  docs: ReviewDoc[];
  candidates: MaterialCandidate[];
  vendors: VendorRow[];
}) {
  const router = useRouter();
  const [docs, setDocs] = React.useState<ReviewDoc[]>(initial);
  const [applyState, setApplyState] = React.useState<Record<string, ApplyState>>({});

  const patchDocLocal = React.useCallback((docId: string, patch: Partial<ReviewDoc>) => {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, ...patch } : d)));
  }, []);
  const patchLineLocal = React.useCallback((docId: string, lineId: string, patch: Partial<ReviewLine>) => {
    setDocs((prev) => prev.map((d) => (d.id === docId ? { ...d, lines: d.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) } : d)));
  }, []);

  // Persist edits (optimistic local update already applied). Errors are swallowed to a console note — the
  // authoritative recompute happens server-side at apply, and a failed patch just isn't saved.
  const saveDoc = React.useCallback((docId: string, patch: Parameters<typeof updateIngestedInvoiceAction>[1]) => {
    patchDocLocal(docId, patch as Partial<ReviewDoc>);
    void updateIngestedInvoiceAction(docId, patch).catch(() => undefined);
  }, [patchDocLocal]);
  const saveLine = React.useCallback((docId: string, lineId: string, patch: Parameters<typeof updateIngestedInvoiceLineAction>[1]) => {
    patchLineLocal(docId, lineId, patch as Partial<ReviewLine>);
    void updateIngestedInvoiceLineAction(lineId, patch).catch(() => undefined);
  }, [patchLineLocal]);

  const runApply = React.useCallback(async (doc: ReviewDoc, acks: ApplyState["acks"]) => {
    setApplyState((s) => ({ ...s, [doc.id]: { ...(s[doc.id] ?? emptyApply), acks, pending: true, error: null } }));
    const res = await applyIngestedInvoiceAction(doc.id, { allowReconcileMismatch: acks.reconcile, allowPartialAp: acks.partial });
    if (res.ok) {
      patchDocLocal(doc.id, { status: "applied" });
      setApplyState((s) => ({ ...s, [doc.id]: { ...emptyApply, acks, result: { supplyLotIds: res.supplyLotIds, apLineCount: res.apLineCount } } }));
      router.refresh();
    } else {
      setApplyState((s) => ({
        ...s,
        [doc.id]: { ...(s[doc.id] ?? emptyApply), acks, pending: false, error: res.error, needsAck: res.needsAck ?? null },
      }));
    }
  }, [patchDocLocal, router]);

  const receipts = docs.filter((d) => isReceiptDoc(d.docType));
  const supporting = docs.filter((d) => !isReceiptDoc(d.docType));

  return (
    <div>
      <Eyebrow rule>Setup · Ingest invoice</Eyebrow>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 36, margin: "10px 0 6px" }}>Review ingested documents</h1>
          <p style={{ color: "var(--text-secondary)", marginBottom: 20, maxWidth: "64ch" }}>
            Check what the reader pulled from each document against the source, resolve any duplicates, then
            confirm. Nothing is written to inventory until you Confirm each receipt — the extraction only
            pre-fills this form.
          </p>
        </div>
        <Link href="/setup/expendables"><Button variant="ghost" style={{ marginTop: 10 }}>← Expendables</Button></Link>
      </div>

      {docs.length === 0 ? (
        <Card padding="var(--space-5)" style={{ textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)", fontSize: 15, margin: "8px 0" }}>
            No documents found for this ingestion batch. It may still be extracting, or the batch id is stale.
          </p>
          <Link href="/setup/expendables"><Button variant="primary" style={{ marginTop: 8 }}>Back to Expendables</Button></Link>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {receipts.map((doc) => (
            <ReceiptPanel
              key={doc.id}
              doc={doc}
              candidates={candidates}
              vendors={vendors}
              apply={applyState[doc.id] ?? emptyApply}
              onSaveDoc={saveDoc}
              onSaveLine={saveLine}
              onApply={runApply}
            />
          ))}

          {supporting.length > 0 ? (
            <Card padding="var(--space-5)">
              <Collapsible level="section" defaultOpen={false} title={`Supporting docs (${supporting.length}) — attached`}>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                  {supporting.map((doc) => (
                    <SupportingDoc key={doc.id} doc={doc} onSaveDoc={saveDoc} />
                  ))}
                </div>
              </Collapsible>
            </Card>
          ) : null}
        </div>
      )}
      <p style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 18 }}>Batch {batchId}</p>
    </div>
  );
}

// ── one receipt (invoice / proforma) ──

function ReceiptPanel({
  doc, candidates, vendors, apply, onSaveDoc, onSaveLine, onApply,
}: {
  doc: ReviewDoc;
  candidates: MaterialCandidate[];
  vendors: VendorRow[];
  apply: ApplyState;
  onSaveDoc: (docId: string, patch: Parameters<typeof updateIngestedInvoiceAction>[1]) => void;
  onSaveLine: (docId: string, lineId: string, patch: Parameters<typeof updateIngestedInvoiceLineAction>[1]) => void;
  onApply: (doc: ReviewDoc, acks: ApplyState["acks"]) => void;
}) {
  const { code: baseCurrency, symbol } = useCurrency();
  const [showSource, setShowSource] = React.useState(false);
  const narrow = useNarrow();

  const vendorMatch = doc.vendorNameRaw ? matchVendorsByName(vendors, doc.vendorNameRaw)[0] ?? null : null;
  const resolvedVendorId = vendorMatch?.id ?? null;
  const previews = landedPreview(doc);
  const gate = canConfirmDoc(doc);
  const summary = buildPrecommitSummary(doc, { vendorExisting: !!vendorMatch });
  const applied = doc.status === "applied";

  return (
    <Card padding="var(--space-5)">
      {/* header: file + classification + source toggle */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 300, fontSize: 22, margin: 0, wordBreak: "break-word" }}>{doc.fileName}</h2>
            {doc.currency ? <Badge tone={isForeignCurrency(doc.currency, baseCurrency) ? "maroon" : "neutral"} variant="soft">{doc.currency}</Badge> : null}
            {applied ? <Badge tone="green">applied</Badge> : null}
          </div>
          {doc.vendorInvoiceNumber ? <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "4px 0 0" }}>Invoice #{doc.vendorInvoiceNumber}</p> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>Classified as</label>
          <select
            aria-label="Document type"
            value={doc.docType}
            disabled={applied}
            onChange={(e) => onSaveDoc(doc.id, { docType: e.target.value as ReviewDocType })}
            style={selectStyle}
          >
            <option value="invoice">Invoice</option>
            <option value="proforma">Proforma</option>
            <option value="coa">COA (certificate)</option>
            <option value="other">Other / not a receipt</option>
          </select>
          <Button variant="secondary" size="sm" onClick={() => setShowSource((v) => !v)}>{showSource ? "Hide source" : "View source"}</Button>
        </div>
      </div>

      {/* low-confidence / model-extracted warnings */}
      {doc.warnings.length > 0 ? (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--accent-soft)", border: "1px solid var(--border-strong)" }}>
          <p style={{ fontSize: 12.5, fontWeight: 500, color: "var(--wine-primary)", margin: "0 0 4px" }}>Flagged for review — verify these against the source:</p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)" }}>
            {doc.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}

      {showSource ? <SourcePane doc={doc} /> : null}

      {/* vendor panel */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 260px" }}>
          <div style={fieldLabel}>Vendor</div>
          <Input value={doc.vendorNameRaw ?? ""} disabled={applied} onChange={(e) => onSaveDoc(doc.id, { vendorNameRaw: e.target.value })} placeholder="Vendor name" />
        </div>
        <div style={{ paddingBottom: 10 }}>
          {!doc.vendorNameRaw?.trim() ? (
            <Badge tone="neutral" variant="soft">no vendor — no A/P bill</Badge>
          ) : vendorMatch ? (
            <Badge tone="green" variant="soft">existing vendor: {vendorMatch.name}</Badge>
          ) : (
            <Badge tone="gold" variant="soft">will create vendor</Badge>
          )}
        </div>
      </div>

      {/* proforma gate */}
      {doc.docType === "proforma" ? (
        <ProformaGate doc={doc} disabled={applied} onSaveDoc={onSaveDoc} />
      ) : null}

      {/* line grid */}
      <div style={{ marginTop: 16 }}>
        {!narrow ? (
          <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,2fr) 70px 90px 110px 110px minmax(200px,1.6fr) 110px", gap: 8, padding: "0 4px 6px", fontSize: 11.5, color: "var(--text-muted)", fontWeight: 500 }}>
            <span>Description</span><span>Qty</span><span>Unit</span><span>Unit price</span><span>Lot no.</span><span>Match</span><span style={{ textAlign: "right" }}>Landed</span>
          </div>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: narrow ? 12 : 4 }}>
          {doc.lines.map((line, i) => (
            <LineRow
              key={line.id}
              doc={doc}
              line={line}
              narrow={narrow}
              disabled={applied}
              symbol={symbol}
              landed={previews[i]}
              foreign={isForeignCurrency(doc.currency, baseCurrency)}
              candidates={candidates}
              resolvedVendorId={resolvedVendorId}
              onSaveLine={onSaveLine}
            />
          ))}
          {doc.lines.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 4px" }}>
              No line items were staged for this document. If you reclassified it into a receipt, note that
              lines are only captured at ingest time — re-upload it as an invoice to intake its lines.
            </p>
          ) : null}
        </div>
      </div>

      {/* pre-commit summary + confirm */}
      <div style={{ marginTop: 18, borderTop: "1px solid var(--border-strong)", paddingTop: 14 }}>
        {applied ? (
          <AppliedState result={apply.result} />
        ) : (
          <>
            <div style={{ padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--paper-100)", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Before you confirm</span>
              <p style={{ fontSize: 14, color: "var(--text-primary)", margin: "3px 0 0" }}>{summarySentence(summary)}</p>
            </div>

            {!gate.ok ? (
              <ul style={{ margin: "0 0 12px", paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)" }}>
                {gate.reasons.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            ) : null}

            {apply.error ? (
              <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--danger)", background: "rgba(182,61,53,0.08)" }}>
                <p style={{ fontSize: 13, color: "var(--danger)", margin: 0 }}>{apply.error}</p>
                {apply.needsAck ? (
                  <div style={{ marginTop: 10 }}>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={apply.pending}
                      onClick={() => onApply(doc, {
                        reconcile: apply.acks.reconcile || apply.needsAck === "reconcile",
                        partial: apply.acks.partial || apply.needsAck === "partial-ap",
                      })}
                    >
                      {apply.needsAck === "reconcile" ? "Apply inventory-only (totals don't reconcile)" : "Apply inventory-only (partial A/P)"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Button
                variant="primary"
                disabled={!gate.ok || apply.pending}
                onClick={() => onApply(doc, { reconcile: false, partial: false })}
              >
                {apply.pending ? "Applying…" : "Confirm & intake"}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

function ProformaGate({
  doc, disabled, onSaveDoc,
}: {
  doc: ReviewDoc;
  disabled: boolean;
  onSaveDoc: (docId: string, patch: Parameters<typeof updateIngestedInvoiceAction>[1]) => void;
}) {
  const answered = doc.landedReceipt != null;
  return (
    <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: "var(--radius-md)", border: `1.5px solid ${answered ? "var(--border-strong)" : "var(--wine-primary)"}`, background: answered ? "var(--surface-raised)" : "var(--accent-soft)" }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-primary)", margin: "0 0 2px" }}>This is a proforma — is it a landed receipt?</p>
      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "0 0 10px" }}>
        Yes = the goods were physically received <strong>in full</strong>. A proforma is only intaken as stock
        when the goods have actually arrived — answering Yes just to pay in advance would create ghost inventory.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant={doc.landedReceipt === true ? "primary" : "secondary"} size="sm" disabled={disabled} onClick={() => onSaveDoc(doc.id, { landedReceipt: true })}>Yes — received in full</Button>
        <Button variant={doc.landedReceipt === false ? "primary" : "secondary"} size="sm" disabled={disabled} onClick={() => onSaveDoc(doc.id, { landedReceipt: false })}>No — not yet</Button>
      </div>
      {doc.landedReceipt === false ? (
        <p style={{ fontSize: 12.5, color: "var(--maroon)", margin: "10px 0 0" }}>Marked not received — this proforma won&rsquo;t be intaken. Confirm is blocked.</p>
      ) : null}
    </div>
  );
}

// ── one editable line ──

function LineRow({
  doc, line, narrow, disabled, symbol, landed, foreign, candidates, resolvedVendorId, onSaveLine,
}: {
  doc: ReviewDoc;
  line: ReviewLine;
  narrow: boolean;
  disabled: boolean;
  symbol: string;
  landed: number | null;
  foreign: boolean;
  candidates: MaterialCandidate[];
  resolvedVendorId: string | null;
  onSaveLine: (docId: string, lineId: string, patch: Parameters<typeof updateIngestedInvoiceLineAction>[1]) => void;
}) {
  const decision = effectiveDecision(line);
  const matches = React.useMemo(
    () => matchMaterials(candidates, { name: line.descriptionRaw, vendorId: resolvedVendorId, vendorItemCode: line.vendorItemCodeRaw }),
    [candidates, line.descriptionRaw, line.vendorItemCodeRaw, resolvedVendorId],
  );

  const dedupValue = decision === "skip" ? "skip" : decision === "existing" && line.matchedMaterialId ? `existing:${line.matchedMaterialId}` : "new";
  const onDedupChange = (v: string) => {
    if (v === "skip") onSaveLine(doc.id, line.id, { matchDecision: "skip", matchedMaterialId: null });
    else if (v === "new") onSaveLine(doc.id, line.id, { matchDecision: "new", matchedMaterialId: null });
    else onSaveLine(doc.id, line.id, { matchDecision: "existing", matchedMaterialId: v.slice("existing:".length) });
  };

  const dedupSelect = (
    <select aria-label={`Match for line ${line.lineNo}`} value={dedupValue} disabled={disabled} onChange={(e) => onDedupChange(e.target.value)} style={{ ...selectStyle, width: "100%" }}>
      <option value="new">＋ Create new material</option>
      {matches.map((m) => (
        <option key={m.materialId} value={`existing:${m.materialId}`}>Add to {m.name} ({Math.round(m.confidence * 100)}%)</option>
      ))}
      <option value="skip">Skip this line</option>
    </select>
  );

  const landedCell = (
    <span style={{ ...num, fontSize: 13.5, color: landed == null ? "var(--text-muted)" : "var(--text-primary)" }}>
      {landed == null ? "—" : `${symbol}${landed.toFixed(2)}`}
      {foreign && landed != null ? <Badge tone="maroon" variant="soft" style={{ marginLeft: 6 }}>{doc.currency}</Badge> : null}
    </span>
  );

  const newFields = decision === "new" ? (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: narrow ? 2 : 6 }}>
      <select aria-label="Category" value={line.resolvedCategory ?? ""} disabled={disabled} onChange={(e) => onSaveLine(doc.id, line.id, { resolvedCategory: e.target.value || null })} style={{ ...selectStyle, flex: "1 1 160px" }}>
        <option value="">Category…</option>
        {MATERIAL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c as MaterialCategory]}</option>)}
      </select>
      <select aria-label="Family" value={line.resolvedKind ?? ""} disabled={disabled} onChange={(e) => onSaveLine(doc.id, line.id, { resolvedKind: e.target.value || null })} style={{ ...selectStyle, flex: "1 1 160px" }}>
        <option value="">Family…</option>
        {BUILTIN_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
    </div>
  ) : null;

  const desc = <Input aria-label="Description" value={line.descriptionRaw} disabled={disabled} onChange={(e) => onSaveLine(doc.id, line.id, { descriptionRaw: e.target.value })} />;
  const qty = <Input aria-label="Quantity" value={line.qty ?? ""} disabled={disabled} inputMode="decimal" onChange={(e) => onSaveLine(doc.id, line.id, { qty: e.target.value.trim() === "" ? null : Number(e.target.value) })} />;
  const unit = <Input aria-label="Unit" value={line.unitRaw ?? ""} disabled={disabled} placeholder="e.g. 25 kg" onChange={(e) => onSaveLine(doc.id, line.id, { unitRaw: e.target.value || null })} />;
  const price = <Input aria-label="Unit price" value={line.unitPrice ?? ""} disabled={disabled} inputMode="decimal" iconLeft={symbol} onChange={(e) => onSaveLine(doc.id, line.id, { unitPrice: e.target.value.trim() === "" ? null : Number(e.target.value) })} />;
  const lot = <Input aria-label="Lot number" value={line.lotNoRaw ?? ""} disabled={disabled} onChange={(e) => onSaveLine(doc.id, line.id, { lotNoRaw: e.target.value || null })} />;

  if (narrow) {
    return (
      <div style={{ border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", padding: 12, opacity: decision === "skip" ? 0.6 : 1 }}>
        <div style={{ marginBottom: 8 }}><div style={fieldLabel}>Description</div>{desc}</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 90px" }}><div style={fieldLabel}>Qty</div>{qty}</div>
          <div style={{ flex: "1 1 90px" }}><div style={fieldLabel}>Unit</div>{unit}</div>
          <div style={{ flex: "1 1 90px" }}><div style={fieldLabel}>Unit price</div>{price}</div>
          <div style={{ flex: "1 1 90px" }}><div style={fieldLabel}>Lot no.</div>{lot}</div>
        </div>
        <div style={{ marginTop: 8 }}><div style={fieldLabel}>Match</div>{dedupSelect}{newFields}</div>
        <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={fieldLabel}>Landed cost</span>{landedCell}
        </div>
      </div>
    );
  }

  return (
    <div style={{ opacity: decision === "skip" ? 0.6 : 1, padding: "6px 4px", borderTop: "1px solid var(--border-subtle, var(--border-strong))" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(160px,2fr) 70px 90px 110px 110px minmax(200px,1.6fr) 110px", gap: 8, alignItems: "center" }}>
        {desc}{qty}{unit}{price}{lot}
        <div>{dedupSelect}</div>
        <div style={{ textAlign: "right" }}>{landedCell}</div>
      </div>
      {newFields ? <div style={{ paddingLeft: 0 }}>{newFields}</div> : null}
    </div>
  );
}

function AppliedState({ result }: { result: ApplyState["result"] }) {
  const n = result?.supplyLotIds.length ?? 0;
  return (
    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "rgba(23,82,66,0.08)" }}>
      <p style={{ fontSize: 14, fontWeight: 500, color: "var(--deep-green)", margin: "0 0 4px" }}>
        Applied — {n} lot{n === 1 ? "" : "s"} created{result && result.apLineCount > 0 ? `, ${result.apLineCount} A/P bill${result.apLineCount === 1 ? "" : "s"} emitted` : ""}.
      </p>
      <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "0 0 10px" }}>
        The stock is now in your catalog. If anything looks wrong, undo the receipt from the item&rsquo;s
        timeline (the ledger keeps every operation reversible).
      </p>
      <Link href="/setup/expendables"><Button variant="secondary" size="sm">View in Expendables</Button></Link>
    </div>
  );
}

// ── supporting (COA / other) ──

function SupportingDoc({
  doc, onSaveDoc,
}: {
  doc: ReviewDoc;
  onSaveDoc: (docId: string, patch: Parameters<typeof updateIngestedInvoiceAction>[1]) => void;
}) {
  const [showSource, setShowSource] = React.useState(false);
  return (
    <div style={{ border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <Badge tone="neutral" variant="soft">{doc.docType.toUpperCase()}</Badge>
          <span style={{ fontSize: 14, color: "var(--text-primary)", wordBreak: "break-word" }}>{doc.fileName}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <select aria-label="Reclassify document" value={doc.docType} onChange={(e) => onSaveDoc(doc.id, { docType: e.target.value as ReviewDocType })} style={selectStyle}>
            <option value="invoice">Invoice</option>
            <option value="proforma">Proforma</option>
            <option value="coa">COA (certificate)</option>
            <option value="other">Other</option>
          </select>
          <Button variant="ghost" size="sm" onClick={() => setShowSource((v) => !v)}>{showSource ? "Hide" : "View source"}</Button>
        </div>
      </div>
      {doc.docType === "coa" ? (
        <p style={{ fontSize: 12.5, color: "var(--text-secondary)", margin: "8px 0 0" }}>
          {doc.coaLotNo
            ? <>Certificate for lot <strong>{doc.coaLotNo}</strong> — its expiry/batch attaches automatically to a matching lot when its invoice in this batch is confirmed.</>
            : "No lot number was read from this certificate, so it can't be auto-matched to a lot."}
        </p>
      ) : (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", margin: "8px 0 0" }}>Stored as a reference document, not intaken. Reclassify it above if it&rsquo;s actually a receipt.</p>
      )}
      {showSource ? <SourcePane doc={doc} /> : null}
    </div>
  );
}

// ── source-document pane (tenant-scoped proxy; never the raw private blob URL) ──

function SourcePane({ doc }: { doc: ReviewDoc }) {
  const src = `/api/ingest/document?id=${encodeURIComponent(doc.id)}`;
  const isImage = doc.mimeType.startsWith("image/");
  return (
    <div style={{ marginTop: 12, border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--paper-100)" }}>
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- streamed via a tenant-scoped auth proxy; next/image can't proxy a private blob stream
        <img src={src} alt={`Source document ${doc.fileName}`} style={{ display: "block", maxWidth: "100%", margin: "0 auto" }} />
      ) : (
        <iframe src={src} title={`Source document ${doc.fileName}`} style={{ width: "100%", height: 520, border: "none" }} />
      )}
      <div style={{ padding: "6px 10px", borderTop: "1px solid var(--border-strong)" }}>
        <a href={src} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5, color: "var(--wine-primary)", textDecoration: "underline" }}>Open {doc.fileName} in a new tab</a>
      </div>
    </div>
  );
}
