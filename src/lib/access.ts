// Pure access-control logic. No server-only imports so it is unit-testable.

export type AppUser = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  mustChangePassword: boolean | null;
  assignedVineyardId: string | null; // managers are scoped to this one vineyard
};

export type AccessDecision = "ok" | "login" | "banned" | "change-password" | "forbidden";

export function accessDecision(
  user: AppUser | null,
  opts: { requireAdmin?: boolean } = {},
): AccessDecision {
  if (!user) return "login";
  if (user.banned) return "banned";
  if (user.mustChangePassword) return "change-password";
  if (opts.requireAdmin && user.role !== "admin") return "forbidden";
  return "ok";
}

/**
 * Can this user act on the given vineyard? Admins can reach any vineyard;
 * a manager (role "user") only their single assigned vineyard. Used server-side
 * by every field-note / harvest mutation + read to scope managers.
 */
export function canManagerAccessVineyard(user: AppUser | null, vineyardId: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return user.assignedVineyardId != null && user.assignedVineyardId === vineyardId;
}
