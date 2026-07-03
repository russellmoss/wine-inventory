/**
 * Phase 15 SEC-C3 — set the accounting_enumerator role's password and write DATABASE_URL_ENUMERATOR.
 *
 * The role itself (LOGIN NOBYPASSRLS, SELECT on organization ONLY, NO grant on token tables) is
 * created by migration 20260702050100_accounting_schema. This script sets a freshly-generated
 * password (never committed) so the accounting cron can authenticate AS this least-privilege role,
 * and writes the pooled connection string to the gitignored .env under DATABASE_URL_ENUMERATOR.
 *
 * Run once per environment (as the OWNER):
 *   npx tsx --env-file=.env scripts/setup-accounting-enumerator-credential.ts
 *
 * For Vercel: copy the resulting DATABASE_URL_ENUMERATOR value into the deploy env (do NOT commit).
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

async function main() {
  const ownerUrl = process.env.DATABASE_URL_UNPOOLED;
  const pooled = process.env.DATABASE_URL;
  if (!ownerUrl || !pooled) throw new Error("DATABASE_URL and DATABASE_URL_UNPOOLED must be set.");

  const pw = randomBytes(24).toString("base64url"); // URL-safe, no single quote

  const prisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
  try {
    await prisma.$executeRawUnsafe(`ALTER ROLE accounting_enumerator WITH LOGIN PASSWORD '${pw}';`);
  } finally {
    await prisma.$disconnect();
  }

  const u = new URL(pooled);
  u.username = "accounting_enumerator";
  u.password = pw;
  const enumUrl = u.toString();

  const path = ".env";
  let env = existsSync(path) ? readFileSync(path, "utf8") : "";
  const line = `DATABASE_URL_ENUMERATOR=${enumUrl}`;
  if (/^DATABASE_URL_ENUMERATOR=.*$/m.test(env)) env = env.replace(/^DATABASE_URL_ENUMERATOR=.*$/m, line);
  else env = env.replace(/\s*$/, "\n") + line + "\n";
  writeFileSync(path, env);

  console.log("✓ accounting_enumerator password set (LOGIN).");
  console.log("✓ DATABASE_URL_ENUMERATOR written to .env (gitignored).");
  console.log("  masked:", enumUrl.replace(/:[^:@/]+@/, ":****@"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
