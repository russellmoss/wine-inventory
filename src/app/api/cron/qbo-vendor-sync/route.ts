import { runVendorSyncSweep } from "@/lib/vendors/vendor-qbo-sync";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// Plan 077 Unit 5 — the eager-push retry cron. Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
// Constant-time gate, ignores any caller-supplied tenant (enumerates internally). Re-pushes vendors stuck at
// syncStatus='pending' (QBO was offline at create) for opted-in, connected tenants. Idempotent (query-before-
// create). The eager create path is the primary; this is the low-frequency offline backstop.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runVendorSyncSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.qbo-vendor-sync" }, "QBO vendor sync failed.");
  }
}

export const GET = handle;
export const POST = handle;
