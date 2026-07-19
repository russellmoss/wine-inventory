import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessDecision, isDeveloper, resolveActiveOrg, DEVELOPER_HOME_ORG_ID, type AppUser } from "@/lib/access";
import { readSupportTenantContext } from "@/lib/developer/support-context";

export { accessDecision, canManagerAccessVineyard, canAccessVineyard, canAccessLot, isDeveloper, isTenantAdminLike } from "@/lib/access";
export type { AppUser, AccessDecision } from "@/lib/access";

/**
 * THE canonical column set for building an AppUser. Every site that loads a user
 * into an AppUser MUST go through `userSelect` + `toAppUser`, so adding a field
 * (e.g. the vineyard membership set) can never silently skip a construction site.
 */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  banned: true,
  mustChangePassword: true,
  vineyardMemberships: { select: { vineyardId: true } }, // D9 membership set
  memberships: { select: { organizationId: true } }, // Phase 12: org (tenant) membership set
} as const;

type UserRecord = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  mustChangePassword: boolean | null;
  vineyardMemberships: { vineyardId: string }[];
  memberships: { organizationId: string }[];
};

/**
 * Map a DB user record (selected via `userSelect`) into the AppUser domain shape.
 *
 * `activeOrgClaim` is the session's claimed active organization. We RE-VALIDATE it against the
 * authoritative membership set loaded from the DB (K13): the active org is honored only if the
 * user is actually a member; a revoked/stale claim falls back to their earliest membership, and a
 * user with no membership resolves to `null` (denied by tenant scoping downstream). Never trust
 * the session's claim on its own — memberships are the source of truth, reloaded each request.
 */
export function toAppUser(record: UserRecord, activeOrgClaim?: string | null): AppUser {
  const organizationIds = record.memberships.map((m) => m.organizationId);
  // Developers default into the Demo Winery sandbox (never a real tenant) whenever they are members
  // of it. Explicit real-tenant access goes through the short-lived support context, not stale
  // session.activeOrganizationId claims.
  const preferOrgId = record.role === "developer" ? DEVELOPER_HOME_ORG_ID : null;
  const activeOrganizationId = resolveActiveOrg(organizationIds, activeOrgClaim, { preferOrgId });
  return {
    id: record.id,
    name: record.name ?? null,
    email: record.email,
    role: record.role ?? null,
    banned: record.banned ?? false,
    mustChangePassword: record.mustChangePassword ?? false,
    vineyardIds: record.vineyardMemberships.map((m) => m.vineyardId),
    organizationIds,
    activeOrganizationId,
    supportOrganizationId: null,
    supportOrganizationName: null,
    supportExpiresAt: null,
  };
}

/**
 * Read the current user, cached per request. Security-sensitive flags
 * (banned, mustChangePassword, role) are loaded AUTHORITATIVELY from the DB,
 * never trusted from the session payload — and we fail CLOSED: if the session's
 * user row is missing, return null (forces re-auth).
 */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return null;
  const record = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: userSelect,
  });
  if (!record) return null; // session points at a deleted user -> deny
  // K13: re-validate the session's active-org claim against the freshly-loaded membership set.
  const activeOrgClaim = session.session?.activeOrganizationId ?? null;
  const user = toAppUser(record, activeOrgClaim);
  const support = await readSupportTenantContext(user);
  if (!support) return user;
  return {
    ...user,
    supportOrganizationId: support.tenantId,
    supportOrganizationName: support.tenantName,
    supportExpiresAt: support.expiresAt,
  };
});

/**
 * Ensures a non-banned session exists (but allows mustChangePassword). Used by
 * /change-password so a flagged user can reset, while banned users are bounced.
 */
export async function requireSession(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user || user.banned) redirect("/login");
  return user;
}

/**
 * Authoritative app gate. Redirects unauthenticated -> /login, banned -> /login,
 * and forces /change-password while mustChangePassword is set.
 */
export async function requireReadyUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  switch (accessDecision(user)) {
    case "login":
    case "banned":
      redirect("/login");
    case "change-password":
      redirect("/change-password");
    default:
      return user as AppUser;
  }
}

/**
 * Tenant gate for a tenant-scoped page. Returns the active tenant id, or REDIRECTS a session that
 * has none to a safe, tenant-less landing (`/no-winery`) — never lets the page fall through to a
 * `prisma` read that would throw "Tenant context required" as a raw 500 (Sentry #230).
 *
 * `requireReadyUser` only proves the user is authenticated/ready — NOT that they have an active
 * winery. A developer without a support session, or a user with a revoked/absent membership,
 * resolves to a null tenant (`toAppUser`). Every tenant-scoped `(app)` page must call this before
 * reading `prisma`; on a soft navigation the layout is cached and cannot guard the page, so the
 * guard has to live on the page. Complements `(app)/error.tsx`, which catches anything that slips
 * through. Resolves the tenant the same way the Prisma extension does (support org, then active org).
 */
export async function requireActiveTenant(): Promise<string> {
  const user = await getCurrentUser();
  if (!user || user.banned) redirect("/login");
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId ?? null;
  if (!tenantId) redirect("/no-winery");
  return tenantId;
}

/** Admin-only gate. */
export async function requireAdmin(): Promise<AppUser> {
  const user = await getCurrentUser();
  switch (accessDecision(user, { requireAdmin: true })) {
    case "login":
    case "banned":
      redirect("/login");
    case "change-password":
      redirect("/change-password");
    case "forbidden":
      redirect("/");
    default:
      return user as AppUser;
  }
}

/** Developer-only gate for the global support console. */
export async function requireDeveloper(): Promise<AppUser> {
  const user = await getCurrentUser();
  switch (accessDecision(user)) {
    case "login":
    case "banned":
      redirect("/login");
    case "change-password":
      redirect("/change-password");
    default:
      if (!isDeveloper(user)) redirect("/");
      return user as AppUser;
  }
}
