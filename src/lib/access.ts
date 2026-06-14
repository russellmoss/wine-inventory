// Pure access-control logic. No server-only imports so it is unit-testable.

export type AppUser = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  mustChangePassword: boolean | null;
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
