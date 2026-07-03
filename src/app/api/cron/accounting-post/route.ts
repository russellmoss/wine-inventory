import { timingSafeEqual } from "node:crypto";
import { runAccountingPostSweep } from "@/lib/accounting/post-sweep";

// Phase 15 Unit 8 — the outbound posting cron. Vercel Cron hits this with `Authorization: Bearer
// $CRON_SECRET`. SEC-S7: constant-time gate, IGNORES any caller-supplied tenant (enumerates internally
// as the least-privilege role). Bounded per tenant per run (drain-over-ticks), idempotent + crash-safe
// via the delivery state machine + query-before-post, so at-least-once delivery never double-posts.
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
    const summary = await runAccountingPostSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Post sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
