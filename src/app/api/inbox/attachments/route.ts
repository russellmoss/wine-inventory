import { getCurrentUser } from "@/lib/dal";
import { storeDirectMessageAttachment } from "@/lib/inbox/attachments";
import { validateAndStripImage, hasBlobCredentials } from "@/lib/attachments/blob";

export const runtime = "nodejs";

// Plan 068 Unit 3 — upload a DM attachment (keyed by an existing messageId; only the sender may
// attach). Mirrors /api/feedback/attachments. Gracefully skips when Blob creds are absent.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) return Response.json({ error: "No active winery." }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Bad upload body." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "file is required." }, { status: 400 });
  const messageId = form.get("messageId");
  if (typeof messageId !== "string" || !messageId) {
    return Response.json({ error: "messageId is required." }, { status: 400 });
  }

  try {
    const image = validateAndStripImage(Buffer.from(await file.arrayBuffer()));
    if (!hasBlobCredentials()) {
      return Response.json({
        ok: true,
        skipped: true,
        warning: "Attachment skipped because Vercel Blob credentials are not configured.",
      });
    }
    const attachment = await storeDirectMessageAttachment({
      tenantId,
      userId: user.id,
      messageId,
      filename: file.name,
      image,
    });
    return Response.json({ ok: true, attachment });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}
