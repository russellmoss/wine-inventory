import "server-only";
import type { AssistantTool } from "../registry";
import { listRecentIntakes } from "@/lib/ingest/ingest-invoice-core";

// Plan 072 (follow-up): the READ counterpart to ingest_documents / the review screen — visibility into what
// was bulk-intaken. Answers "what did I just intake?", "show my recent invoice ingests", "what expendables
// did the Crush2Cellar invoice add?", "is that intake applied or still pending?". Read-only; to undo an
// applied intake use reverse_intake.

export const queryRecentIntakesTool: AssistantTool = {
  name: "query_recent_intakes",
  description:
    "List recently ingested supplier documents (invoices/proformas/COAs) and what they added to inventory. " +
    "Use for 'what did I just intake', 'show my recent invoice ingests', 'what consumables did the Crush2Cellar " +
    "invoice add', 'is that intake applied or still pending'. Returns each intake's vendor, invoice #, document " +
    "type, status (pending | applied | discarded), and — for applied ones — the materials + lots + quantities " +
    "it created and the invoice total. Read-only; to undo an applied intake use reverse_intake.",
  kind: "read",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Maximum intakes to return, newest first (default 10, capped at 50)." },
    },
  },
  async run(_ctx, rawInput) {
    const r = (rawInput ?? {}) as Record<string, unknown>;
    const limit = typeof r.limit === "number" && r.limit > 0 ? r.limit : 10;
    const intakes = await listRecentIntakes({ limit });
    return { count: intakes.length, intakes };
  },
};
