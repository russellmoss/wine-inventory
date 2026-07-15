/**
 * Plan 069 — one-time backfill: give every existing Lead-less work order a Lead.
 *
 * The WorkOrder Lead (assigneeEmail + assigneeId) is now a mandatory invariant, but orders created before
 * this change may have a null Lead (e.g. WO #27, whose only task points at Russell while the order-level
 * Lead was left blank). This script resolves a Lead for each such order using resolveBackfillLead:
 *   single distinct task assignee -> issuer -> tenant's oldest owner/admin -> (unresolved, logged).
 *
 * Cross-tenant + RLS-bypassing via runAsSystem (audited-script escape hatch). Idempotent: it only touches
 * rows where assigneeEmail IS NULL, so re-running is a no-op. Self-verifies at the end.
 *
 * Run (dry-run first, then live):
 *   npx tsx --env-file=.env scripts/backfill-work-order-lead.ts --dry-run
 *   npx tsx --env-file=.env scripts/backfill-work-order-lead.ts
 */
import type { PrismaClient } from "@prisma/client";
import { runAsSystem, disconnectSystem } from "../src/lib/tenant/system";
import { resolveBackfillLead } from "../src/lib/work-orders/lead-resolve";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  await runAsSystem(async (db: PrismaClient) => {
    const wos = await db.workOrder.findMany({
      where: { assigneeEmail: null },
      orderBy: [{ tenantId: "asc" }, { number: "asc" }], // deterministic
      select: {
        id: true,
        tenantId: true,
        number: true,
        issuedById: true,
        issuedByEmail: true,
        tasks: { select: { assigneeId: true, assigneeEmail: true } },
      },
    });

    console.log(`${DRY_RUN ? "[DRY-RUN] " : ""}Found ${wos.length} work order(s) with a null Lead.`);

    // Cache the tenant's fallback admin (oldest owner/admin member) so we query each tenant at most once.
    const adminCache = new Map<string, { id: string | null; email: string | null } | null>();
    async function fallbackAdmin(tenantId: string) {
      if (adminCache.has(tenantId)) return adminCache.get(tenantId)!;
      const m = await db.member.findFirst({
        where: { organizationId: tenantId, role: { in: ["owner", "admin"] } },
        orderBy: { createdAt: "asc" },
        select: { user: { select: { id: true, email: true } } },
      });
      const val = m?.user ? { id: m.user.id, email: m.user.email } : null;
      adminCache.set(tenantId, val);
      return val;
    }

    let resolved = 0;
    const unresolved: { id: string; tenantId: string; number: number }[] = [];

    for (const wo of wos) {
      const lead = resolveBackfillLead({
        taskAssignees: wo.tasks.map((t) => ({ id: t.assigneeId, email: t.assigneeEmail })),
        issuedBy: wo.issuedByEmail ? { id: wo.issuedById, email: wo.issuedByEmail } : null,
        fallbackAdmin: await fallbackAdmin(wo.tenantId),
      });

      if (!lead) {
        unresolved.push({ id: wo.id, tenantId: wo.tenantId, number: wo.number });
        console.warn(`  UNRESOLVED  tenant=${wo.tenantId} WO #${wo.number} (${wo.id}) — no task assignee, issuer, or admin. Left null; set the Lead manually.`);
        continue;
      }

      console.log(`  ${DRY_RUN ? "would set" : "set"}  tenant=${wo.tenantId} WO #${wo.number} -> ${lead.assigneeEmail}${lead.assigneeId ? "" : " (email-only)"}`);
      if (!DRY_RUN) {
        await db.workOrder.update({
          where: { id: wo.id },
          data: { assigneeId: lead.assigneeId, assigneeEmail: lead.assigneeEmail },
        });
      }
      resolved++;
    }

    console.log(`\n${DRY_RUN ? "[DRY-RUN] " : ""}Resolved ${resolved}, unresolved ${unresolved.length}.`);

    if (!DRY_RUN) {
      const remaining = await db.workOrder.count({ where: { assigneeEmail: null } });
      // After a live run, the only rows that may remain null are the unresolved ones we logged above.
      if (remaining !== unresolved.length) {
        console.error(`SELF-CHECK FAILED: ${remaining} null-Lead WOs remain but ${unresolved.length} were unresolved.`);
        process.exitCode = 1;
      } else {
        console.log(`SELF-CHECK OK: ${remaining} null-Lead WO(s) remain (all unresolved, logged above).`);
      }
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
  });
