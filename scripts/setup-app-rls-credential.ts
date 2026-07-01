/**
 * Phase 12 Unit 6 — set the app_rls role's password and write DATABASE_URL_APP to .env.
 *
 * The role itself (grants, NOBYPASSRLS) is created by migration 20260701000900_app_rls_role.
 * This script sets a freshly-generated password (never committed) so the role can authenticate,
 * and writes the pooled app_rls connection string to the gitignored .env under DATABASE_URL_APP.
 *
 * Run once per environment (as the OWNER):  npx tsx --env-file=.env scripts/setup-app-rls-credential.ts
 *
 * ACTIVATION (deferred, done with the operator): once the tenant-context plumbing (U8/U9) is live,
 * repoint the runtime pooled DATABASE_URL at DATABASE_URL_APP locally AND set the same value in the
 * deploy env (Vercel). Migrations keep using DATABASE_URL_UNPOOLED (owner). Until then app_rls is
 * inert (nothing connects as it except the isolation tests).
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

async function main() {
  const ownerUrl = process.env.DATABASE_URL_UNPOOLED;
  const pooled = process.env.DATABASE_URL;
  if (!ownerUrl || !pooled) throw new Error("DATABASE_URL and DATABASE_URL_UNPOOLED must be set.");

  // base64url -> only A-Za-z0-9_- : URL-safe (unreserved) AND contains no single quote for SQL.
  const pw = randomBytes(24).toString("base64url");

  const prisma = new PrismaClient({ datasources: { db: { url: ownerUrl } } });
  try {
    await prisma.$executeRawUnsafe(`ALTER ROLE app_rls WITH LOGIN PASSWORD '${pw}';`);
  } finally {
    await prisma.$disconnect();
  }

  const u = new URL(pooled);
  u.username = "app_rls";
  u.password = pw;
  const appUrl = u.toString();

  const path = ".env";
  let env = existsSync(path) ? readFileSync(path, "utf8") : "";
  const line = `DATABASE_URL_APP=${appUrl}`;
  if (/^DATABASE_URL_APP=.*$/m.test(env)) env = env.replace(/^DATABASE_URL_APP=.*$/m, line);
  else env = env.replace(/\s*$/, "\n") + line + "\n";
  writeFileSync(path, env);

  console.log("✓ app_rls password set (LOGIN).");
  console.log("✓ DATABASE_URL_APP written to .env (gitignored).");
  console.log("  masked:", appUrl.replace(/:[^:@/]+@/, ":****@"));
  console.log("  For Vercel activation, use the DATABASE_URL_APP value from .env (do NOT commit it).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
