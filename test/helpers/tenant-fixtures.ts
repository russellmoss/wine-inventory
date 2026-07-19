import type { PrismaClient } from "@prisma/client";

// Shared tenant fixture setup for the DB-backed suites.
//
// WHY THIS EXISTS: the tenant-isolation CI job runs two suites in ONE vitest invocation:
//   npx vitest run test/tenant-isolation.test.ts test/developer-feedback-db.test.ts
// Vitest executes test files in parallel workers, and both files' beforeAll hooks ensure the SAME
// shared sandbox tenant (`org_demo_winery`, slug `demo-winery`) exists. `prisma.upsert()` is NOT
// atomic against a concurrent insert — it does a SELECT then an INSERT, so both workers can see
// "not found" and both attempt the insert. One wins; the other dies with:
//   PrismaClientKnownRequestError P2002 — Unique constraint failed on the fields: (`id`)
// which surfaced as an intermittently red `tenant-isolation` job (observed on PR #345).
//
// `INSERT ... ON CONFLICT DO NOTHING` closes the window entirely: the uniqueness check and the
// insert happen in a single atomic statement. The bare `DO NOTHING` (no conflict target) is
// deliberate — Organization has TWO unique constraints, `id` (PK) and `slug` (@unique), and both
// files insert the same id AND the same slug, so either one can be the losing race. Naming a single
// target would leave the other still able to throw.
//
// `createdAt` is omitted on purpose: the column carries `DEFAULT CURRENT_TIMESTAMP`.

/**
 * Ensure an organization row exists, safe to call concurrently from parallel test workers.
 * Idempotent: an existing row is left exactly as-is (use `renameOrganization` if a suite needs
 * the name refreshed).
 */
export async function ensureOrganization(
  owner: PrismaClient,
  org: { id: string; name: string; slug: string },
): Promise<void> {
  await owner.$executeRaw`
    INSERT INTO "organization" ("id", "name", "slug")
    VALUES (${org.id}, ${org.name}, ${org.slug})
    ON CONFLICT DO NOTHING
  `;
}

/**
 * Refresh an organization's display name. `updateMany` (not `update`) so a missing row is a no-op
 * rather than a throw — keeps fixture setup order-independent.
 */
export async function renameOrganization(
  owner: PrismaClient,
  id: string,
  name: string,
): Promise<void> {
  await owner.organization.updateMany({ where: { id }, data: { name } });
}
