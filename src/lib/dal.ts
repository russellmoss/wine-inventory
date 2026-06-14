import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/lib/auth";
import { accessDecision, type AppUser } from "@/lib/access";

export { accessDecision } from "@/lib/access";
export type { AppUser, AccessDecision } from "@/lib/access";

/** Read the current user from the session, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<AppUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const u = session.user as unknown as AppUser;
  return {
    id: u.id,
    name: u.name ?? null,
    email: u.email,
    role: u.role ?? null,
    banned: u.banned ?? false,
    mustChangePassword: u.mustChangePassword ?? false,
  };
});

/** Only ensures a session exists (no ready check). Used by /change-password. */
export async function requireSession(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
