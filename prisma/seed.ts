/**
 * Idempotent seed: one ADMIN user (forced to change password on first login) and
 * the reserved "Winery" system location for bulk wine.
 * Runs via `prisma db seed` (configured in package.json) or `npx tsx prisma/seed.ts`.
 */
import { prisma } from "../src/lib/prisma";
import { runAsTenant, requireTenantId } from "../src/lib/tenant/context";
import { hashPassword } from "../src/lib/password";
import { seedFieldInputs } from "./seed-field-inputs";

const BHUTAN_ORG_ID = "org_bhutan_wine_co";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@bhutanwine.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!2026";
  const now = new Date();

  // Phase 12: ensure tenant #1 (Bhutan) exists (global table — the U1 migration also seeds it).
  await prisma.organization.upsert({
    where: { id: BHUTAN_ORG_ID },
    update: {},
    create: { id: BHUTAN_ORG_ID, name: "Bhutan Wine Company", slug: "bhutan-wine-company" },
  });

  // Admin user + credential account (GLOBAL tables — no tenant context needed).
  const hash = await hashPassword(password);
  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "admin", banned: false },
    create: {
      id: crypto.randomUUID(),
      email,
      name: "Administrator",
      emailVerified: true,
      role: "admin",
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Admin is an owner-member of Bhutan (so getCurrentUser resolves an active org).
  const membership = await prisma.member.findFirst({ where: { userId: user.id, organizationId: BHUTAN_ORG_ID } });
  if (!membership) {
    await prisma.member.create({
      data: { id: crypto.randomUUID(), organizationId: BHUTAN_ORG_ID, userId: user.id, role: "owner", createdAt: now },
    });
  }

  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (!account) {
    await prisma.account.create({
      data: { id: crypto.randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: hash, createdAt: now, updatedAt: now },
    });
    console.log(`Admin created: ${email} (temp password, must change on first login)`);
  } else {
    console.log(`Admin already present: ${email} (password left unchanged)`);
  }

  // Tenant-scoped registry seed — under the Bhutan tenant context.
  await runAsTenant(BHUTAN_ORG_ID, async () => {
    const tenantId = requireTenantId();
    const winery = await prisma.location.upsert({
      where: { tenantId_name: { tenantId, name: "Winery" } },
      update: { isSystem: true, isActive: true },
      create: { name: "Winery", isSystem: true, isActive: true },
    });
    console.log(`Winery location ready (${winery.id})`);

    await prisma.finishedGoodCategory.upsert({
      where: { tenantId_name: { tenantId, name: "Wine" } },
      update: {},
      create: { name: "Wine" },
    });
    console.log("Wine category ready");

    const inputs = await seedFieldInputs();
    console.log(`Field inputs ready (${inputs} defaults)`);
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
