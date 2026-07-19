"use server";

import { revalidatePath } from "next/cache";
import { action, safeAction } from "@/lib/actions";
import { createManualInvoiceCore, type ManualInvoiceInput, type CreateManualInvoiceResult } from "@/lib/ingest/manual-invoice-core";
import {
  createIngestedInvoiceCore,
  updateIngestedInvoiceLineCore,
  updateIngestedInvoiceCore,
  applyIngestedInvoiceCore,
  reverseIngestedInvoiceCore,
  setInvoicePaymentStatusCore,
  type IngestDocumentInput,
  type LinePatch,
  type InvoicePatch,
  type ApplyResult,
  type ReverseResult,
  type SetPaymentResult,
} from "@/lib/ingest/ingest-invoice-core";
import { extractDocuments, type ExtractionInput } from "@/lib/ingest/extract-invoice";

// Plan 072: server-action wrappers over the ingest cores (READY-USER gated via `action`, like the expendables
// intake flow). Extraction + apply are the two heavy steps; the review screen calls the rest. The UI and the
// assistant tool both go through these; scripts call the cores directly.

function revalidateIngest() {
  revalidatePath("/setup/expendables");
  revalidatePath("/inventory");
}

/**
 * Plan 080 U4: stage a HAND-TYPED invoice. Lands on the same review screen and applies through the same core
 * as an AI-extracted upload, so A/P stays one aggregate bill per invoice (AP-1). `safeAction` — validation
 * blocks (no vendor, no lines, a non-material line, an inactive location) are messages the user must SEE, and
 * a thrown ActionError is redacted to Next's opaque error in production. Callers `unwrap(...)`.
 */
export const createManualInvoiceAction = safeAction(async ({ actor }, input: ManualInvoiceInput): Promise<CreateManualInvoiceResult> => {
  const res = await createManualInvoiceCore(actor, input);
  revalidateIngest();
  return res;
});

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
  const created = documents.length ? await createIngestedInvoiceCore(actor, { batchId: input.batchId, documents }) : { invoices: [], warnings: [], duplicates: [] };
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
  async ({ actor }, ingestedInvoiceId: string, opts?: { allowReconcileMismatch?: boolean; allowPartialAp?: boolean; allowDuplicate?: boolean }): Promise<ApplyResult> => {
    const res = await applyIngestedInvoiceCore(actor, { ingestedInvoiceId, ...(opts ?? {}) });
    revalidateIngest();
    return res;
  },
);

/** Plan 076: set an invoice's A/P payment status (Paid/Outstanding) after apply — syncs to QBO via the poster. */
export const setInvoicePaymentStatusAction = action(
  async ({ actor }, ingestedInvoiceId: string, paymentStatus: "OUTSTANDING" | "PAID", paidFromAccount?: string | null): Promise<SetPaymentResult> => {
    const res = await setInvoicePaymentStatusCore(actor, { ingestedInvoiceId, paymentStatus, paidFromAccount });
    revalidateIngest();
    return res;
  },
);

/** Reverse an applied intake — remove the lots + A/P + new materials it created, discard the invoice. */
export const reverseIngestedInvoiceAction = action(
  async ({ actor }, ingestedInvoiceId: string): Promise<ReverseResult> => {
    const res = await reverseIngestedInvoiceCore(actor, { ingestedInvoiceId });
    revalidateIngest();
    return res;
  },
);
