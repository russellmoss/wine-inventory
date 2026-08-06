import { runWeatherSweep } from "@/lib/weather/sweep";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// VI-P8 Unit 6 — the daily weather sweep cron. Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
// Constant-time gate; ignores any caller-supplied tenant (enumerates internally). No worker (ADR 0009) — a
// JSON point-fetch per auto-refresh vineyard; ingest is idempotent upsert so a re-run is safe.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runWeatherSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return cronError(e, { route: "cron.weather-poll" }, "Weather sweep failed.");
  }
}

export const GET = handle;
export const POST = handle;
