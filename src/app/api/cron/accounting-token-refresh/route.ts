import { timingSafeEqual } from "node:crypto";
import { runAccountingRefreshSweep } from "@/lib/accounting/refresh-sweep";

// Phase 15 Unit 5 — the token-refresh cron. Vercel Cron (vercel.json) hits this with
// `Authorization: Bearer $CRON_SECRET`. SEC-S7: gated with a constant-time compare, and it IGNORES any
// caller-supplied tenant — the sweep enumerates org ids internally as the least-privilege role. Both
// GET (Vercel cron's method) and POST are accepted; the sweep is idempotent so at-least-once delivery
// never harms. Runs across all tenants, so it needs a generous duration.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if unconfigured
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    const summary = await runAccountingRefreshSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Refresh sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
