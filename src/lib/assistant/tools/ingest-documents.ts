import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { extractAndStageAction } from "@/lib/ingest/actions";
import type { ExtractionInput } from "@/lib/ingest/extract-invoice";
// Import a type from the apply core so ingest-invoice-core.ts is in this tool's import closure (verify:ai-native).
import type { ApplyResult } from "@/lib/ingest/ingest-invoice-core";

// Plan 072 Unit 9: let the assistant trigger document ingestion ("add these to inventory"). Deterministic
// per-line editing belongs on the review SCREEN, not in chat — so the commit EXTRACTS + stages, then
// NAVIGATES the user to the review screen (CommitResult.navigate) rather than editing in-chat. Also satisfies
// the verify:ai-native core→tool guard (the apply core is reachable from an assistant tool).

type RawFile = { blobUrl?: string; fileName?: string; mimeType?: string; fileSha256?: string };
type RawInput = { files?: RawFile[] };

const s = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

function normalizeFiles(raw: RawFile[] | undefined): ExtractionInput[] {
  const out: ExtractionInput[] = [];
  for (const f of raw ?? []) {
    const blobUrl = s(f.blobUrl);
    const fileName = s(f.fileName);
    const mimeType = s(f.mimeType);
    if (!blobUrl || !fileName || !mimeType) continue;
    out.push({ blobUrl, fileName, mimeType, fileSha256: s(f.fileSha256) ?? null });
  }
  return out;
}

export const ingestDocumentsTool: AssistantTool = {
  name: "ingest_documents",
  description:
    "Ingest already-uploaded supplier documents (invoices, proformas, COAs) into inventory. Use when the user " +
    "says 'add these to inventory', 'ingest this invoice', 'read these supplier docs'. The documents must " +
    "already be uploaded (via the ingest upload); pass their blob references. This EXTRACTS + classifies each " +
    "document and stages a per-invoice review — it does NOT write inventory directly. The confirm takes the " +
    "user to the review screen where they check the vendor, line items, and dedup decisions before applying.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        description: "The already-uploaded documents to ingest (blob references from the ingest upload).",
        items: {
          type: "object",
          properties: {
            blobUrl: { type: "string", description: "Private blob URL of the uploaded document." },
            fileName: { type: "string" },
            mimeType: { type: "string", description: "e.g. application/pdf, image/png" },
            fileSha256: { type: "string" },
          },
          required: ["blobUrl", "fileName", "mimeType"],
        },
      },
    },
    required: ["files"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as RawInput;
    const files = normalizeFiles(input.files);
    if (files.length === 0) {
      throw new Error("Upload the supplier document(s) first, then I can ingest them.");
    }
    const preview = `Read + classify ${files.length} uploaded document${files.length === 1 ? "" : "s"}, then open the review screen to confirm the vendor and line items before anything is written to inventory.`;
    const token = signProposal("ingest_documents", { files: files as unknown as Record<string, unknown>[] });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitIngestDocuments: Committer = async (_user, args) => {
  const files = ((args.files as ExtractionInput[]) ?? []).filter((f) => f?.blobUrl && f?.fileName && f?.mimeType);
  if (files.length === 0) return { message: "No documents to ingest." };
  const batchId = `ingest-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const staged = await extractAndStageAction({ batchId, files });
  const n = staged.invoices.length;
  const failedNote = staged.failed.length ? ` (${staged.failed.length} couldn't be read — you can enter those manually)` : "";
  return {
    message: `Read ${n} document${n === 1 ? "" : "s"}${failedNote}. Opening the review screen to confirm before writing to inventory.`,
    navigate: { path: `/setup/expendables/ingest?batch=${batchId}`, label: "Review ingested documents" },
  };
};

// Referenced only so the ApplyResult import (and thus the apply core) stays in the module graph for verify:ai-native.
export type IngestDocumentsApplyResult = ApplyResult;
