"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import {
  createIngestedInvoiceCore,
  updateIngestedInvoiceLineCore,
  updateIngestedInvoiceCore,
  applyIngestedInvoiceCore,
  type IngestDocumentInput,
  type LinePatch,
  type InvoicePatch,
  type ApplyResult,
} from "@/lib/ingest/ingest-invoice-core";
import { extractDocuments, type ExtractionInput } from "@/lib/ingest/extract-invoice";

// Plan 072: server-action wrappers over the ingest cores (READY-USER gated via `action`, like the expendables
// intake flow). Extraction + apply are the two heavy steps; the review screen calls the rest. The UI and the
// assistant tool both go through these; scripts call the cores directly.

function revalidateIngest() {
  revalidatePath("/setup/expendables");
}

/** Extract a pile of already-uploaded blobs (Unit 3) and stage them (Unit 7). Returns the created staging
 *  invoices + soft duplicate warnings + any per-doc extraction failures (isolated, don't fail the batch). */
export const extractAndStageAction = action(async ({ actor }, input: { batchId: string; files: ExtractionInput[] }) => {
  const results = await extractDocuments(input.files);
  const documents: IngestDocumentInput[] = [];
  const failed: { fileName: string; error: string }[] = [];
  for (const r of results) {
    if (r.ok) documents.push({ blobUrl: r.blobUrl, fileName: r.fileName, mimeType: r.mimeType, fileSha256: r.fileSha256, document: r.document });
    else failed.push({ fileName: r.fileName, error: r.error });
  }
  const created = documents.length ? await createIngestedInvoiceCore(actor, { batchId: input.batchId, documents }) : { invoices: [], warnings: [] };
  revalidateIngest();
  return { ...created, failed };
});

export const updateIngestedInvoiceLineAction = action(async ({ actor }, lineId: string, patch: LinePatch) => {
  await updateIngestedInvoiceLineCore(actor, lineId, patch);
  revalidateIngest();
});

export const updateIngestedInvoiceAction = action(async ({ actor }, id: string, patch: InvoicePatch) => {
  await updateIngestedInvoiceCore(actor, id, patch);
  revalidateIngest();
});

export const applyIngestedInvoiceAction = action(
  async ({ actor }, ingestedInvoiceId: string, opts?: { allowReconcileMismatch?: boolean; allowPartialAp?: boolean }): Promise<ApplyResult> => {
    const res = await applyIngestedInvoiceCore(actor, { ingestedInvoiceId, ...(opts ?? {}) });
    revalidateIngest();
    return res;
  },
);
