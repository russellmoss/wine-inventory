/**
 * Bootstrap a single admin user for verification/first-run.
 * Idempotent: re-running updates the password + re-flags mustChangePassword.
 * Usage: npx tsx scripts/create-admin.ts
 */
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@bhutanwine.com";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!2026";
  const name = "Administrator";

  const hash = await hashPassword(password);
  const now = new Date();

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: "admin", mustChangePassword: true, banned: false },
    create: {
      id: crypto.randomUUID(),
      email,
      name,
      emailVerified: true,
      role: "admin",
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    },
  });

  // Better Auth credential account holds the password hash.
  const existing = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (existing) {
    await prisma.account.update({
      where: { id: existing.id },
      data: { password: hash, updatedAt: now },
    });
  } else {
    await prisma.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hash,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  console.log(`Admin ready: ${email} (temp password set, mustChangePassword=true)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
