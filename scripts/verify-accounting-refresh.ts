/**
 * Phase 15 Unit 5 — drive the token-refresh sweep against the current DB.
 *
 *   npm run verify:accounting-refresh
 *
 * Meaningful once a SANDBOX company is connected (Settings → QuickBooks) AND the enumerator credential
 * is set (scripts/setup-accounting-enumerator-credential.ts). It enumerates orgs as the least-privilege
 * role, then per-tenant (under app_rls, SET LOCAL) rotates any refresh token nearing expiry. Prints the
 * summary; exits non-zero only on an unexpected error. With nothing connected it reports 0 connected.
 */
import { runAccountingRefreshSweep } from "@/lib/accounting/refresh-sweep";

async function main() {
  if (!process.env.DATABASE_URL_ENUMERATOR) {
    console.log("• DATABASE_URL_ENUMERATOR is not set — run scripts/setup-accounting-enumerator-credential.ts first.");
    console.log("  (Skipping: the refresh sweep needs the least-privilege enumerator role to list orgs.)");
    process.exit(0);
  }
  const summary = await runAccountingRefreshSweep();
  console.log("Refresh sweep:", JSON.stringify(summary, null, 2));
  if (summary.errors > 0) {
    console.error(`✗ ${summary.errors} connection(s) hit an unexpected error.`);
    process.exit(1);
  }
  console.log(
    `✓ swept ${summary.orgs} org(s): ${summary.connected} connected, ${summary.rotated} rotated, ${summary.needsReauth} need reauth.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
