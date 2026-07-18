import { timingSafeEqual } from "node:crypto";
import { runVendorSyncSweep } from "@/lib/vendors/vendor-qbo-sync";

// Plan 077 Unit 5 — the eager-push retry cron. Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
// Constant-time gate, ignores any caller-supplied tenant (enumerates internally). Re-pushes vendors stuck at
// syncStatus='pending' (QBO was offline at create) for opted-in, connected tenants. Idempotent (query-before-
// create). The eager create path is the primary; this is the low-frequency offline backstop.
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
    const summary = await runVendorSyncSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "QBO vendor sync failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
