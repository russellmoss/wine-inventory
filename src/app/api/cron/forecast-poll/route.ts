import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { runForecastSweep } from "@/lib/weather/forecast-sweep";

// Plan 096 Phase 2 Unit 15 — the forecast cron (DAILY on Vercel: a sub-daily schedule fails
// deployment on the Hobby cron allowance — the #516/#517 deploy breaker; intra-day freshness comes
// from the strip's on-view refresh at issuedAt > 6 h. Restore `10 */6 * * *` on a Pro plan).
// Vercel Cron hits this with
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
    // U24: per-vineyard errors are SWALLOWED into the summary by design (one bad vineyard never
    // blocks the sweep) — surface them here so they reach the logs + Sentry, not just this body.
    if (summary.errors.length > 0) {
      console.error(JSON.stringify({ evt: "weather.forecast.sweep.errors", count: summary.errors.length, sample: summary.errors.slice(0, 3) }));
      Sentry.captureMessage(`forecast sweep: ${summary.errors.length} vineyard(s) failed`, { level: "warning", extra: { sample: summary.errors.slice(0, 5) } });
    }
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    Sentry.captureException(e); // belt — onRequestError auto-captures thrown route errors, but be explicit at the cron edge
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Forecast sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
