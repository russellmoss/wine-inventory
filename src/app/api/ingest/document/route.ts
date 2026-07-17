import { getCurrentUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { getPrivateBlob } from "@/lib/attachments/blob";

export const runtime = "nodejs";

// Plan 072 Unit 8/10 — TENANT-SCOPED source-document proxy for the review screen. The ingested-document
// blobs are PRIVATE; the client never receives the raw blob URL. It asks for a document by its
// IngestedInvoice id, and this route verifies the caller's tenant OWNS that document (an RLS-scoped model
// read returns null for a foreign tenant) BEFORE streaming the bytes back inline. Never streams a blob
// without an ownership check.
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) return Response.json({ error: "No active winery." }, { status: 403 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required." }, { status: 400 });

  // Ownership check: the tenant extension scopes this read to the caller's winery, so a document belonging
  // to another tenant simply resolves to null here — we never reach getPrivateBlob for it.
  const inv = await prisma.ingestedInvoice.findUnique({
    where: { id },
    select: { blobUrl: true, mimeType: true, fileName: true },
  });
  if (!inv) return Response.json({ error: "Document not found." }, { status: 404 });

  try {
    const blob = await getPrivateBlob(inv.blobUrl);
    if (!blob) return Response.json({ error: "Source file is no longer available." }, { status: 404 });
    return new Response(blob.stream as unknown as ReadableStream, {
      headers: {
        "Content-Type": inv.mimeType || "application/octet-stream",
        // Inline so a PDF/image renders in an <iframe>/<img>; the sanitized filename for a manual download.
        "Content-Disposition": `inline; filename="${inv.fileName.replace(/["\\]/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return Response.json({ error: "Couldn't load the source file." }, { status: 502 });
  }
}
