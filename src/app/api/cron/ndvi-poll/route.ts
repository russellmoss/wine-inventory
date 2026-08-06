import { runNdviJobSweep } from "@/lib/spatial/job-sweep";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// VI-P2 Unit 6 — the NDVI job-sweep cron. Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
// Constant-time gate, ignores any caller-supplied tenant (enumerates internally). Claim-first + lease → no
// worker (ADR 0009); exactly-once + C1-idempotent materialization in processSceneJobCore. Bounded per tenant
// per run. maxDuration 300 (CDSE fetch took 135 s live; the job lease is > 300 s + slack so a long fetch is
// never double-claimed).
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runNdviJobSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.ndvi-poll" }, "NDVI sweep failed.");
  }
}

export const GET = handle;
export const POST = handle;
