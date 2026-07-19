import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { unwrap } from "@/lib/action-result";
import { pickLocation } from "./location-picker";
import { createManualInvoiceAction } from "@/lib/ingest/actions";
import type { ManualInvoiceLineInput } from "@/lib/ingest/manual-invoice-core";

// Plan 080 U12 — enter a supplier invoice BY HAND (wraps createManualInvoiceCore). The dictated-invoice
// counterpart to ingest_documents: no file to upload, the winemaker just says what they bought. It STAGES
// only — nothing is booked here. The user lands on the same review screen as an uploaded invoice, where the
// dedup / reconciliation / FX gates run and the single aggregate A/P bill (AP-1) is emitted on confirm.
//
// WAVE-1 SCOPE (council C6): consumables/parts only. The core hard-refuses an equipment-asset or
// finished-good line until Wave 3 wires per-line target routing, and the description says so, so the model
// steers a pump to add_equipment rather than mis-filing it as a consumable.

type RawLine = { description?: string; qty?: number; unit?: string; unitPrice?: number; lineTotal?: number; lotCode?: string };
type RawInput = {
  vendor?: string;
  location?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  currency?: string;
  invoiceTotal?: number;
  shipping?: number;
  tax?: number;
  lines?: RawLine[];
};

export const addInvoiceTool: AssistantTool = {
  name: "add_invoice",
  description:
    "Enter a supplier invoice BY HAND for consumables/parts, when there's no document to upload: 'add an invoice from Scott Labs, 5 kg Fermaid-O at $12 a kg and 10 kg bentonite at $4, $40 shipping, delivered to the Lab'. Stages the invoice and opens the review screen — nothing is written to inventory or accounting until the user confirms there. If the user has an actual FILE (PDF/photo) use ingest_documents instead. For a piece of equipment use add_equipment; this path handles consumables and parts only.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      vendor: { type: "string", description: "Supplier name, e.g. 'Scott Labs'." },
      location: { type: "string", description: "Where the delivery landed, e.g. 'Lab'. Every line lands here." },
      invoiceNumber: { type: "string", description: "Supplier invoice number, if given." },
      invoiceDate: { type: "string", description: "Invoice date, ISO (YYYY-MM-DD)." },
      currency: { type: "string", description: "Invoice currency (USD, EUR…). Omit for the winery's base currency." },
      invoiceTotal: { type: "number", description: "The supplier's grand total, if stated — used to reconcile the entry." },
      shipping: { type: "number", description: "Shipping/freight charged on the invoice (absorbed into unit cost)." },
      tax: { type: "number", description: "Tax charged (surfaced separately; never capitalized into unit cost)." },
      lines: {
        type: "array",
        description: "One entry per invoice line.",
        items: {
          type: "object",
          properties: {
            description: { type: "string", description: "What was bought, as written on the invoice." },
            qty: { type: "number", description: "Quantity in the invoice's unit." },
            unit: { type: "string", description: "Invoice unit as written, e.g. '25 kg', 'case', 'L'." },
            unitPrice: { type: "number", description: "Price per invoice unit. Omit if unknown (never recorded as $0)." },
            lineTotal: { type: "number", description: "Line extended total, if stated." },
            lotCode: { type: "string", description: "Supplier lot/batch code, if given." },
          },
          required: ["description"],
        },
      },
    },
    required: ["vendor", "location", "lines"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const vendor = input.vendor?.trim();
    if (!vendor) throw new Error("Who is the invoice from?");
    const rawLines = Array.isArray(input.lines) ? input.lines : [];
    const lines = rawLines.filter((l) => l?.description?.trim());
    if (lines.length === 0) throw new Error("What was on the invoice? Give me at least one line.");

    const loc = await pickLocation(input.location);
    let invoiceDate: string | undefined;
    if (input.invoiceDate?.trim()) {
      const d = new Date(input.invoiceDate);
      if (Number.isNaN(d.getTime())) throw new Error(`"${input.invoiceDate}" isn't a date I can read — use YYYY-MM-DD.`);
      invoiceDate = d.toISOString();
    }

    const lineSummary = lines
      .map((l) => `${l.qty ?? "?"}${l.unit ? ` ${l.unit}` : ""} ${l.description!.trim()}${l.unitPrice != null ? ` @ ${l.unitPrice}` : ""}`)
      .join("; ");
    const chargeClause = [input.shipping != null ? `shipping ${input.shipping}` : null, input.tax != null ? `tax ${input.tax}` : null].filter(Boolean).join(", ");
    const preview =
      `Stage an invoice from ${vendor}${input.invoiceNumber ? ` (#${input.invoiceNumber})` : ""} into ${loc.name}: ${lineSummary}` +
      `${chargeClause ? ` — ${chargeClause}` : ""}. Nothing is written until you confirm it on the review screen.`;

    const token = signProposal("add_invoice", {
      vendor,
      locationId: loc.id,
      locationLabel: loc.name,
      ...(input.invoiceNumber?.trim() ? { invoiceNumber: input.invoiceNumber.trim() } : {}),
      ...(invoiceDate ? { invoiceDate } : {}),
      ...(input.currency?.trim() ? { currency: input.currency.trim() } : {}),
      ...(typeof input.invoiceTotal === "number" ? { invoiceTotal: input.invoiceTotal } : {}),
      ...(typeof input.shipping === "number" ? { shipping: input.shipping } : {}),
      ...(typeof input.tax === "number" ? { tax: input.tax } : {}),
      lines: lines as unknown as Record<string, unknown>[],
    });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitAddInvoice: Committer = async (_user, args) => {
  const rawLines = (args.lines as RawLine[]) ?? [];
  const lines: ManualInvoiceLineInput[] = rawLines
    .filter((l) => l?.description?.trim())
    .map((l) => ({
      description: String(l.description).trim(),
      qty: l.qty == null ? null : Number(l.qty),
      unit: l.unit == null ? null : String(l.unit),
      unitPrice: l.unitPrice == null ? null : Number(l.unitPrice),
      lineTotal: l.lineTotal == null ? null : Number(l.lineTotal),
      lotNo: l.lotCode == null ? null : String(l.lotCode),
    }));

  // unwrap: a validation block (no lines, inactive location, a non-material line) must reach the user.
  const staged = unwrap(
    await createManualInvoiceAction({
      vendorName: String(args.vendor),
      locationId: String(args.locationId),
      invoiceNumber: args.invoiceNumber == null ? null : String(args.invoiceNumber),
      invoiceDate: args.invoiceDate == null ? null : new Date(String(args.invoiceDate)),
      currency: args.currency == null ? null : String(args.currency),
      invoiceTotal: args.invoiceTotal == null ? null : Number(args.invoiceTotal),
      charges:
        args.shipping != null || args.tax != null
          ? { shipping: args.shipping == null ? null : Number(args.shipping), tax: args.tax == null ? null : Number(args.tax) }
          : null,
      lines,
    }),
  );

  const dupNote = staged.duplicates.length ? " Heads up: this looks like a duplicate of an invoice already in the queue." : "";
  return {
    message: `Staged the invoice from ${String(args.vendor)} (${lines.length} line${lines.length === 1 ? "" : "s"}) for ${String(args.locationLabel ?? "the location")}.${dupNote} Opening the review screen — nothing hits inventory or accounting until you confirm there.`,
    navigate: { path: `/setup/expendables/ingest?batch=${staged.batchId}`, label: "Review invoice" },
  };
};
