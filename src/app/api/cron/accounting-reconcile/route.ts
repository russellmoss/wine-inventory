import { timingSafeEqual } from "node:crypto";
import { runAccountingReconcileSweep } from "@/lib/accounting/reconcile";

// Phase 15 Unit 9 — reconcile read-back cron. Same CRON_SECRET gate + tenant-ignoring enumeration as
// the poster (SEC-S7). Heavy reads, so it runs less often than the poster. Idempotent.
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
    const summary = await runAccountingReconcileSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Reconcile sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
