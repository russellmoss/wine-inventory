/**
 * Idempotent seed: one ADMIN user (forced to change password on first login) and
 * the reserved "Winery" system location for bulk wine.
 * Runs via `prisma db seed` (configured in package.json) or `npx tsx prisma/seed.ts`.
 */
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";
import { seedFieldInputs } from "./seed-field-inputs";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL || "admin@bhutanwine.com").toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!2026";
  const now = new Date();

  // Reserved Winery location.
  const winery = await prisma.location.upsert({
    where: { name: "Winery" },
    update: { isSystem: true, isActive: true },
    create: { name: "Winery", isSystem: true, isActive: true },
  });
  console.log(`Winery location ready (${winery.id})`);

  // Default category for bottled wine.
  await prisma.finishedGoodCategory.upsert({ where: { name: "Wine" }, update: {}, create: { name: "Wine" } });
  console.log("Wine category ready");

  // Default spray/fertilizer master list.
  const inputs = await seedFieldInputs();
  console.log(`Field inputs ready (${inputs} defaults)`);

  // Admin user + credential account.
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

  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (!account) {
    await prisma.account.create({
      data: { id: crypto.randomUUID(), accountId: user.id, providerId: "credential", userId: user.id, password: hash, createdAt: now, updatedAt: now },
    });
    console.log(`Admin created: ${email} (temp password, must change on first login)`);
  } else {
    console.log(`Admin already present: ${email} (password left unchanged)`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
