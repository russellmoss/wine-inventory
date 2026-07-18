import { timingSafeEqual } from "node:crypto";
import { runQboVendorPullSweep } from "@/lib/vendors/qbo-vendor-pull";

// Plan 075 Unit 7 — the QBO vendor-import poll cron. Vercel Cron hits this with `Authorization: Bearer
// $CRON_SECRET`. Constant-time gate, ignores any caller-supplied tenant (enumerates internally). Pulls each
// connected tenant's QBO vendors into the review queue (idempotent; rejected tombstones suppress). The manual
// "Pull vendors from QBO" button is the primary path — this is a low-frequency backstop for bookkeeper adds.
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
    const summary = await runQboVendorPullSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "QBO vendor poll failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
