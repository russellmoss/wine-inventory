import { getCurrentUser } from "@/lib/dal";
import {
  MAX_DOCUMENTS_PER_REQUEST,
  hasBlobCredentials,
  putPrivateDocument,
  safeAttachmentName,
  validateDocument,
} from "@/lib/attachments/blob";

export const runtime = "nodejs";

// Plan 072 Unit 3 (invoice/document ingestion) — accept a pile of PDFs/images and store each as a
// PRIVATE blob. Mirrors feedback/attachments/route.ts: same auth/tenant resolution, a blob-credentials
// guard that degrades to a clear 503 rather than a raw throw, and a JSON body on every path.

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) return Response.json({ error: "No active winery." }, { status: 403 });

  if (!hasBlobCredentials()) {
    return Response.json(
      { error: "OCR/upload storage is unavailable because Vercel Blob credentials are not configured." },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Bad upload body." }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "At least one file is required." }, { status: 400 });
  if (files.length > MAX_DOCUMENTS_PER_REQUEST) {
    return Response.json(
      { error: `At most ${MAX_DOCUMENTS_PER_REQUEST} files per request.` },
      { status: 400 },
    );
  }

  try {
    const stored = [];
    for (const file of files) {
      const doc = validateDocument(Buffer.from(await file.arrayBuffer()), file.type || null);
      const safeName = safeAttachmentName(file.name);
      const { url, sha256 } = await putPrivateDocument("ingest", tenantId, safeName, doc.bytes, doc.contentType);
      stored.push({
        blobUrl: url,
        mimeType: doc.contentType,
        fileName: safeName,
        fileSha256: sha256,
        byteSize: doc.bytes.length,
      });
    }
    return Response.json({ files: stored });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}
