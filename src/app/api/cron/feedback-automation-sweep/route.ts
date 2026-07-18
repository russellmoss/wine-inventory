import { timingSafeEqual } from "node:crypto";
import { runFeedbackAutomationSweep } from "@/lib/feedback/automation-sweep";

// Plan 079 Unit 13 — the clarification-loop watchdog. Vercel Cron hits this with
// `Authorization: Bearer $CRON_SECRET`. Reconciles lost repository_dispatch runs (stuck
// QUEUED/RUNNING) and expires unanswered clarifications past their TTL. Idempotent + cross-tenant.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const summary = await runFeedbackAutomationSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Feedback sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
