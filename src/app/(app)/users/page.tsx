import { requireAdmin } from "@/lib/dal";
import { isAssignableRole, isDeveloper } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { UsersClient, type UserRow } from "./UsersClient";

export default async function UsersPage() {
  const me = await requireAdmin();
  const viewerIsDeveloper = isDeveloper(me);
  const [users, vineyards, prefs] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, banned: true, mustChangePassword: true, vineyardMemberships: { select: { vineyardId: true } } },
    }),
    prisma.vineyard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.complianceReminderPreference.findMany({ select: { userId: true, remindersEnabled: true } }),
  ]);
  const reminderOn = new Map(prefs.map((p) => [p.userId, p.remindersEnabled]));
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: isAssignableRole(u.role) ? u.role : "user",
    banned: !!u.banned,
    mustChangePassword: !!u.mustChangePassword,
    isSelf: u.id === me.id,
    vineyardIds: u.vineyardMemberships.map((m) => m.vineyardId),
    reminderEmails: reminderOn.get(u.id) ?? false,
  }));
  return <UsersClient users={rows} vineyards={vineyards} viewerIsDeveloper={viewerIsDeveloper} />;
}
