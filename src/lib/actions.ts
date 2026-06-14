import "server-only";
import { getCurrentUser } from "@/lib/dal";
import { accessDecision, type AppUser } from "@/lib/access";
import { ActionError } from "@/lib/action-error";

export { ActionError } from "@/lib/action-error";

export type ActionCtx = {
  user: AppUser;
  actor: { actorUserId: string; actorEmail: string };
};

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
    return handler({ user, actor: { actorUserId: user.id, actorEmail: user.email } }, ...args);
  };
}

/** Same as `action`, but admin-only. */
export function adminAction<TArgs extends unknown[], TResult>(
  handler: (ctx: ActionCtx, ...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs) => {
    const user = await getActionUser({ admin: true });
    return handler({ user, actor: { actorUserId: user.id, actorEmail: user.email } }, ...args);
  };
}
