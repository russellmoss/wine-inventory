import { timingSafeEqual } from "node:crypto";
import { runReminderSweep } from "@/lib/compliance/reminder-sweep";

// plan-027 Unit 5 — the daily reminder cron. Vercel Cron (see vercel.json) hits this once a day and
// sends `Authorization: Bearer $CRON_SECRET`. Gated with a constant-time compare (council S6); the
// sweep is idempotent so Vercel's at-least-once delivery never double-sends. Runs across all tenants
// under the system role, so it needs a generous duration.
export const runtime = "nodejs";
export const maxDuration = 300; // council C3 — a full-tenant sweep must not hit the default function timeout
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if unconfigured
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const summary = await runReminderSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Sweep failed." }, { status: 500 });
  }
}
