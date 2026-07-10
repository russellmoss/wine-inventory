// Pure access-control logic. No server-only imports so it is unit-testable.

export type AppUser = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  mustChangePassword: boolean | null;
  vineyardIds: string[]; // D9: a manager's vineyard MEMBERSHIP set (admins reach all)
  // Phase 12 multi-tenancy (K2/K9/K13): the user's org memberships, and the VALIDATED active org
  // (the tenant) for this request — null when the session's active-org claim isn't a real
  // membership (K13 revalidation) or the user belongs to no org. All tenant scoping keys off this.
  organizationIds: string[];
  activeOrganizationId: string | null;
  supportOrganizationId?: string | null;
  supportOrganizationName?: string | null;
  supportExpiresAt?: string | null;
};

export type AccessDecision = "ok" | "login" | "banned" | "change-password" | "forbidden";

/**
 * The sandbox tenant developers default into instead of a real customer tenant. A developer lands
 * here on login (and when no active-org claim is set) whenever they're a member of it; they reach a
 * real tenant explicitly (org switch / support console), never by accident.
 */
export const DEVELOPER_HOME_ORG_ID = "org_demo_winery";

/**
 * Resolve the VALIDATED active organization (the tenant) for a request (K9/K13). When a preferred
 * org is supplied and the user is a member of it, it wins before any session claim.
 * Otherwise a valid session claim is honored, then the user's earliest membership. A user with no
 * membership resolves to `null` (denied by tenant scoping). Pure so it's unit-tested without a DB.
 * Membership set is the source of truth.
 */
export function resolveActiveOrg(
  organizationIds: string[],
  claim: string | null | undefined,
  opts: { preferOrgId?: string | null } = {},
): string | null {
  if (opts.preferOrgId && organizationIds.includes(opts.preferOrgId)) return opts.preferOrgId;
  if (claim && organizationIds.includes(claim)) return claim;
  return organizationIds[0] ?? null;
}

export function accessDecision(
  user: AppUser | null,
  opts: { requireAdmin?: boolean } = {},
): AccessDecision {
  if (!user) return "login";
  if (user.banned) return "banned";
  if (user.mustChangePassword) return "change-password";
  if (opts.requireAdmin && !isTenantAdminLike(user)) return "forbidden";
  return "ok";
}

type RoleBearingUser = { role?: string | null; supportOrganizationId?: string | null };

export function isDeveloper(user: RoleBearingUser | null): boolean {
  return user?.role === "developer";
}

export function isTenantAdminLike(user: RoleBearingUser | null): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return isDeveloper(user);
}

/**
 * Can this user act on the given vineyard? Admins reach any vineyard; a manager
 * (role "user") only vineyards in their membership SET (D9). Used server-side by
 * every field-note / harvest mutation + read to scope managers.
 */
export function canAccessVineyard(user: AppUser | null, vineyardId: string): boolean {
  if (!user) return false;
  if (isTenantAdminLike(user)) return true;
  return user.vineyardIds.includes(vineyardId);
}

/**
 * Back-compat alias — the predicate is now set-based (D9). Existing call sites that
 * scope a single vineyard keep working unchanged.
 */
export const canManagerAccessVineyard = canAccessVineyard;

/**
 * Can this user reach a LOT, given the lot's source-vineyard set? Admins reach all;
 * a manager reaches a lot iff its source set intersects their membership set (D9 —
 * a blend spanning their vineyard is reachable). Used by the opt-in "my fruit
 * downstream" lens (Unit 10), NOT to gate the tenant-wide cellar.
 */
export function canAccessLot(user: AppUser | null, lotSourceVineyardIds: string[]): boolean {
  if (!user) return false;
  if (isTenantAdminLike(user)) return true;
  const mine = new Set(user.vineyardIds);
  return lotSourceVineyardIds.some((id) => mine.has(id));
}
