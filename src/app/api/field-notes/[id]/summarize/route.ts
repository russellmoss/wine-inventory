import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, canManagerAccessVineyard } from "@/lib/dal";
import { generateBriefing } from "@/lib/fieldnotes/ai";

// Claude over ~4 weeks of data can take 10-15s, so we ack immediately and run
// generation in after(). Council C1: after() is best-effort, NOT a durable queue
// — the durable recovery path is aiSummaryStatus + the admin Regenerate button.
// The manager's fire-and-forget client call uses fetch(..., { keepalive: true }).
export const runtime = "nodejs";
export const maxDuration = 60; // Vercel Pro ceiling; Hobby caps at 10s (deploy note)

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user || user.banned) {
    return Response.json({ error: "Not signed in." }, { status: 401 });
  }

  const note = await prisma.fieldNote.findUnique({
    where: { id },
    select: { id: true, vineyardId: true },
  });
  if (!note) return Response.json({ error: "Field note not found." }, { status: 404 });
  if (!canManagerAccessVineyard(user, note.vineyardId)) {
    return Response.json({ error: "Forbidden for this vineyard." }, { status: 403 });
  }

  // Mark in-flight, then generate after the response is sent. Idempotent: safe to
  // re-call (powers the admin Regenerate button).
  await prisma.fieldNote.update({
    where: { id },
    data: { aiSummaryStatus: "PENDING" },
  });

  after(async () => {
    try {
      const summary = await generateBriefing(id);
      await prisma.fieldNote.update({
        where: { id },
        data: { aiSummary: summary, aiSummaryStatus: "READY", aiSummaryAt: new Date() },
      });
    } catch {
      await prisma.fieldNote
        .update({ where: { id }, data: { aiSummaryStatus: "FAILED" } })
        .catch(() => {}); // never throw out of after()
    }
  });

  return Response.json({ status: "accepted" }, { status: 202 });
}
