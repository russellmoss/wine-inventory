import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { UsersClient, type UserRow } from "./UsersClient";

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, vineyards] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, banned: true, mustChangePassword: true, vineyardMemberships: { select: { vineyardId: true } } },
    }),
    prisma.vineyard.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role === "admin" ? "admin" : "user",
    banned: !!u.banned,
    mustChangePassword: !!u.mustChangePassword,
    isSelf: u.id === me.id,
    vineyardIds: u.vineyardMemberships.map((m) => m.vineyardId),
  }));
  return <UsersClient users={rows} vineyards={vineyards} />;
}
