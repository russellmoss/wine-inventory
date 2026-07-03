import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { verifyWebhookPath } from "@/lib/commerce/commerce7";

// Phase 16 Unit 5 — the Commerce7 order webhook. It is a HINT ONLY: authenticate, mark the order dirty,
// return 200 fast. The poll cron is the single ingest path. Authenticity despite no HMAC on C7 payloads:
// the URL carries OUR tenant id + an HMAC of it (keyed on the inbound webhook secret) — constant-time
// verified here, so it both ROUTES (no cross-tenant read; the app is a NOBYPASSRLS role) and gates
// (unforgeable without the secret). Plus: the payload tenant (slug) must match the CONNECTED record. The
// dirty marker is upserted by (tenantId, orderId) so a flood dedups to one row per id (DoS bound). Never
// logs the raw payload (D19). Node runtime (ALS + crypto).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIRTY_CAP = Number(process.env.COMMERCE7_DIRTY_CAP) || 10000; // shed load past this backlog

export async function POST(req: Request, { params }: { params: Promise<{ tenantId: string; sig: string }> }) {
  const { tenantId, sig } = await params;
  if (!verifyWebhookPath(tenantId, sig)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  let body: { object?: string; action?: string; tenantId?: string; payload?: { id?: string } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad payload." }, { status: 400 });
  }
  const externalSlug = body.tenantId;
  const orderId = body.payload?.id;
  if (!orderId) return Response.json({ ok: true, note: "no order id — ignored" });

  try {
    await runAsTenant(tenantId, async () => {
      const conn = await prisma.commerce7Connection.findFirst({
        where: { provider: "COMMERCE7", status: "CONNECTED" },
        select: { externalTenantId: true },
      });
      // Reject a payload whose tenant doesn't match the connected record (tenant-mismatch guard).
      if (!conn || (externalSlug && conn.externalTenantId && externalSlug.toLowerCase() !== conn.externalTenantId.toLowerCase())) {
        throw new Error("tenant mismatch");
      }
      await runInTenantTx(async (tx) => {
        const backlog = await tx.commerce7Order.count({ where: { dirty: true } });
        if (backlog >= DIRTY_CAP) return; // flood guard — the cursor sweep still catches these
        await tx.commerce7Order.upsert({
          where: { tenantId_commerce7OrderId: { tenantId, commerce7OrderId: orderId } },
          create: { commerce7OrderId: orderId, dirty: true },
          update: { dirty: true },
        });
        await tx.commerce7Connection.updateMany({ where: { provider: "COMMERCE7", status: "CONNECTED" }, data: { lastWebhookAt: new Date() } });
      });
    });
  } catch {
    // Auth already passed; a tenant-mismatch or transient error just means "not ours / try later" — 200
    // so Commerce7 doesn't disable the webhook, and the cursor sweep remains the backstop.
    return Response.json({ ok: true, note: "acknowledged" });
  }
  return Response.json({ ok: true });
}
