import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/dal";
import { accessDecision } from "@/lib/access";
import { runAsTenant } from "@/lib/tenant/context";
import { beginInstall } from "@/lib/commerce/connection";

// Phase 16 Unit 3 — start the Commerce7 install. Admin-gated (SEC-S6); mints a single-use install nonce
// bound to the admin + workspace and redirects to the Commerce7 app setup URL carrying it as `state`.
// Node runtime (ALS + crypto). NEVER logs the URL (it carries the nonce). No dead-end: any failure
// bounces back to Settings with a message.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?${q}`, req.url));

  const user = await getCurrentUser();
  if (accessDecision(user, { requireAdmin: true }) !== "ok" || !user?.activeOrganizationId) {
    return settings("c7_error=Only+an+admin+can+connect+Commerce7.");
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const sessionId = session?.session?.id ?? "";
  const tenantId = user.activeOrganizationId;

  try {
    const { setupUrl } = await runAsTenant(tenantId, () => beginInstall({ tenantId, userId: user.id, sessionId }));
    return NextResponse.redirect(setupUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't start the Commerce7 connection.";
    return settings(`c7_error=${encodeURIComponent(msg)}`);
  }
}
