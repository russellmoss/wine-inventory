import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { AppShell } from "@/components/AppShell";
import { countOpenSamples } from "@/lib/chemistry/data";
import { isSparklingEnabled, getTenantCurrency } from "@/lib/settings/data";
import { openDeadlineBadge } from "@/lib/compliance/reminders";
import { countPendingApprovalWorkOrders } from "@/lib/work-orders/data";
import { countUnreadInbox } from "@/lib/inbox/notifications";
import { isInboxEnabled } from "@/lib/inbox/flag";
import { voiceEnabled } from "@/lib/voice/config";
import { CurrencyProvider } from "@/components/money/CurrencyProvider";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReadyUser();
  const isAdmin = isTenantAdminLike(user);
  const effectiveTenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  const inboxEnabled = isInboxEnabled();
  const [pendingSamples, sparklingEnabled, complianceDeadlines, pendingWorkOrders, currency, unreadMessages] = await Promise.all([
    countOpenSamples(),
    isSparklingEnabled(),
    isAdmin && effectiveTenantId ? openDeadlineBadge(effectiveTenantId, new Date()) : Promise.resolve({ count: 0, urgent: false }),
    effectiveTenantId ? countPendingApprovalWorkOrders(effectiveTenantId) : Promise.resolve(0),
    getTenantCurrency(),
    inboxEnabled && effectiveTenantId ? countUnreadInbox(effectiveTenantId, user.id) : Promise.resolve(0),
  ]);
  return (
    <CurrencyProvider code={currency}>
      <AppShell user={user} pendingSamples={pendingSamples} pendingWorkOrders={pendingWorkOrders} sparklingEnabled={sparklingEnabled} complianceDeadlines={complianceDeadlines} voiceEnabled={voiceEnabled()} inboxEnabled={inboxEnabled} unreadMessages={unreadMessages}>
        {children}
      </AppShell>
    </CurrencyProvider>
  );
}
