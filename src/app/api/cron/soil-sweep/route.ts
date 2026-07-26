import { timingSafeEqual } from "node:crypto";
import { runSoilSweep } from "@/lib/soil/sweep";

// VI-P4 — the soil backfill sweep cron. Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
// Keeps every US block's soil snapshot populated (idempotent pullBlockSoil: cached blocks no-op, non-US
// skip, missing/stale pull). Bounded SDA pulls per tenant per run so the no-SLA government API can't blow
// the duration budget; soil is static so a daily cadence trivially converges.
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
    const summary = await runSoilSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Soil sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
