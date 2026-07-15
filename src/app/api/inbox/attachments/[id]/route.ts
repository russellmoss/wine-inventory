import { getCurrentUser } from "@/lib/dal";
import { readDirectMessageAttachmentBlob } from "@/lib/inbox/attachments";
import { safeAttachmentName } from "@/lib/attachments/blob";

export const runtime = "nodejs";

// Plan 068 Unit 3 (council amendment 1) — authed download proxy. The blobUrl is NEVER handed to the
// client; this route re-checks session tenant + (via per-user RLS in readDirectMessageAttachmentBlob)
// that the requester is a participant of the parent thread, then streams the private blob.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) return Response.json({ error: "No active winery." }, { status: 403 });
  const { id } = await ctx.params;
  const result = await readDirectMessageAttachmentBlob(tenantId, user.id, id);
  if (!result) return Response.json({ error: "Not found." }, { status: 404 });
  const headers = new Headers(result.blob.headers as unknown as HeadersInit);
  headers.set("content-type", result.attachment.contentType);
  headers.set("content-disposition", `inline; filename="${safeAttachmentName(result.attachment.filename)}"`);
  headers.set("x-content-type-options", "nosniff");
  return new Response(result.blob.stream as unknown as BodyInit, { headers });
}
