import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accessDecision, type AppUser } from "@/lib/access";

export { accessDecision, canManagerAccessVineyard } from "@/lib/access";
export type { AppUser, AccessDecision } from "@/lib/access";

/**
 * THE canonical column set for building an AppUser. Every site that loads a user
 * into an AppUser MUST go through `userSelect` + `toAppUser`, so adding a field
 * (e.g. assignedVineyardId) can never silently skip a construction site.
 */
export const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  banned: true,
  mustChangePassword: true,
  assignedVineyardId: true,
} as const;

type UserRecord = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  mustChangePassword: boolean | null;
  assignedVineyardId: string | null;
};

/** Map a DB user record (selected via `userSelect`) into the AppUser domain shape. */
export function toAppUser(record: UserRecord): AppUser {
  return {
    id: record.id,
    name: record.name ?? null,
    email: record.email,
    role: record.role ?? null,
    banned: record.banned ?? false,
    mustChangePassword: record.mustChangePassword ?? false,
    assignedVineyardId: record.assignedVineyardId ?? null,
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
  return toAppUser(record);
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
