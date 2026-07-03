import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { accessDecision } from "@/lib/access";
import { runAsTenant } from "@/lib/tenant/context";
import { consumeInstallNonce, stageInstall } from "@/lib/commerce/connection";

// Phase 16 Unit 3 — the Commerce7 install callback (same authenticated browser as Connect). Consumes
// the single-use nonce (SEC), re-checks admin, strict-validates the C7 tenant slug, and STAGES a
// PENDING_CONFIRM connection. The callback's `tenantId` (C7 slug) is stored ONLY as the external tenant
// — OUR tenant comes from the verified session + the nonce, never the callback param (tenant-hijack
// fix). Then the admin explicitly confirms. No dead-end: any failure lands on Settings with a message.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const url = new URL(req.url);
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?${q}#commerce7`, req.url));

  const state = url.searchParams.get("state");
  // Commerce7 names the installing winery in `tenantId` (some flows use `tenant`). Treated as the C7
  // slug to store, NEVER as our tenant.
  const externalTenantId = url.searchParams.get("tenantId") || url.searchParams.get("tenant") || "";
  if (!state) return settings("c7_error=Missing+install+response.");
  if (!externalTenantId) return settings("c7_error=Commerce7+did+not+identify+the+winery.");

  const user = await getCurrentUser();
  if (accessDecision(user, { requireAdmin: true }) !== "ok" || !user?.activeOrganizationId) {
    return settings("c7_error=Only+an+admin+can+finish+connecting+Commerce7.");
  }
  const tenantId = user.activeOrganizationId;

  try {
    await runAsTenant(tenantId, async () => {
      await consumeInstallNonce({ tenantId, rawState: state, userId: user.id });
      await stageInstall({ tenantId, externalTenantId, userId: user.id });
    });
    return settings("c7_installed=1");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't finish connecting Commerce7.";
    return settings(`c7_error=${encodeURIComponent(msg)}`);
  }
}

export const GET = handle;
export const POST = handle;
