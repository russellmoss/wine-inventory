import "server-only";
import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";
import { FeedbackAttachmentCaptureSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { safeFilename } from "@/lib/feedback/sanitize";
import { runAsTenant } from "@/lib/tenant/context";

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_ITEM = 5;
export const MAX_IMAGE_DIMENSION = 6000;

export type ValidatedImage = {
  bytes: Buffer;
  contentType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  sha256: string;
};

function readPng(input: Buffer): { width: number; height: number } | null {
  const sig = "89504e470d0a1a0a";
  if (input.length < 33 || input.subarray(0, 8).toString("hex") !== sig) return null;
  if (input.subarray(12, 16).toString("ascii") !== "IHDR") return null;
  return { width: input.readUInt32BE(16), height: input.readUInt32BE(20) };
}

function readJpeg(input: Buffer): { width: number; height: number } | null {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < input.length) {
    if (input[offset] !== 0xff) return null;
    const marker = input[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = input.readUInt16BE(offset);
    if (length < 2 || offset + length > input.length) return null;
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return { height: input.readUInt16BE(offset + 3), width: input.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function stripPngMetadata(input: Buffer): Buffer {
  const chunks: Buffer[] = [input.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= input.length) {
    const length = input.readUInt32BE(offset);
    const type = input.subarray(offset + 4, offset + 8).toString("ascii");
    const end = offset + 12 + length;
    if (end > input.length) break;
    const isCritical = type[0] >= "A" && type[0] <= "Z";
    if (isCritical) chunks.push(input.subarray(offset, end));
    offset = end;
    if (type === "IEND") break;
  }
  return Buffer.concat(chunks);
}

function stripJpegMetadata(input: Buffer): Buffer {
  const chunks: Buffer[] = [input.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= input.length) {
    if (input[offset] !== 0xff) break;
    const marker = input[offset + 1];
    if (marker === 0xda) {
      chunks.push(input.subarray(offset));
      break;
    }
    const length = input.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (end > input.length) break;
    const isMetadata = marker >= 0xe0 && marker <= 0xef;
    if (!isMetadata) chunks.push(input.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(chunks);
}

export function validateAndStripImage(input: Buffer): ValidatedImage {
  if (input.length === 0 || input.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
  const png = readPng(input);
  const jpeg = png ? null : readJpeg(input);
  const dims = png ?? jpeg;
  if (!dims) throw new Error("Only real PNG or JPEG images are accepted.");
  if (
    dims.width < 1 ||
    dims.height < 1 ||
    dims.width > MAX_IMAGE_DIMENSION ||
    dims.height > MAX_IMAGE_DIMENSION
  ) {
    throw new Error("Image dimensions are too large.");
  }
  const contentType = png ? "image/png" : "image/jpeg";
  const bytes = png ? stripPngMetadata(input) : stripJpegMetadata(input);
  return {
    bytes,
    contentType,
    width: dims.width,
    height: dims.height,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

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
  const ext = input.image.contentType === "image/png" ? "png" : "jpg";
  const blob = await put(
    `feedback/${input.tenantId}/${Date.now()}-${filename.replace(/\.[^.]+$/, "")}.${ext}`,
    input.image.bytes,
    {
      access: "private",
      addRandomSuffix: true,
      contentType: input.image.contentType,
    },
  );

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
  const blob = await get(attachment.blobUrl, { access: "private" });
  if (!blob) return null;
  return { attachment, blob };
}
