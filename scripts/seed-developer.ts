/**
 * Promote the internal developer account. Password is env-only and the user is
 * forced through change-password on next login.
 *
 * Usage:
 *   SEED_DEVELOPER_PASSWORD='...' npx tsx --env-file=.env scripts/seed-developer.ts
 */
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/password";

const email = (process.env.SEED_DEVELOPER_EMAIL || "russellmoss87@gmail.com").toLowerCase();
const password = process.env.SEED_DEVELOPER_PASSWORD;

function isForbiddenDemoAddress(value: string): boolean {
  return value.startsWith("demo@") || value.includes("@demo") || value.endsWith(".test");
}

async function main() {
  if (isForbiddenDemoAddress(email)) {
    throw new Error(`Refusing to grant developer to demo/test address: ${email}`);
  }
  if (!password || password.length < 12) {
    throw new Error("SEED_DEVELOPER_PASSWORD is required and must be at least 12 characters.");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, memberships: { select: { organizationId: true } } },
  });
  if (!user) throw new Error(`User ${email} does not exist. Create the real account first.`);
  if (!user.memberships.some((m) => m.organizationId === "org_bhutan_wine_co")) {
    throw new Error(`${email} must already be a member of org_bhutan_wine_co before promotion.`);
  }

  const now = new Date();
  const hash = await hashPassword(password);
  await prisma.user.update({
    where: { id: user.id },
    data: { role: "developer", mustChangePassword: true, banned: false, updatedAt: now },
  });
  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { password: hash, updatedAt: now } });
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
  console.log(`Developer ready: ${email} (mustChangePassword=true)`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
