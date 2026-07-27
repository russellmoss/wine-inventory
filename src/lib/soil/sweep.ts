import "server-only";
/**
 * Vineyard Intelligence P4 — the soil backfill sweep. "Always have soils for every US vineyard block."
 *
 * Soil is FREE (keyless SDA), STATIC (changes only when the boundary changes), and US-only — so unlike
 * NDVI there is no quota gate and no per-vineyard opt-in flag: we simply keep every US block's current
 * snapshot populated. The sweep calls the idempotent `pullBlockSoil` per block, which no-ops a block that
 * is already current (cache hit, no SDA), skips a non-US block (out-of-region gate, no SDA), and pulls the
 * ones that are MISSING or STALE. Actual SDA pulls are capped per run so a slow no-SLA government API can't
 * blow the cron's duration budget; the next run picks up the rest.
 *
 * Cross-tenant: enumerate orgs (least-privilege) and run each under its own tenant context (RLS applies).
 */
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import { listAllOrgIds, disconnectEnumerator } from "@/lib/accounting/enumerator";
import { pullBlockSoil, type SoilPullState } from "./pull-core";

export type SoilSweepDeps = { maxPullsPerTenant?: number };
export type TenantSoilSweep = { tenantId: string; blocks: number; pulled: number; cached: number; skipped: number; failed: number };
export type SoilSweepSummary = { tenants: number; pulled: number; cached: number; skipped: number; failed: number; perTenant: TenantSoilSweep[] };

async function sweepTenantSoil(tenantId: string, deps: SoilSweepDeps): Promise<TenantSoilSweep> {
  const cap = deps.maxPullsPerTenant ?? 25;
  const out: TenantSoilSweep = { tenantId, blocks: 0, pulled: 0, cached: 0, skipped: 0, failed: 0 };

  // A member of the tenant is the audit actor for the maintenance pull (attributed to the org, honest).
  const member = await prisma.member.findFirst({ where: { organizationId: tenantId }, select: { userId: true, user: { select: { email: true } } } });
  if (!member) return out; // no one to attribute the audited write to — skip this tenant

  const actor = { actorUserId: member.userId, actorEmail: member.user?.email ?? "system@cellarhand", tenantId };
  const allBlocks = await prisma.vineyardBlock.findMany({ select: { id: true, polygon: true } });
  const blocks = allBlocks.filter((b) => b.polygon != null);
  out.blocks = blocks.length;

  let sdaPulls = 0;
  for (const b of blocks) {
    if (sdaPulls >= cap) break; // duration budget — the next run continues
    let state: SoilPullState;
    try {
      state = (await pullBlockSoil(actor, b.id, {})).state;
    } catch {
      out.failed++;
      continue;
    }
    if (state === "ok") {
      out.pulled++;
      sdaPulls++;
    } else if (state === "cached") {
      out.cached++;
    } else if (state === "out-of-region" || state === "no-polygon" || state === "no-coverage") {
      out.skipped++;
      if (state === "no-coverage") sdaPulls++; // a no-coverage result still cost an SDA round trip
    } else {
      // sda-unavailable / stale-during-fetch / invalid-polygon — count as failed; a later run retries.
      out.failed++;
      if (state === "sda-unavailable") sdaPulls++;
    }
  }
  return out;
}

/** Cron entry point: keep every US block's soil snapshot populated across all tenants. */
export async function runSoilSweep(deps: SoilSweepDeps = {}): Promise<SoilSweepSummary> {
  const orgIds = await listAllOrgIds();
  const perTenant: TenantSoilSweep[] = [];
  try {
    for (const tenantId of orgIds) {
      const t = await runAsTenant(tenantId, () => sweepTenantSoil(tenantId, deps));
      perTenant.push(t);
    }
  } finally {
    await disconnectEnumerator();
  }
  return {
    tenants: perTenant.length,
    pulled: perTenant.reduce((s, t) => s + t.pulled, 0),
    cached: perTenant.reduce((s, t) => s + t.cached, 0),
    skipped: perTenant.reduce((s, t) => s + t.skipped, 0),
    failed: perTenant.reduce((s, t) => s + t.failed, 0),
    perTenant,
  };
}
