import { runReminderSweep } from "@/lib/compliance/reminder-sweep";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// plan-027 Unit 5 — the daily reminder cron. Vercel Cron (see vercel.json) hits this once a day and
// sends `Authorization: Bearer $CRON_SECRET`. Gated with a constant-time compare (council S6); the
// sweep is idempotent so Vercel's at-least-once delivery never double-sends. Runs across all tenants
// under the system role, so it needs a generous duration.
export const runtime = "nodejs";
export const maxDuration = 300; // council C3 — a full-tenant sweep must not hit the default function timeout
export const dynamic = "force-dynamic";


export async function GET(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runReminderSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.compliance-reminders" }, "Sweep failed.");
  }
}
