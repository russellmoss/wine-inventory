import { runSoilSweep } from "@/lib/soil/sweep";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// VI-P4 — the soil backfill sweep cron. Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
// Keeps every US block's soil snapshot populated (idempotent pullBlockSoil: cached blocks no-op, non-US
// skip, missing/stale pull). Bounded SDA pulls per tenant per run so the no-SLA government API can't blow
// the duration budget; soil is static so a daily cadence trivially converges.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runSoilSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.soil-sweep" }, "Soil sweep failed.");
  }
}

export const GET = handle;
export const POST = handle;
