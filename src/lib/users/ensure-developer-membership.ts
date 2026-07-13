import type { Prisma } from "@prisma/client";
import { DEVELOPER_HOME_ORG_ID } from "@/lib/access";
import { ActionError } from "@/lib/action-error";

/**
 * Ensure a developer is a member of the Demo Winery sandbox tenant.
 *
 * Developers default into Demo Winery on login (resolveActiveOrg / the auth.ts session hook), but that
 * default only resolves to an org the user is ACTUALLY a member of (tenant RLS denies otherwise). So a
 * freshly-minted developer with no membership would land nowhere. This productizes the out-of-band
 * `scripts/grant-developer-demo-membership.ts` for the UI creation path.
 *
 * Idempotent: no-op if the membership already exists (safe on re-promote). `member` is an auth-global
 * table (no tenant scoping), so this is correct regardless of the acting admin's active tenant.
 */
export async function ensureDeveloperHomeMembership(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  const org = await tx.organization.findUnique({ where: { id: DEVELOPER_HOME_ORG_ID }, select: { id: true } });
  if (!org) {
    throw new ActionError(`Demo org "${DEVELOPER_HOME_ORG_ID}" does not exist — seed it before creating a developer.`);
  }
  const existing = await tx.member.findUnique({
    where: { organizationId_userId: { organizationId: org.id, userId } },
    select: { id: true },
  });
  if (existing) return;
  await tx.member.create({ data: { organizationId: org.id, userId, role: "member" } });
}
