import "server-only";
import { createHash } from "node:crypto";
import { get, put } from "@vercel/blob";

// Plan 068 Unit 3 (review decision 2) — the shared private-blob helper, factored out of
// feedback/attachments.ts so feedback AND direct-message attachments share ONE upload/validate path.
// Domain-neutral: it validates+strips an image, puts it as a PRIVATE blob, and reads it back. Each
// domain owns its own attachment table + per-item cap.

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

/** True when Vercel Blob credentials are configured; callers skip attachment storage gracefully otherwise. */
export function hasBlobCredentials(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN || !!process.env.VERCEL_OIDC_TOKEN;
}

/** Sanitize an untrusted filename to a safe basename (mirrors feedback/sanitize.safeFilename). */
export function safeAttachmentName(input: string): string {
  const base = input.split(/[\\/]/).pop() || "attachment";
  return base.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "attachment";
}

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

/** Validate that the bytes are a real PNG/JPEG within limits, strip metadata, return normalized image. */
export function validateAndStripImage(input: Buffer): ValidatedImage {
  if (input.length === 0 || input.length > MAX_ATTACHMENT_BYTES) {
    throw new Error("Image must be 5 MB or smaller.");
  }
  const png = readPng(input);
  const jpeg = png ? null : readJpeg(input);
  const dims = png ?? jpeg;
  if (!dims) throw new Error("Only real PNG or JPEG images are accepted.");
  if (dims.width < 1 || dims.height < 1 || dims.width > MAX_IMAGE_DIMENSION || dims.height > MAX_IMAGE_DIMENSION) {
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

/** Store a validated image as a PRIVATE blob under `<pathPrefix>/<tenantId>/…`. Returns the blob url
 *  (server-only — never handed to the client; downloads go through an authed proxy route). */
export async function putPrivateImage(
  pathPrefix: string,
  tenantId: string,
  safeName: string,
  image: ValidatedImage,
): Promise<{ url: string }> {
  const ext = image.contentType === "image/png" ? "png" : "jpg";
  const blob = await put(
    `${pathPrefix}/${tenantId}/${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.${ext}`,
    image.bytes,
    { access: "private", addRandomSuffix: true, contentType: image.contentType },
  );
  return { url: blob.url };
}

/** Read a private blob by its stored url. Returns null when the blob is gone. */
export async function getPrivateBlob(blobUrl: string) {
  return get(blobUrl, { access: "private" });
}

// Plan 072 Unit 3 (invoice/document ingestion) — additive document intake on top of the image path.
// Ingestion accepts a pile of PDFs AND images; PDFs are stored verbatim (never metadata-stripped —
// stripping is an image-only concern and would corrupt a PDF), images reuse the validate+strip path.

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENTS_PER_REQUEST = 10;

export type ValidatedDocument = {
  bytes: Buffer;
  contentType: "application/pdf" | "image/png" | "image/jpeg";
  sha256: string;
};

/** True when the bytes begin with the "%PDF-" magic marker. */
function isPdf(input: Buffer): boolean {
  return input.length >= 5 && input.subarray(0, 5).toString("ascii") === "%PDF-";
}

/** Validate an ingestion document — a PDF (verbatim, size-capped, magic-byte checked) or a PNG/JPEG
 *  image (reuses validateAndStripImage). `declaredType` is the client-supplied MIME hint; the actual
 *  bytes are always the source of truth. Throws with a clear message on any rejection. */
export function validateDocument(input: Buffer, declaredType?: string | null): ValidatedDocument {
  const looksPdf = isPdf(input) || declaredType === "application/pdf";
  if (looksPdf) {
    // A PDF must actually be a PDF by magic bytes — a mismatched content-type hint can't smuggle
    // arbitrary bytes past the guard.
    if (!isPdf(input)) throw new Error("Only real PDF files are accepted.");
    if (input.length === 0 || input.length > MAX_DOCUMENT_BYTES) {
      throw new Error("PDF must be 10 MB or smaller.");
    }
    return {
      bytes: input,
      contentType: "application/pdf",
      sha256: createHash("sha256").update(input).digest("hex"),
    };
  }
  // Not a PDF → must be a real PNG/JPEG within the image caps (validateAndStripImage throws otherwise).
  const image = validateAndStripImage(input);
  return { bytes: image.bytes, contentType: image.contentType, sha256: image.sha256 };
}

/** Store a validated document as a PRIVATE blob under `<pathPrefix>/<tenantId>/…` and return its url
 *  plus the content sha256 (the ingestion dedup guard keys on the sha). Server-only — the url is never
 *  handed to the client; downloads go through an authed proxy route. */
export async function putPrivateDocument(
  pathPrefix: string,
  tenantId: string,
  safeName: string,
  bytes: Buffer,
  contentType: "application/pdf" | "image/png" | "image/jpeg",
): Promise<{ url: string; sha256: string }> {
  const ext = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";
  const blob = await put(
    `${pathPrefix}/${tenantId}/${Date.now()}-${safeName.replace(/\.[^.]+$/, "")}.${ext}`,
    bytes,
    { access: "private", addRandomSuffix: true, contentType },
  );
  return { url: blob.url, sha256: createHash("sha256").update(bytes).digest("hex") };
}
