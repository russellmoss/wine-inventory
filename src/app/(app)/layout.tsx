import { requireReadyUser } from "@/lib/dal";
import { AppShell } from "@/components/AppShell";
import { countOpenSamples } from "@/lib/chemistry/data";
import { isSparklingEnabled, getTenantCurrency } from "@/lib/settings/data";
import { openDeadlineBadge } from "@/lib/compliance/reminders";
import { countPendingApprovalWorkOrders } from "@/lib/work-orders/data";
import { CurrencyProvider } from "@/components/money/CurrencyProvider";
import { voiceEnabled } from "@/lib/voice/config";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReadyUser();
  const isAdmin = user.role === "admin";
  const [pendingSamples, sparklingEnabled, complianceDeadlines, pendingWorkOrders, currency] = await Promise.all([
    countOpenSamples(),
    isSparklingEnabled(),
    isAdmin && user.activeOrganizationId ? openDeadlineBadge(user.activeOrganizationId, new Date()) : Promise.resolve({ count: 0, urgent: false }),
    user.activeOrganizationId ? countPendingApprovalWorkOrders(user.activeOrganizationId) : Promise.resolve(0),
    getTenantCurrency(),
  ]);
  return (
    <CurrencyProvider code={currency}>
      <AppShell user={user} pendingSamples={pendingSamples} pendingWorkOrders={pendingWorkOrders} sparklingEnabled={sparklingEnabled} complianceDeadlines={complianceDeadlines} voiceEnabled={voiceEnabled()}>
        {children}
      </AppShell>
    </CurrencyProvider>
  );
}
