import { runCommerce7PollSweep } from "@/lib/commerce/poll";
import { runCommerce7WebhookHealth } from "@/lib/commerce/webhook-health";
import { cronAuthorized, cronUnauthorized, cronError } from "@/lib/route-settle";

// Phase 16 Unit 5 — the Commerce7 inbound poll cron. Vercel Cron hits this with `Authorization: Bearer
// $CRON_SECRET`. Constant-time gate, ignores any caller-supplied tenant (enumerates internally). Drains
// dirty markers + re-emits withheld + sweeps the (updatedAt,id) cursor backstop. Bounded per tenant per
// run; exactly-once + atomic via the SERIALIZABLE ingest tx + the postingKey unique.
export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";


async function handle(req: Request) {
  if (!cronAuthorized(req)) return cronUnauthorized();
  try {
    const summary = await runCommerce7PollSweep();
    const webhooks = await runCommerce7WebhookHealth(); // self-heal a stale/disabled webhook (48h auto-disable)
    return Response.json({ ok: true, ...summary, webhooks });
  } catch (e) {
    return cronError(e, { route: "cron.commerce7-poll" }, "Commerce7 poll failed.");
  }
}

export const GET = handle;
export const POST = handle;
