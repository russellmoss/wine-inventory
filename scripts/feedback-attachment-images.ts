/**
 * Loads a feedback item's image attachments and turns them into Anthropic image
 * content blocks for the bug-fix / assistant-feedback agents.
 *
 * Split in two so the decision logic is unit-testable with no IO:
 *  - selectImagesForModel(...)      PURE. Given already-fetched buffers, decides which
 *                                   images to send (type/size/count/budget guards) and
 *                                   builds the content blocks + a note about anything skipped.
 *  - loadFeedbackAttachmentImages(...) THIN IO. Reads the rows, fetches private Blob
 *                                   bytes via the SAME @vercel/blob get() the app uses,
 *                                   then calls the pure selector. Returns empty (text-only)
 *                                   when BLOB_READ_WRITE_TOKEN is unset — mirrors the app's
 *                                   upload route degrading gracefully.
 *
 * Images are UNTRUSTED user data; the agents' system prompts frame them as such.
 *
 * @vercel/blob is loaded via dynamic import inside the IO path only, so importing this
 * module for the pure selector (e.g. in unit tests) pulls in no runtime dependencies.
 */
import type { PrismaClient } from "@prisma/client";

export type SupportedMediaType = "image/png" | "image/jpeg";

export type AttachmentImageInput = {
  id: string;
  contentType: string;
  bytes: Buffer;
};

export type ImageBlock = {
  type: "image";
  source: { type: "base64"; media_type: SupportedMediaType; data: string };
};

export type SelectImagesResult = { blocks: ImageBlock[]; skippedNote: string };

// Anthropic accepts up to ~5MB of base64 image data per request image. base64 inflates
// bytes by ~4/3, so 3.5MB raw -> ~4.67MB encoded, safely under the limit. We also cap the
// count and the total encoded budget to keep token cost + latency bounded. Screenshots are
// far smaller than these caps in practice; the guards only bite on pathological uploads.
export const IMAGE_SELECTION = {
  maxImages: 4,
  maxSingleImageBytes: 3_500_000,
  maxTotalBytes: 9_000_000,
} as const;

function mediaTypeOf(contentType: string): SupportedMediaType | null {
  const c = contentType.toLowerCase();
  if (c === "image/png") return "image/png";
  if (c === "image/jpeg" || c === "image/jpg") return "image/jpeg";
  return null;
}

/**
 * PURE. Decide which attachment images to send to the model and build content blocks.
 * Preserves input order. Never throws; anything it declines is summarised in skippedNote.
 */
export function selectImagesForModel(
  inputs: AttachmentImageInput[],
  opts: { maxImages?: number; maxSingleImageBytes?: number; maxTotalBytes?: number } = {},
): SelectImagesResult {
  const maxImages = opts.maxImages ?? IMAGE_SELECTION.maxImages;
  const maxSingleImageBytes = opts.maxSingleImageBytes ?? IMAGE_SELECTION.maxSingleImageBytes;
  const maxTotalBytes = opts.maxTotalBytes ?? IMAGE_SELECTION.maxTotalBytes;

  const blocks: ImageBlock[] = [];
  const skipped = { unsupported: 0, tooLarge: 0, overCount: 0, overBudget: 0 };
  let total = 0;

  for (const input of inputs) {
    const media = mediaTypeOf(input.contentType);
    if (!media) {
      skipped.unsupported++;
      continue;
    }
    if (input.bytes.length > maxSingleImageBytes) {
      skipped.tooLarge++;
      continue;
    }
    if (blocks.length >= maxImages) {
      skipped.overCount++;
      continue;
    }
    if (total + input.bytes.length > maxTotalBytes) {
      skipped.overBudget++;
      continue;
    }
    blocks.push({
      type: "image",
      source: { type: "base64", media_type: media, data: input.bytes.toString("base64") },
    });
    total += input.bytes.length;
  }

  const reasons: string[] = [];
  if (skipped.tooLarge) reasons.push(`${skipped.tooLarge} too large`);
  if (skipped.overCount) reasons.push(`${skipped.overCount} over the ${maxImages}-image limit`);
  if (skipped.overBudget) reasons.push(`${skipped.overBudget} over the size budget`);
  if (skipped.unsupported) reasons.push(`${skipped.unsupported} of an unsupported type`);

  const totalSkipped = skipped.unsupported + skipped.tooLarge + skipped.overCount + skipped.overBudget;
  const skippedNote = totalSkipped
    ? `\n\nNote: ${totalSkipped} attached screenshot(s) were not shown to you (${reasons.join(", ")}). ` +
      `Reason about the ${blocks.length} image(s) you can see and the text; do not assume the omitted images.`
    : "";

  return { blocks, skippedNote };
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Buffer[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

type AttachmentRow = {
  id: string;
  contentType: string;
  blobUrl: string;
  annotatedBlobUrl: string | null;
};

/**
 * THIN IO. Load a ticket's (or assistant-feedback's) image attachments as content blocks.
 * Uses the raw PrismaClient the agents already hold (CI owner connection, no tenant
 * extension). Returns text-only when the Blob token is absent or on any read failure.
 */
export async function loadFeedbackAttachmentImages(
  prisma: PrismaClient,
  where: { ticketId: string } | { assistantFeedbackId: string },
): Promise<SelectImagesResult> {
  const empty: SelectImagesResult = { blocks: [], skippedNote: "" };
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) return empty;

  let rows: AttachmentRow[];
  try {
    rows = await prisma.feedbackAttachment.findMany({
      where,
      orderBy: { createdAt: "asc" },
      select: { id: true, contentType: true, blobUrl: true, annotatedBlobUrl: true },
    });
  } catch (e) {
    console.warn(`Could not load feedback attachments: ${e instanceof Error ? e.message : e}`);
    return empty;
  }
  if (rows.length === 0) return empty;

  const inputs: AttachmentImageInput[] = [];
  for (const row of rows) {
    // Prefer the annotated version (the user drew on it — higher signal) when present.
    const url = row.annotatedBlobUrl ?? row.blobUrl;
    try {
      const { get } = await import("@vercel/blob");
      const blob = await get(url, { access: "private" });
      if (!blob) continue;
      const bytes = await streamToBuffer(blob.stream as unknown as ReadableStream<Uint8Array>);
      inputs.push({ id: row.id, contentType: row.contentType, bytes });
    } catch (e) {
      console.warn(`Could not fetch attachment ${row.id}: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (inputs.length === 0) return empty;

  return selectImagesForModel(inputs);
}
