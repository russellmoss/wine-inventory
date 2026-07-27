/** One-time soil backfill — pull soil for every US block across all tenants (idempotent). */
import { runSoilSweep } from "@/lib/soil/sweep";
import { prisma } from "@/lib/prisma";
import { disconnectSystem } from "@/lib/tenant/system";
async function main() {
  const s = await runSoilSweep({ maxPullsPerTenant: 100 });
  console.log(`tenants=${s.tenants} pulled=${s.pulled} cached=${s.cached} skipped=${s.skipped} failed=${s.failed}`);
  for (const t of s.perTenant.filter(t => t.blocks > 0)) console.log(`  ${t.tenantId}: blocks=${t.blocks} pulled=${t.pulled} cached=${t.cached} skipped=${t.skipped} failed=${t.failed}`);
  await prisma.$disconnect(); await disconnectSystem();
}
main().catch(e => { console.error(e); process.exit(1); });
