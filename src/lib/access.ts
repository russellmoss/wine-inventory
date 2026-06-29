// Pure access-control logic. No server-only imports so it is unit-testable.

export type AppUser = {
  id: string;
  name: string | null;
  email: string;
  role: string | null;
  banned: boolean | null;
  mustChangePassword: boolean | null;
  vineyardIds: string[]; // D9: a manager's vineyard MEMBERSHIP set (admins reach all)
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
 * Can this user act on the given vineyard? Admins reach any vineyard; a manager
 * (role "user") only vineyards in their membership SET (D9). Used server-side by
 * every field-note / harvest mutation + read to scope managers.
 */
export function canAccessVineyard(user: AppUser | null, vineyardId: string): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
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
  if (user.role === "admin") return true;
  const mine = new Set(user.vineyardIds);
  return lotSourceVineyardIds.some((id) => mine.has(id));
}
