import { getCurrentUser } from "@/lib/dal";
import { readFeedbackAttachmentBlob } from "@/lib/feedback/attachments";
import { safeFilename } from "@/lib/feedback/sanitize";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) return Response.json({ error: "No active winery." }, { status: 403 });
  const { id } = await ctx.params;
  const result = await readFeedbackAttachmentBlob(tenantId, id);
  if (!result) return Response.json({ error: "Not found." }, { status: 404 });
  const headers = new Headers(result.blob.headers as unknown as HeadersInit);
  headers.set("content-type", result.attachment.contentType);
  headers.set("content-disposition", `inline; filename="${safeFilename(result.attachment.filename)}"`);
  headers.set("x-content-type-options", "nosniff");
  return new Response(result.blob.stream as unknown as BodyInit, { headers });
}
