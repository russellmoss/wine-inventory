import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCurrentUser } from "@/lib/dal";
import { accessDecision } from "@/lib/access";
import { runAsTenant } from "@/lib/tenant/context";
import { beginConnect } from "@/lib/accounting/connection";

// Phase 15 Unit 4 — start the QBO OAuth connect. Admin-gated (SEC-S6); mints PKCE + a single-use
// server-stored state (SEC-C1) and redirects to Intuit. Node runtime (ALS + crypto). NEVER logs the
// URL (it carries the state nonce). No dead-end: any failure bounces back to Settings with a message.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?${q}`, req.url));

  const user = await getCurrentUser();
  if (accessDecision(user, { requireAdmin: true }) !== "ok" || !user?.activeOrganizationId) {
    return settings("qbo_error=Only+an+admin+can+connect+QuickBooks.");
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const sessionId = session?.session?.id ?? "";
  const tenantId = user.activeOrganizationId;

  try {
    const { authorizeUrl } = await runAsTenant(tenantId, () =>
      beginConnect({ tenantId, userId: user.id, sessionId }),
    );
    return NextResponse.redirect(authorizeUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't start the QuickBooks connection.";
    return settings(`qbo_error=${encodeURIComponent(msg)}`);
  }
}
