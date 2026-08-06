import { runAccountingRefreshSweep } from "@/lib/accounting/refresh-sweep";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// Phase 15 Unit 5 — the token-refresh cron. Vercel Cron (vercel.json) hits this with
// `Authorization: Bearer $CRON_SECRET`. SEC-S7: gated with a constant-time compare, and it IGNORES any
// caller-supplied tenant — the sweep enumerates org ids internally as the least-privilege role. Both
// GET (Vercel cron's method) and POST are accepted; the sweep is idempotent so at-least-once delivery
// never harms. Runs across all tenants, so it needs a generous duration.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runAccountingRefreshSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.accounting-token-refresh" }, "Refresh sweep failed.");
  }
}

export const GET = handle;
export const POST = handle;
