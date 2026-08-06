import { runQboVendorPullSweep } from "@/lib/vendors/qbo-vendor-pull";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// Plan 075 Unit 7 — the QBO vendor-import poll cron. Vercel Cron hits this with `Authorization: Bearer
// $CRON_SECRET`. Constant-time gate, ignores any caller-supplied tenant (enumerates internally). Pulls each
// connected tenant's QBO vendors into the review queue (idempotent; rejected tombstones suppress). The manual
// "Pull vendors from QBO" button is the primary path — this is a low-frequency backstop for bookkeeper adds.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runQboVendorPullSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.qbo-vendor-poll" }, "QBO vendor poll failed.");
  }
}

export const GET = handle;
export const POST = handle;
