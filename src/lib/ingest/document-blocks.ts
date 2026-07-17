// Plan 072 Unit 4: turn a stored document blob into an Anthropic content block for extraction. Split like
// scripts/feedback-attachment-images.ts so the decision logic is unit-testable with no IO:
//  - buildDocBlock(...)  PURE. Given already-fetched bytes, builds a `document` (PDF) or `image` (PNG/JPEG)
//                        block, or null if unsupported / over the per-doc size cap.
//  - loadDocBlock(...)   THIN IO. Fetches the private Blob bytes via the SAME @vercel/blob get() the app
//                        uses (dynamic import, so the pure path pulls in no runtime deps), then builds.
//
// Native Anthropic `document` blocks handle BOTH text and scanned/image-only PDFs directly (Key Decision:
// avoids a PDF→raster dependency on Windows). Documents are UNTRUSTED supplier data — the extractor's system
// prompt frames them as such and nothing writes without the human review screen.

export type SupportedImageType = "image/png" | "image/jpeg";

export type DocumentBlock =
  | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
  | { type: "image"; source: { type: "base64"; media_type: SupportedImageType; data: string } };

// One document per model call, so caps are per-doc. base64 inflates ~4/3; Anthropic accepts far larger, but
// bounding raw bytes keeps token cost + latency sane and matches the upload cap (Unit 3).
export const DOC_BLOCK_LIMITS = {
  maxPdfBytes: 10 * 1024 * 1024,
  maxImageBytes: 5 * 1024 * 1024,
} as const;

function imageMediaType(contentType: string): SupportedImageType | null {
  const c = contentType.toLowerCase();
  if (c === "image/png") return "image/png";
  if (c === "image/jpeg" || c === "image/jpg") return "image/jpeg";
  return null;
}

/**
 * PURE. Build the content block for a single document, or null when it can't be sent (unsupported type or
 * over the per-doc cap). Never throws — the caller turns null into a per-doc "couldn't read" error state.
 */
export function buildDocBlock(
  input: { contentType: string; bytes: Buffer },
  opts: { maxPdfBytes?: number; maxImageBytes?: number } = {},
): DocumentBlock | null {
  const maxPdf = opts.maxPdfBytes ?? DOC_BLOCK_LIMITS.maxPdfBytes;
  const maxImage = opts.maxImageBytes ?? DOC_BLOCK_LIMITS.maxImageBytes;
  const c = input.contentType.toLowerCase();

  if (c === "application/pdf") {
    if (input.bytes.length === 0 || input.bytes.length > maxPdf) return null;
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: input.bytes.toString("base64") } };
  }
  const media = imageMediaType(c);
  if (media) {
    if (input.bytes.length === 0 || input.bytes.length > maxImage) return null;
    return { type: "image", source: { type: "base64", media_type: media, data: input.bytes.toString("base64") } };
  }
  return null;
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

/**
 * THIN IO. Fetch a private document blob and build its content block. Returns null when the Blob token is
 * absent, the fetch fails, or the type/size is unsupported (the caller degrades to a per-doc error state).
 */
export async function loadDocBlock(blobUrl: string, contentType: string): Promise<DocumentBlock | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) return null;
  try {
    const { get } = await import("@vercel/blob");
    const blob = await get(blobUrl, { access: "private" });
    if (!blob) return null;
    const bytes = await streamToBuffer(blob.stream as unknown as ReadableStream<Uint8Array>);
    return buildDocBlock({ contentType, bytes });
  } catch {
    return null;
  }
}
