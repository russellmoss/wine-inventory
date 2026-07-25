import { timingSafeEqual } from "node:crypto";
import { runNdviJobSweep } from "@/lib/spatial/job-sweep";

// VI-P2 Unit 6 — the NDVI job-sweep cron. Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
// Constant-time gate, ignores any caller-supplied tenant (enumerates internally). Claim-first + lease → no
// worker (ADR 0009); exactly-once + C1-idempotent materialization in processSceneJobCore. Bounded per tenant
// per run. maxDuration 300 (CDSE fetch took 135 s live; the job lease is > 300 s + slack so a long fetch is
// never double-claimed).
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
    const summary = await runNdviJobSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "NDVI sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
