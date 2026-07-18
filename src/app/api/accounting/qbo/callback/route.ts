import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/dal";
import { accessDecision } from "@/lib/access";
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { loadQboConfig } from "@/lib/accounting/qbo/config";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import { consumeState, storeConnection } from "@/lib/accounting/connection";
import { coerceCurrency } from "@/lib/money/currency";
import { baseHomeCurrencyMismatch, baseHomeMismatchMessage } from "@/lib/accounting/currency-guard";

// Phase 15 Unit 4 — the OAuth callback. Consumes the single-use state (SEC-C1), re-checks admin at
// consume time (SEC-C1), exchanges the code with the stored PKCE verifier + allowlisted redirect_uri,
// derives the CANONICAL realmId by confirming the token against a trusted Intuit endpoint (SEC-C2,
// NOT trusting the callback param blindly), and stores the encrypted refresh token. Any failure lands
// back on Settings with a message — never a dead-end. Node runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const p = url.searchParams;
  const settings = (q: string) => NextResponse.redirect(new URL(`/settings?${q}`, req.url));

  const providerError = p.get("error");
  if (providerError) return settings(`qbo_error=${encodeURIComponent(providerError)}`);

  const code = p.get("code");
  const state = p.get("state");
  const realmIdHint = p.get("realmId");
  if (!code || !state) return settings("qbo_error=Missing+authorization+response.");
  if (!realmIdHint) return settings("qbo_error=QuickBooks+did+not+return+a+company.");

  // SEC-C1: admin re-check at consume time — the person completing the flow must still be a tenant admin.
  const user = await getCurrentUser();
  if (accessDecision(user, { requireAdmin: true }) !== "ok" || !user?.activeOrganizationId) {
    return settings("qbo_error=Only+an+admin+can+finish+connecting+QuickBooks.");
  }
  const tenantId = user.activeOrganizationId;

  try {
    const cfg = loadQboConfig();
    const consumed = await runAsTenant(tenantId, () => consumeState({ tenantId, rawState: state, userId: user.id }));

    const adapter = new QboAdapter({ config: cfg });
    const tokens = await adapter.exchangeCode({
      code,
      redirectUri: consumed.redirectUri,
      codeVerifier: consumed.pkceVerifier,
      realmIdHint,
    });

    // SEC-C2: the callback realmId is only a HINT. A 200 from companyinfo with THIS token proves the
    // token is bound to THIS realm — a tampered realmId the user doesn't own fails auth here and we
    // never store it. That confirmation IS the canonical derivation.
    const ctx = { accessToken: tokens.accessToken, realmId: realmIdHint, environment: cfg.environment };
    const company = await adapter.getCompanyInfo(ctx);

    // Plan 073 hardening: refuse to connect a QuickBooks company whose HOME currency ≠ the tenant's BASE
    // currency. The A/P path pins ExchangeRate as base-per-foreign and posts foreign bills against the QBO
    // home; that only holds when base == home. Rejecting here (before we store) prevents a mis-currency ledger.
    const base = await runAsTenant(tenantId, async () => {
      const s = await prisma.appSettings.findFirst({ select: { currency: true } });
      return coerceCurrency(s?.currency);
    });
    if (baseHomeCurrencyMismatch(base, company.homeCurrency)) {
      return settings(`qbo_error=${encodeURIComponent(baseHomeMismatchMessage(base, company.homeCurrency))}`);
    }

    await runAsTenant(tenantId, () =>
      storeConnection({
        tenantId,
        environment: cfg.environment,
        tokens,
        realmId: realmIdHint,
        companyName: company.companyName,
        homeCurrency: company.homeCurrency,
        multiCurrencyEnabled: company.multiCurrencyEnabled, // Plan 073: read at connect (council #2)
      }),
    );
    // No dead-end (ux-principle #2): land on the mapping step.
    return settings("qbo_connected=1#accounting-mapping");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Couldn't finish connecting QuickBooks.";
    return settings(`qbo_error=${encodeURIComponent(msg)}`);
  }
}
