/**
 * Ensure every developer is a member of the Demo Winery sandbox tenant.
 *
 * Developers default into Demo Winery on login (see resolveActiveOrg / auth.ts session hook), but the
 * default only resolves to an org the user is actually a member of (tenant RLS denies otherwise). This
 * backfills the membership for every user with role "developer". Idempotent (upsert on the org+user
 * unique) — safe to re-run, and safe to run in prod. Never removes any existing membership.
 */
import { prisma } from "@/lib/prisma";
import { DEVELOPER_HOME_ORG_ID } from "@/lib/access";

async function main() {
  const org = await prisma.organization.findUnique({ where: { id: DEVELOPER_HOME_ORG_ID }, select: { id: true, name: true } });
  if (!org) throw new Error(`Demo org "${DEVELOPER_HOME_ORG_ID}" does not exist — create it before granting membership.`);

  const developers = await prisma.user.findMany({ where: { role: "developer" }, select: { id: true, email: true } });
  if (developers.length === 0) {
    console.log("No developer users found — nothing to do.");
    return;
  }

  let added = 0;
  let already = 0;
  for (const dev of developers) {
    const existing = await prisma.member.findUnique({
      where: { organizationId_userId: { organizationId: org.id, userId: dev.id } },
      select: { id: true },
    });
    if (existing) {
      already++;
      console.log(`  = ${dev.email} already a member of ${org.name}`);
      continue;
    }
    await prisma.member.create({ data: { organizationId: org.id, userId: dev.id, role: "member" } });
    added++;
    console.log(`  + ${dev.email} → ${org.name}`);
  }
  console.log(`\nDone. ${added} added, ${already} already members. ${developers.length} developer(s) total.`);
}

main()
  .catch((e) => {
    console.error("GRANT FAILED\n", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
