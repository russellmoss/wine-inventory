import { runAccountingReconcileSweep } from "@/lib/accounting/reconcile";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// Phase 15 Unit 9 — reconcile read-back cron. Same CRON_SECRET gate + tenant-ignoring enumeration as
// the poster (SEC-S7). Heavy reads, so it runs less often than the poster. Idempotent.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runAccountingReconcileSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.accounting-reconcile" }, "Reconcile sweep failed.");
  }
}

export const GET = handle;
export const POST = handle;
