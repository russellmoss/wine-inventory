import { runAccountingPostSweep } from "@/lib/accounting/post-sweep";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// Phase 15 Unit 8 — the outbound posting cron. Vercel Cron hits this with `Authorization: Bearer
// $CRON_SECRET`. SEC-S7: constant-time gate, IGNORES any caller-supplied tenant (enumerates internally
// as the least-privilege role). Bounded per tenant per run (drain-over-ticks), idempotent + crash-safe
// via the delivery state machine + query-before-post, so at-least-once delivery never double-posts.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runAccountingPostSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.accounting-post" }, "Post sweep failed.");
  }
}

export const GET = handle;
export const POST = handle;
