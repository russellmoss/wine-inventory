import { PrismaClient } from "@prisma/client";

/**
 * Phase 12 (U10) — cross-tenant maintenance escape hatch. Runs against a dedicated connection that
 * BYPASSES RLS (the OWNER role via DATABASE_URL_UNPOOLED — Neon's owner carries BYPASSRLS), on a
 * PLAIN (un-extended) client so no tenant wrapping is applied and every tenant's rows are visible.
 *
 * AUDITED SCRIPTS ONLY (backfills, cross-tenant reindex, ops tooling). NEVER import this from the
 * web app — the app connects as the non-owner app_rls role and must always be tenant-scoped. There
 * is deliberately no HTTP path to this client.
 */
let systemClient: PrismaClient | undefined;

function getSystemClient(): PrismaClient {
  if (!systemClient) {
    const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
    systemClient = new PrismaClient({ datasources: { db: { url } } });
  }
  return systemClient;
}

/** Run maintenance across ALL tenants, bypassing RLS. Scripts only. */
export async function runAsSystem<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  return fn(getSystemClient());
}

/** Disconnect the system client (call at the end of a script). */
export async function disconnectSystem(): Promise<void> {
  if (systemClient) await systemClient.$disconnect();
  systemClient = undefined;
}
