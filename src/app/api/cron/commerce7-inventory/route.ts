import { timingSafeEqual } from "node:crypto";
import { runCommerce7InventorySync } from "@/lib/commerce/inventory-sync";
import { runCommerce7DriftCheck } from "@/lib/commerce/inventory-drift";

// Phase 16 Unit 6 — the outbound inventory cron. Pushes ERP finished-goods INCREASES to Commerce7
// (additive, watermark-idempotent), then runs the read-only drift check (writes a summary the dashboard
// surfaces; never corrects C7 inventory). Constant-time CRON_SECRET gate; enumerates internally.
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
    const push = await runCommerce7InventorySync();
    const drift = await runCommerce7DriftCheck();
    return Response.json({ ok: true, push, drift });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Commerce7 inventory sync failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
