import type { Prisma } from "@prisma/client";

/**
 * App-layer tenant isolation for user management (#90).
 *
 * `User` and `Member` are GLOBAL, RLS-exempt tables (Better Auth queries them before any tenant is
 * known — they're on the tenant-extension denylist in `src/lib/tenant/models.ts`). That means the
 * database does NOT scope them by tenant: the ONLY thing keeping one winery's admin from seeing or
 * mutating another winery's user accounts is an explicit membership filter in the app layer. These
 * pure builders are that filter, shared by the Users page (reads) and every user-management server
 * action (writes) so the exact same rule is applied on both sides and can't drift.
 *
 * The isolation key is org MEMBERSHIP: a user belongs to a tenant iff they have a `Member` row for
 * that org. `tenantId` here is always the caller's VERIFIED effective tenant
 * (`supportOrganizationId ?? activeOrganizationId`), never client input.
 */

/** Users who are a member of `tenantId`. Use as the `where` for a tenant-scoped user list. */
export function memberOfTenant(tenantId: string): Prisma.UserWhereInput {
  return { memberships: { some: { organizationId: tenantId } } };
}

/**
 * A single user, but ONLY if they belong to `tenantId`. Use to load the target of a user-management
 * mutation: a non-match returns no row, so the action must reject (as "not found", never "forbidden",
 * so a caller can't probe which user ids exist in other tenants).
 */
export function tenantUserWhere(userId: string, tenantId: string): Prisma.UserWhereInput {
  return { id: userId, memberships: { some: { organizationId: tenantId } } };
}
