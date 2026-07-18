import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { getValidAccessToken } from "@/lib/accounting/token";
import { QboAdapter } from "@/lib/accounting/qbo/client";
import type { ProviderCallContext } from "@/lib/accounting/adapter";
import { stripVendorCurrencySuffix } from "@/lib/vendors/vendors-shared";

// Plan 075 Unit 1 SPIKE (read-only) — prove the paginated QBO vendor pull works against the Demo sandbox and
// size the real data: total vendors, how many carry a Plan-073 " (CUR)" currency suffix, and how many DISTINCT
// suppliers remain once the suffix is stripped (the collapse the pull will do). Also reports the QBO edition/
// home currency hint (tier). NO writes. Demo Winery only.
//
//   npx tsx --conditions=react-server --env-file=.env scripts/verify-qbo-vendor-pull-spike.ts

const TENANT = "org_demo_winery";

async function main() {
  await runAsTenant(TENANT, async () => {
    const conn = await prisma.accountingConnection.findFirst({
      where: { provider: "QBO", status: "CONNECTED" },
      select: { id: true, externalRealmId: true, environment: true, homeCurrency: true, multiCurrencyEnabled: true },
    });
    if (!conn || !conn.externalRealmId) {
      console.log("✗ No CONNECTED QBO connection for Demo — connect one first, then re-run.");
      process.exitCode = 1;
      return;
    }
    const accessToken = await getValidAccessToken(conn.id);
    const ctx: ProviderCallContext = {
      accessToken,
      realmId: conn.externalRealmId,
      environment: conn.environment as ProviderCallContext["environment"],
      homeCurrency: conn.homeCurrency ?? "USD",
      multiCurrencyEnabled: conn.multiCurrencyEnabled,
    };
    const adapter = new QboAdapter();

    const info = await adapter.getCompanyInfo(ctx).catch(() => null);
    console.log("QBO company:", info ? `${info.companyName} · home ${info.homeCurrency} · multiCurrency ${info.multiCurrencyEnabled}` : "(getCompanyInfo unavailable)");

    const vendors = await adapter.listVendors(ctx);
    const active = vendors.filter((v) => v.active).length;
    const suffixed = vendors.filter((v) => stripVendorCurrencySuffix(v.name).had);
    const distinctBases = new Set(vendors.map((v) => stripVendorCurrencySuffix(v.name).base.toLowerCase()));

    console.log(`✓ Pulled ${vendors.length} vendors (${active} active, ${vendors.length - active} inactive).`);
    console.log(`✓ ${suffixed.length} carry a currency suffix → after collapse: ${distinctBases.size} distinct suppliers.`);
    if (suffixed.length) console.log("  currency-suffixed sample:", suffixed.slice(0, 5).map((v) => v.name).join(", "));
    console.log("  first 10 names:", vendors.slice(0, 10).map((v) => v.name).join(", "));

    // Pagination sanity: if we somehow got exactly a multiple of 1000, warn (a boundary worth eyeballing).
    if (vendors.length > 0 && vendors.length % 1000 === 0) console.log(`  NOTE: count is a multiple of 1000 (${vendors.length}) — verify the last page wasn't truncated.`);
  });
}

main()
  .then(async () => { await prisma.$disconnect(); console.log("\nSPIKE OK"); process.exit(process.exitCode ?? 0); })
  .catch(async (e) => { console.error("ERR", e?.message || e); await prisma.$disconnect(); process.exit(1); });
