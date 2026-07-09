import { FeedbackAttachmentCaptureSource } from "@prisma/client";
import { getCurrentUser } from "@/lib/dal";
import { storeFeedbackAttachment, validateAndStripImage } from "@/lib/feedback/attachments";

export const runtime = "nodejs";

function captureSource(value: FormDataEntryValue | null): FeedbackAttachmentCaptureSource {
  return value === FeedbackAttachmentCaptureSource.AUTO_SCREENSHOT
    ? FeedbackAttachmentCaptureSource.AUTO_SCREENSHOT
    : FeedbackAttachmentCaptureSource.MANUAL_UPLOAD;
}

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
  const ticketId = form.get("ticketId");
  const assistantFeedbackId = form.get("assistantFeedbackId");
  const parentTicketId = typeof ticketId === "string" && ticketId ? ticketId : null;
  const parentAssistantId =
    typeof assistantFeedbackId === "string" && assistantFeedbackId ? assistantFeedbackId : null;
  if ((parentTicketId ? 1 : 0) + (parentAssistantId ? 1 : 0) !== 1) {
    return Response.json({ error: "Exactly one parent id is required." }, { status: 400 });
  }

  try {
    const image = validateAndStripImage(Buffer.from(await file.arrayBuffer()));
    if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.VERCEL_OIDC_TOKEN) {
      return Response.json({
        ok: true,
        skipped: true,
        warning: "Attachment skipped because Vercel Blob credentials are not configured.",
      });
    }
    const attachment = await storeFeedbackAttachment({
      tenantId,
      ticketId: parentTicketId,
      assistantFeedbackId: parentAssistantId,
      filename: file.name,
      captureSource: captureSource(form.get("captureSource")),
      image,
    });
    return Response.json({ ok: true, attachment });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}
