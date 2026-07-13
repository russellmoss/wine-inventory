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
 * The roles a user account may hold and that user management can assign. `developer` is the most
 * powerful (admin-like in every tenant + cross-tenant support console); `admin` and `user` are the
 * ordinary org-level roles. Stored as a free-form String on `User` — this is the code-level allow-list.
 */
export const ASSIGNABLE_ROLES = ["user", "admin", "developer"] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(role: unknown): role is AssignableRole {
  return typeof role === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

/**
 * Privilege rank, so we can reason about promotions vs demotions. developer > admin > user.
 * Unknown/absent roles rank at the bottom.
 */
function roleRank(role: string | null | undefined): number {
  if (role === "developer") return 3;
  if (role === "admin") return 2;
  return 1;
}

/**
 * Can `actor` assign `targetRole` to some user? The developer role is SELF-REPLICATING: only an
 * existing developer may grant it. A plain admin must never be able to mint a developer, because
 * developer carries cross-tenant support reach — letting an admin grant it would be a privilege-
 * escalation backdoor. Admins (and developers) may assign the ordinary admin/user roles.
 * Pure + actor-aware so both the server action and the UI gate off the exact same rule.
 */
export function canAssignRole(actor: RoleBearingUser | null, targetRole: string): boolean {
  if (!isAssignableRole(targetRole)) return false;
  if (targetRole === "developer") return isDeveloper(actor);
  return isTenantAdminLike(actor);
}

/**
 * Only a developer may manage (change role / deactivate) an account that IS a developer — whether
 * promoting, demoting, or banning it. Stops an ordinary admin from griefing or locking out the
 * developer tier. `true` means the actor is allowed to manage this target.
 */
export function canManageDeveloperTarget(actor: RoleBearingUser | null, targetRole: string | null | undefined): boolean {
  if (targetRole !== "developer") return true;
  return isDeveloper(actor);
}

/**
 * Guard the last-developer / self-downgrade lockout: a user may not LOWER their own privilege
 * (e.g. a developer setting themselves back to admin/user, or an admin to user). Returns `true`
 * when the self role change is allowed. Not-self is always allowed here (other guards apply).
 */
export function canChangeOwnRole(currentRole: string | null | undefined, targetRole: string, isSelf: boolean): boolean {
  if (!isSelf) return true;
  return roleRank(targetRole) >= roleRank(currentRole);
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
