import { timingSafeEqual } from "node:crypto";
import { runWeatherSweep } from "@/lib/weather/sweep";

// VI-P8 Unit 6 — the daily weather sweep cron. Vercel Cron hits this with `Authorization: Bearer $CRON_SECRET`.
// Constant-time gate; ignores any caller-supplied tenant (enumerates internally). No worker (ADR 0009) — a
// JSON point-fetch per auto-refresh vineyard; ingest is idempotent upsert so a re-run is safe.
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
    const summary = await runWeatherSweep();
    return Response.json({ ok: true, ...summary });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Weather sweep failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
