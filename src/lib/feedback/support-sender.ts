import "server-only";
import { runAsSystem } from "@/lib/tenant/system";

// Plan 079, Unit 4: the "Cellarhand Support" identity the clarification loop sends DMs as.
// The in-app DM core requires a real Member of the tenant as sender (there is no bot identity),
// so we keep ONE global support User referenced by a per-tenant Member row.
//
// NON-AUTHENTICATABLE (council C-4): this User never gets a credential `Account`, so it cannot
// log in (Better Auth credential login requires an Account with a password; social sign-up is
// disabled for unknown users). It exists only as a message sender.

export const SUPPORT_USER_ID = "user_cellarhand_support";
export const SUPPORT_USER_EMAIL = "support@cellarhand.system";
export const SUPPORT_USER_NAME = "Cellarhand Support";

export type SupportSender = { userId: string; email: string };

/**
 * Find-or-create the global support User and ensure it is a Member of `tenantId`.
 * Idempotent. Runs as the system owner (writes to the global user/member tables, which
 * app_rls may not create at runtime). Call at clarification time and from the backfill.
 */
export async function ensureSupportSenderForTenant(tenantId: string): Promise<SupportSender> {
  if (!tenantId) throw new Error("ensureSupportSenderForTenant: tenantId required");
  return runAsSystem(async (db) => {
    const user = await db.user.upsert({
      where: { email: SUPPORT_USER_EMAIL },
      update: { name: SUPPORT_USER_NAME },
      create: {
        id: SUPPORT_USER_ID,
        email: SUPPORT_USER_EMAIL,
        name: SUPPORT_USER_NAME,
        emailVerified: true,
        mustChangePassword: false,
        // deliberately NO credential Account → cannot authenticate.
      },
    });
    const member = await db.member.findFirst({
      where: { organizationId: tenantId, userId: user.id },
      select: { id: true },
    });
    if (!member) {
      await db.member.create({
        data: { organizationId: tenantId, userId: user.id, role: "member" },
      });
    }
    return { userId: user.id, email: user.email };
  });
}
