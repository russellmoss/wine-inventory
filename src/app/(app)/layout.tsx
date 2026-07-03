import { requireReadyUser } from "@/lib/dal";
import { AppShell } from "@/components/AppShell";
import { countOpenSamples } from "@/lib/chemistry/data";
import { isSparklingEnabled } from "@/lib/settings/data";
import { openDeadlineBadge } from "@/lib/compliance/reminders";
import { countPendingApprovalWorkOrders } from "@/lib/work-orders/data";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReadyUser();
  const isAdmin = user.role === "admin";
  const [pendingSamples, sparklingEnabled, complianceDeadlines, pendingWorkOrders] = await Promise.all([
    countOpenSamples(),
    isSparklingEnabled(),
    isAdmin && user.activeOrganizationId ? openDeadlineBadge(user.activeOrganizationId, new Date()) : Promise.resolve({ count: 0, urgent: false }),
    user.activeOrganizationId ? countPendingApprovalWorkOrders(user.activeOrganizationId) : Promise.resolve(0),
  ]);
  return (
    <AppShell user={user} pendingSamples={pendingSamples} pendingWorkOrders={pendingWorkOrders} sparklingEnabled={sparklingEnabled} complianceDeadlines={complianceDeadlines}>
      {children}
    </AppShell>
  );
}
