/**
 * Seed the "Demo Winery" sandbox tenant.
 *
 * Purpose: a fake winery for demos + ALL dev/QA, isolated from the real
 * "Bhutan Wine Co." tenant by the live Phase-12 RLS. Going forward, do test
 * work here — never in Bhutan Wine Co. (see ROADMAP Phase 21a + the
 * "demo-winery-testing-convention" memory).
 *
 * WHEN TO RUN: after Phase 8a's migrations are deployed (the current schema).
 *
 * Usage:  npm run seed:demo-tenant
 *   env overrides: DEMO_OWNER_EMAIL, DEMO_OWNER_PASSWORD, SEED_CONNECT_TIMEOUT (secs)
 *
 * Idempotent: re-running is safe (existing rows are reused, not duplicated).
 * Full reset: delete org "org_demo_winery" (cascades members) + the owner user, re-run.
 *
 * Slow-link resilience: widens the DB connect/pool timeout BEFORE the Prisma client
 * initializes (a cold Neon compute + high-latency link otherwise races the default
 * connect timeout). `prisma` is dynamically imported so the env tweak lands first.
 *
 * Mirrors prisma/seed.ts: plain `prisma` for the Better-Auth global tables
 * (organization/user/account/member), `runAsTenant` for domain rows (tenantId is
 * auto-injected by the Prisma extension — do NOT set it).
 */
import { randomUUID } from "crypto";

// Widen connect/pool timeout for slow links / cold Neon compute — must run BEFORE
// src/lib/prisma is imported (it reads DATABASE_URL at init). Idempotent on the URL.
const _timeout = process.env.SEED_CONNECT_TIMEOUT || "30";
const _base = process.env.DATABASE_URL;
if (_base && !/connect_timeout=/.test(_base)) {
  const sep = _base.includes("?") ? "&" : "?";
  process.env.DATABASE_URL = `${_base}${sep}connect_timeout=${_timeout}&pool_timeout=${_timeout}`;
}

const DEMO_ORG_ID = "org_demo_winery";
const DEMO_ORG_NAME = "Demo Winery";
const DEMO_ORG_SLUG = "demo-winery";

async function main() {
  // Dynamic imports so the DATABASE_URL tweak above is in effect at client init.
  const { prisma } = await import("../src/lib/prisma");
  const { hashPassword } = await import("../src/lib/password");
  const { runAsTenant } = await import("../src/lib/tenant/context");

  const email = process.env.DEMO_OWNER_EMAIL || "owner@demowinery.test";
  const password = process.env.DEMO_OWNER_PASSWORD || "DemoWinery!2026";
  const now = new Date();

  // 1) Organization (global table — no tenant context) ------------------------
  const org = await prisma.organization.upsert({
    where: { id: DEMO_ORG_ID },
    update: { name: DEMO_ORG_NAME, slug: DEMO_ORG_SLUG },
    create: { id: DEMO_ORG_ID, name: DEMO_ORG_NAME, slug: DEMO_ORG_SLUG },
  });

  // 2) Owner user + credential account + membership (global) ------------------
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: "Demo Owner", emailVerified: true, mustChangePassword: false },
    create: {
      id: randomUUID(),
      email,
      name: "Demo Owner",
      emailVerified: true,
      mustChangePassword: false,
    },
  });

  const hash = await hashPassword(password);
  const existingAccount = await prisma.account.findFirst({
    where: { userId: user.id, providerId: "credential" },
  });
  if (existingAccount) {
    await prisma.account.update({
      where: { id: existingAccount.id },
      data: { password: hash, updatedAt: now },
    });
  } else {
    await prisma.account.create({
      data: {
        id: randomUUID(),
        accountId: user.id,
        providerId: "credential",
        userId: user.id,
        password: hash,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  const existingMember = await prisma.member.findFirst({
    where: { organizationId: org.id, userId: user.id },
  });
  if (!existingMember) {
    await prisma.member.create({
      data: {
        id: randomUUID(),
        organizationId: org.id,
        userId: user.id,
        role: "owner",
        createdAt: now,
      },
    });
  }

  // 3) Domain seed — inside tenant context (tenantId auto-injected; RLS scopes reads)
  await runAsTenant(org.id, async () => {
    const ensureLocation = async (name: string) => {
      const found = await prisma.location.findFirst({ where: { name } });
      return found ?? (await prisma.location.create({ data: { name } }));
    };
    const ensureVariety = async (name: string, abbreviation: string) => {
      const found = await prisma.variety.findFirst({ where: { name } });
      return found ?? (await prisma.variety.create({ data: { name, abbreviation } }));
    };
    const ensureVessel = async (code: string, type: "TANK" | "BARREL", capacityL: number) => {
      const found = await prisma.vessel.findFirst({ where: { code, type } });
      return found ?? (await prisma.vessel.create({ data: { code, type, capacityL } }));
    };
    const ensureLot = async (code: string, data: Record<string, unknown> = {}) => {
      const found = await prisma.lot.findFirst({ where: { code } });
      return found ?? (await prisma.lot.create({ data: { code, ...data } }));
    };

    await ensureLocation("Barrel Room");
    await ensureLocation("Tank Hall");
    await ensureLocation("Case Storage");

    const pn = await ensureVariety("Pinot Noir", "PN");
    const ch = await ensureVariety("Chardonnay", "CH");
    await ensureVariety("Cabernet Sauvignon", "CS");

    await ensureVessel("T1", "TANK", 1000);
    await ensureVessel("T2", "TANK", 2000);
    await ensureVessel("B1", "BARREL", 225);
    await ensureVessel("B2", "BARREL", 225);
    await ensureVessel("B3", "BARREL", 225);

    await ensureLot("DW-25-PN-001", { vintageYear: 2025, originVarietyId: pn.id, form: "WINE" });
    await ensureLot("DW-25-CH-001", { vintageYear: 2025, originVarietyId: ch.id, form: "WINE" });
  });

  console.log("✅ Demo Winery tenant ready.");
  console.log(`   org:   ${org.id} (${DEMO_ORG_NAME})`);
  console.log(`   login: ${email}`);
  console.log(`   pass:  ${password}   (override via DEMO_OWNER_PASSWORD)`);
  console.log("   seeded: 3 locations, 3 varieties, 5 vessels, 2 lots");
  console.log("   ⚠  use THIS tenant for all dev/QA — never Bhutan Wine Co.");
}

// Retry the whole (idempotent) seed on transient connection failures — airplane wifi
// drops/latency spikes shouldn't fail the run. Attempts + backoff are env-tunable.
async function run() {
  const attempts = Number(process.env.SEED_ATTEMPTS || "5");
  for (let i = 1; i <= attempts; i++) {
    try {
      await main();
      return;
    } catch (e) {
      const msg = String(e);
      const transient =
        /reach database|can't reach|connection|Closed|timeout|ECONN|ETIMEDOUT|terminating|socket/i.test(msg);
      if (i < attempts && transient) {
        console.warn(`attempt ${i}/${attempts} hit a connection issue (airplane wifi?), retrying…`);
        await new Promise((r) => setTimeout(r, 3000 * i));
        continue;
      }
      throw e;
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("seed-demo-tenant failed:", e);
    process.exit(1);
  });
