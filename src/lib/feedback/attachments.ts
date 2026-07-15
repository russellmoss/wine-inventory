import "server-only";
import { FeedbackAttachmentCaptureSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeFilename } from "@/lib/feedback/sanitize";
import { runAsTenant } from "@/lib/tenant/context";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  MAX_IMAGE_DIMENSION,
  type ValidatedImage,
  validateAndStripImage,
  putPrivateImage,
  getPrivateBlob,
} from "@/lib/attachments/blob";

// Plan 068 Unit 3: the image validation + private-blob put/get now live in the shared
// src/lib/attachments/blob.ts (DRY with DM attachments). Re-exported here so the feedback routes /
// form keep importing them from this module unchanged (behavior-preserving refactor).
export {
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_ITEM,
  MAX_IMAGE_DIMENSION,
  type ValidatedImage,
  validateAndStripImage,
};

export async function storeFeedbackAttachment(input: {
  tenantId: string;
  ticketId?: string | null;
  assistantFeedbackId?: string | null;
  filename: string;
  captureSource: FeedbackAttachmentCaptureSource;
  image: ValidatedImage;
}) {
  const parentWhere = input.ticketId
    ? { ticketId: input.ticketId }
    : { assistantFeedbackId: input.assistantFeedbackId ?? "" };
  const existing = await runAsTenant(input.tenantId, () =>
    prisma.feedbackAttachment.count({ where: parentWhere }),
  );
  if (existing >= MAX_ATTACHMENTS_PER_ITEM) throw new Error("Too many attachments for this item.");

  const filename = safeFilename(input.filename);
  const blob = await putPrivateImage("feedback", input.tenantId, filename, input.image);

  return runAsTenant(input.tenantId, () =>
    prisma.feedbackAttachment.create({
      data: {
        ticketId: input.ticketId ?? null,
        assistantFeedbackId: input.assistantFeedbackId ?? null,
        filename,
        contentType: input.image.contentType,
        byteSize: input.image.bytes.length,
        width: input.image.width,
        height: input.image.height,
        sha256: input.image.sha256,
        blobUrl: blob.url,
        captureSource: input.captureSource,
      },
      select: { id: true, filename: true, contentType: true, byteSize: true, width: true, height: true },
    }),
  );
}

export async function readFeedbackAttachmentBlob(tenantId: string, attachmentId: string) {
  const attachment = await runAsTenant(tenantId, () =>
    prisma.feedbackAttachment.findUnique({
      where: { id: attachmentId },
      select: { blobUrl: true, filename: true, contentType: true },
    }),
  );
  if (!attachment) return null;
  const blob = await getPrivateBlob(attachment.blobUrl);
  if (!blob) return null;
  return { attachment, blob };
}
