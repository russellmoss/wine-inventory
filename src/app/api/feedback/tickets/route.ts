import { FeedbackTicketKind } from "@prisma/client";
import { getCurrentUser } from "@/lib/dal";
import { createFeedbackTicket } from "@/lib/feedback/tickets";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.banned || user.mustChangePassword) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) return Response.json({ error: "No active winery." }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }
  const rec = body as {
    kind?: unknown;
    title?: unknown;
    body?: unknown;
    pageUrl?: unknown;
    debugContext?: unknown;
  };
  const kind =
    rec.kind === FeedbackTicketKind.BUG_REPORT || rec.kind === FeedbackTicketKind.FEATURE_REQUEST
      ? rec.kind
      : null;
  if (!kind) return Response.json({ error: "Invalid ticket kind." }, { status: 400 });
  if (typeof rec.title !== "string" || typeof rec.body !== "string") {
    return Response.json({ error: "Title and details are required." }, { status: 400 });
  }

  try {
    const ticket = await createFeedbackTicket({
      tenantId,
      kind,
      title: rec.title,
      body: rec.body,
      pageUrl: typeof rec.pageUrl === "string" ? rec.pageUrl : null,
      userAgent: req.headers.get("user-agent"),
      debugContext: rec.debugContext && typeof rec.debugContext === "object" ? rec.debugContext : null,
      actorUserId: user.id,
      actorEmail: user.email,
    });
    return Response.json({ ok: true, id: ticket.id, modeAtSubmission: ticket.modeAtSubmission });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "Could not create ticket." }, { status: 400 });
  }
}
