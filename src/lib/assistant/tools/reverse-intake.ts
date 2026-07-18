import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { reverseIngestedInvoiceAction } from "@/lib/ingest/actions";
import { listRecentIntakes } from "@/lib/ingest/ingest-invoice-core";

// Plan 072 (follow-up): back out an APPLIED invoice intake — the WRITE counterpart to ingest_documents.
// Removes the stock lots, A/P bills, and newly-created materials it added, then discards the intake. Blocked
// if any of the stock was already used or an A/P bill was already posted to QuickBooks (those must be handled
// per-item / in QBO). The assistant gets the intake id from query_recent_intakes; the confirm does the write.

export const reverseIntakeTool: AssistantTool = {
  name: "reverse_intake",
  description:
    "Undo / back out an APPLIED invoice intake — removes the stock lots, A/P bills, and newly-created materials " +
    "it added, then discards the intake. Use for 'back out the Crush2Cellar invoice', 'undo that intake I just " +
    "applied', 'reverse the invoice I ingested by mistake'. It's blocked if any of the stock was already used or " +
    "an A/P bill was already posted to QuickBooks. Get the intake id from query_recent_intakes first. Returns a " +
    "preview of exactly what will be removed, to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      ingestedInvoiceId: { type: "string", description: "The applied intake to reverse (its id from query_recent_intakes)." },
    },
    required: ["ingestedInvoiceId"],
  },
  async run(_ctx, rawInput) {
    const r = (rawInput ?? {}) as Record<string, unknown>;
    const id = typeof r.ingestedInvoiceId === "string" ? r.ingestedInvoiceId.trim() : "";
    if (!id) throw new Error("Which intake should I reverse? Use query_recent_intakes to find it.");
    const target = (await listRecentIntakes({ limit: 50 })).find((i) => i.id === id);
    if (!target) throw new Error("I couldn't find that intake. Use query_recent_intakes to see recent ones.");
    if (target.status !== "applied") throw new Error(`That intake is "${target.status}", not applied — there's nothing to reverse.`);
    const n = target.lots.length;
    const names = target.lots.map((l) => l.materialName).join(", ");
    const preview =
      `Reverse the ${target.vendorName ?? "supplier"} intake ${target.invoiceNumber ?? ""}`.trim() +
      ` — remove ${n} lot${n === 1 ? "" : "s"}${names ? ` (${names})` : ""}` +
      `${target.invoiceTotal != null ? ` totaling ${target.invoiceTotal} ${target.currency ?? ""}`.trimEnd() : ""}` +
      `, its A/P bill(s), and any materials it created, then discard the intake. Stock already used or A/P already posted to QuickBooks can't be auto-reversed.`;
    const token = signProposal("reverse_intake", { ingestedInvoiceId: id });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitReverseIntake: Committer = async (_user, args) => {
  const id = String(args.ingestedInvoiceId ?? "");
  if (!id) return { message: "No intake specified." };
  const res = await reverseIngestedInvoiceAction(id);
  if (!res.ok) return { message: `Couldn't reverse the intake: ${res.error}` };
  return {
    message: `Reversed the intake — removed ${res.reversedLotIds.length} lot(s), ${res.deletedMaterialIds.length} new material(s), and ${res.apRemoved} A/P bill(s). The vendor was kept.`,
    navigate: { path: "/setup/expendables", label: "View expendables" },
  };
};
