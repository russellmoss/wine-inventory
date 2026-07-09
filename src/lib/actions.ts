import "server-only";
import { getCurrentUser } from "@/lib/dal";
import { accessDecision, type AppUser } from "@/lib/access";
import { ActionError } from "@/lib/action-error";
import { runAsTenant } from "@/lib/tenant/context";

export { ActionError } from "@/lib/action-error";

export type ActionCtx = {
  user: AppUser;
  // `tenantId` is the VERIFIED active organization (K9) — always present inside an action (a user
  // with no active org is rejected before the handler runs). Flows into writeAudit + every mutation.
  actor: { actorUserId: string; actorEmail: string; tenantId: string };
};

/** The active org (tenant) for a resolved user, or reject (K9): tenant comes ONLY from the verified
 *  session's active org, never from client input. */
function resolveTenantId(user: AppUser): string {
  if (user.supportOrganizationId) return user.supportOrganizationId;
  if (!user.activeOrganizationId) {
    throw new ActionError("Your account isn't attached to a winery.", "FORBIDDEN");
  }
  return user.activeOrganizationId;
}

/** Resolve + authorize the acting user for a server action (throws, never redirects). */
export async function getActionUser({ admin = false } = {}): Promise<AppUser> {
  const user = await getCurrentUser();
  const decision = accessDecision(user, { requireAdmin: admin });
  switch (decision) {
    case "login":
    case "banned":
      throw new ActionError("You must be signed in.", "UNAUTHENTICATED");
    case "change-password":
      throw new ActionError("You must change your password first.", "MUST_CHANGE_PASSWORD");
    case "forbidden":
      throw new ActionError("Admins only.", "FORBIDDEN");
    default:
      return user as AppUser;
  }
}

/**
 * Wrap a server action: authorize (ready user) -> run handler with a context that
 * carries the audit actor. Each handler does its mutation + writeAudit in one
 * prisma.$transaction.
 */
export function action<TArgs extends unknown[], TResult>(
  handler: (ctx: ActionCtx, ...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const user = await getActionUser();
    const tenantId = resolveTenantId(user);
    // Run the whole handler inside the tenant context so every Prisma op is tenant-scoped (RLS).
    return runAsTenant(tenantId, () =>
      handler({ user, actor: { actorUserId: user.id, actorEmail: user.email, tenantId } }, ...args),
    );
  };
}

/** Same as `action`, but admin-only. */
export function adminAction<TArgs extends unknown[], TResult>(
  handler: (ctx: ActionCtx, ...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const user = await getActionUser({ admin: true });
    const tenantId = resolveTenantId(user);
    return runAsTenant(tenantId, () =>
      handler({ user, actor: { actorUserId: user.id, actorEmail: user.email, tenantId } }, ...args),
    );
  };
}
