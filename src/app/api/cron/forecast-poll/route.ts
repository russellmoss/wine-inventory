import { timingSafeEqual } from "node:crypto";
import { runForecastSweep } from "@/lib/weather/forecast-sweep";

// Plan 096 Phase 2 Unit 15 — the 6-hourly forecast cron. Vercel Cron hits this with
// `Authorization: Bearer $CRON_SECRET` (same constant-time gate as weather-poll). Ingest is a
// per-provider delete-then-insert replace, so a re-run is safe.
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
    const summary = await runForecastSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Forecast sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
