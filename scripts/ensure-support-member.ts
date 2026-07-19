// Plan 079, Unit 4: ensure the "Cellarhand Support" member exists in each tenant so the
// clarification loop can send DMs as it. Idempotent — safe to re-run and to call at tenant
// creation. Backfills Demo + Bhutan by default; pass tenant ids to target specific ones.
//   npx tsx --env-file=.env --conditions=react-server scripts/ensure-support-member.ts [tenantId...]
import { ensureSupportSenderForTenant } from "@/lib/feedback/support-sender";

const DEFAULT_TENANTS = ["org_demo_winery", "org_bhutan_wine_co"];

async function main() {
  const args = process.argv.slice(2).filter(Boolean);
  const tenants = args.length ? args : DEFAULT_TENANTS;
  for (const tenantId of tenants) {
    const sender = await ensureSupportSenderForTenant(tenantId);
    console.log(`ensured "${sender.email}" (${sender.userId}) as a member of ${tenantId}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
