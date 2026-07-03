import { timingSafeEqual } from "node:crypto";
import { runCommerce7PollSweep } from "@/lib/commerce/poll";

// Phase 16 Unit 5 — the Commerce7 inbound poll cron. Vercel Cron hits this with `Authorization: Bearer
// $CRON_SECRET`. Constant-time gate, ignores any caller-supplied tenant (enumerates internally). Drains
// dirty markers + re-emits withheld + sweeps the (updatedAt,id) cursor backstop. Bounded per tenant per
// run; exactly-once + atomic via the SERIALIZABLE ingest tx + the postingKey unique.
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
    const summary = await runCommerce7PollSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Commerce7 poll failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
