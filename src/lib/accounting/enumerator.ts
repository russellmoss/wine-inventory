import "server-only";
import { PrismaClient } from "@prisma/client";

// Phase 15 SEC-C3 — the cron's org enumeration runs as the least-privilege `accounting_enumerator`
// role (created in migration 20260702050100). That role has SELECT on `organization` ONLY and NO grant
// on any token table, so this system path CANNOT read a secret even by mistake. The actual token reads
// happen per-tenant under app_rls (runAsTenant → getValidAccessToken), never here. Never the BYPASSRLS
// owner (runAsSystem) — reading tenant rows under owner bypass would defeat RLS.

let client: PrismaClient | undefined;

function getEnumeratorClient(): PrismaClient {
  const url = process.env.DATABASE_URL_ENUMERATOR;
  if (!url) {
    throw new Error(
      "DATABASE_URL_ENUMERATOR is not set — run scripts/setup-accounting-enumerator-credential.ts (owner).",
    );
  }
  if (!client) client = new PrismaClient({ datasources: { db: { url } } });
  return client;
}

/** List every org id. The per-tenant CONNECTED check happens later under app_rls (not readable here). */
export async function listAllOrgIds(): Promise<string[]> {
  const rows = await getEnumeratorClient().organization.findMany({ select: { id: true } });
  return rows.map((r) => r.id);
}

export async function disconnectEnumerator(): Promise<void> {
  if (client) await client.$disconnect();
  client = undefined;
}
