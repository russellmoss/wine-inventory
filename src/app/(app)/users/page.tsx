import { requireAdmin, requireActiveTenant } from "@/lib/dal";
import { loadVineyardMembershipIdsByUser } from "@/lib/users/vineyard-memberships";
import { isAssignableRole, isDeveloper } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { memberOfTenant } from "@/lib/users/scope";
import { UsersClient, type UserRow } from "./UsersClient";

export default async function UsersPage() {
  const me = await requireAdmin();
  await requireActiveTenant();
  const viewerIsDeveloper = isDeveloper(me);
  // #90: `User`/`Member` are GLOBAL, RLS-exempt auth tables, so the DB does NOT scope them by tenant —
  // an unscoped `user.findMany` leaks every winery's accounts. Scope to the viewer's effective tenant
  // (support org if impersonating via the developer console, else the verified active org). This is the
  // SAME key `resolveTenantFromSession` uses for the RLS-scoped reads below (vineyards/prefs), so the
  // whole page is one tenant. No effective tenant → nothing to manage.
  const effectiveTenant = me.supportOrganizationId ?? me.activeOrganizationId;
  const [users, vineyards, prefs] = await Promise.all([
    effectiveTenant
      ? prisma.user.findMany({
          where: memberOfTenant(effectiveTenant),
          orderBy: { createdAt: "asc" },
          select: { id: true, email: true, name: true, role: true, banned: true, mustChangePassword: true },
        })
      : Promise.resolve([]),
    prisma.vineyard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Tenant-scoped model (RLS already scopes to the session tenant); the explicit tenantId filter
    // makes the isolation self-evident and matches the user list above.
    effectiveTenant
      ? prisma.complianceReminderPreference.findMany({ where: { tenantId: effectiveTenant }, select: { userId: true, remindersEnabled: true } })
      : Promise.resolve([]),
  ]);
  // D9 memberships come from a SEPARATE tenant-scoped read, not a nested select on `user`: `user`
  // is GLOBAL so that query never sets `app.tenant_id`, and the RLS-forced `user_vineyard` join
  // would read back empty for every row (see src/lib/users/vineyard-memberships.ts). That
  // was silent DATA LOSS here, not just a display bug — the checkboxes render from these ids and
  // `setUserVineyards` REPLACES the whole set, so ticking one vineyard against an all-empty list
  // dropped every membership the user already had.
  const vineyardsByUser = effectiveTenant
    ? await loadVineyardMembershipIdsByUser(users.map((u) => u.id), effectiveTenant)
    : new Map<string, string[]>();
  const reminderOn = new Map(prefs.map((p) => [p.userId, p.remindersEnabled]));
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: isAssignableRole(u.role) ? u.role : "user",
    banned: !!u.banned,
    mustChangePassword: !!u.mustChangePassword,
    isSelf: u.id === me.id,
    vineyardIds: vineyardsByUser.get(u.id) ?? [],
    reminderEmails: reminderOn.get(u.id) ?? false,
  }));
  return <UsersClient users={rows} vineyards={vineyards} viewerIsDeveloper={viewerIsDeveloper} />;
}
