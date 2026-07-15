import "server-only";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import {
  MAX_ATTACHMENTS_PER_ITEM,
  type ValidatedImage,
  getPrivateBlob,
  putPrivateImage,
  safeAttachmentName,
} from "@/lib/attachments/blob";

// Plan 068 Unit 3 — DM attachments. Uploaded AFTER the message exists (keyed by messageId, like the
// feedback ticket→attachment flow) so the client never handles a blobUrl. Only the message's sender
// may attach; only thread participants may read (both enforced by per-user RLS + explicit checks).

/** Store a validated image as an attachment on one of MY sent messages. Cap: 5 per message. */
export async function storeDirectMessageAttachment(input: {
  tenantId: string;
  userId: string;
  messageId: string;
  filename: string;
  image: ValidatedImage;
}) {
  return runAsTenant(
    input.tenantId,
    async () => {
      const msg = await prisma.directMessage.findFirst({
        where: { id: input.messageId },
        select: { id: true, senderUserId: true },
      });
      if (!msg) throw new Error("Message not found.");
      if (msg.senderUserId !== input.userId) throw new Error("You can only attach to your own messages.");
      const existing = await prisma.directMessageAttachment.count({ where: { messageId: input.messageId } });
      if (existing >= MAX_ATTACHMENTS_PER_ITEM) throw new Error("Too many attachments for this message.");

      const filename = safeAttachmentName(input.filename);
      const blob = await putPrivateImage("inbox-dm", input.tenantId, filename, input.image);
      return prisma.directMessageAttachment.create({
        data: {
          tenantId: input.tenantId,
          messageId: input.messageId,
          filename,
          contentType: input.image.contentType,
          byteSize: input.image.bytes.length,
          width: input.image.width,
          height: input.image.height,
          sha256: input.image.sha256,
          blobUrl: blob.url,
        },
        select: { id: true, filename: true, contentType: true, byteSize: true, width: true, height: true },
      });
    },
    { userId: input.userId },
  );
}

/** Read a DM attachment's blob for the authed download proxy. Per-user RLS guarantees the requester
 *  is a participant of the parent thread — a non-participant sees no row and gets null (→ 404). */
export async function readDirectMessageAttachmentBlob(tenantId: string, userId: string, attachmentId: string) {
  const attachment = await runAsTenant(
    tenantId,
    async () =>
      await prisma.directMessageAttachment.findFirst({
        where: { id: attachmentId },
        select: { blobUrl: true, filename: true, contentType: true },
      }),
    { userId },
  );
  if (!attachment) return null;
  const blob = await getPrivateBlob(attachment.blobUrl);
  if (!blob) return null;
  return { attachment, blob };
}
