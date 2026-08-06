import { runFeedbackAutomationSweep } from "@/lib/feedback/automation-sweep";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// Plan 079 Unit 13 — the clarification-loop watchdog. Vercel Cron hits this with
// `Authorization: Bearer $CRON_SECRET`. Reconciles lost repository_dispatch runs (stuck
// QUEUED/RUNNING) and expires unanswered clarifications past their TTL. Idempotent + cross-tenant.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runFeedbackAutomationSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.feedback-automation-sweep" }, "Feedback sweep failed.");
  }
}

export const GET = handle;
export const POST = handle;
