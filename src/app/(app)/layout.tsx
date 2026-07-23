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
import { WineryTimeZoneProvider } from "@/components/time/WineryTimeZoneProvider";
import { getWineryTimeZone } from "@/lib/settings/data";
import { DEFAULT_CURRENCY } from "@/lib/money/currency";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireReadyUser();
  const isAdmin = isTenantAdminLike(user);
  const effectiveTenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  const inboxEnabled = isInboxEnabled();
  // Every badge/setting read below is tenant-scoped, so each is gated on effectiveTenantId:
  // requireReadyUser admits a user with no resolvable active org (developer without a support
  // session, revoked/absent membership), and a tenant-scoped `prisma` read throws for them. Without
  // these guards the shell itself 500s on a full load (an error the page-level (app)/error.tsx can't
  // catch, since a layout error bubbles past it) — leaving that user with no way into the app at all.
  const [pendingSamples, sparklingEnabled, complianceDeadlines, pendingWorkOrders, currency, unreadMessages, wineryTimeZone] = await Promise.all([
    effectiveTenantId ? countOpenSamples() : Promise.resolve(0),
    effectiveTenantId ? isSparklingEnabled() : Promise.resolve(false),
    isAdmin && effectiveTenantId ? openDeadlineBadge(effectiveTenantId, new Date()) : Promise.resolve({ count: 0, urgent: false }),
    effectiveTenantId ? countPendingApprovalWorkOrders(effectiveTenantId) : Promise.resolve(0),
    effectiveTenantId ? getTenantCurrency() : Promise.resolve(DEFAULT_CURRENCY),
    inboxEnabled && effectiveTenantId ? countUnreadInbox(effectiveTenantId, user.id) : Promise.resolve(0),
    effectiveTenantId ? getWineryTimeZone() : Promise.resolve(null),
  ]);
  // Developer diagnostics (Plan 080) are developer-only, so the tenant-name lookup the indicator
  // needs is too — a normal user's load is unchanged. `organization` is a global auth table, so this
  // needs no tenant context. The indicator must name the tenant whose data is being captured.
  const diagnosticsTenantName =
    user.role === "developer" && effectiveTenantId
      ? (user.supportOrganizationName ??
          (await prisma.organization.findUnique({
            where: { id: effectiveTenantId },
            select: { name: true },
          }))?.name ??
          effectiveTenantId)
      : null;
  return (
    <CurrencyProvider code={currency}>
      <WineryTimeZoneProvider zone={wineryTimeZone}>
      <AppShell user={user} pendingSamples={pendingSamples} pendingWorkOrders={pendingWorkOrders} sparklingEnabled={sparklingEnabled} complianceDeadlines={complianceDeadlines} voiceEnabled={voiceEnabled()} inboxEnabled={inboxEnabled} unreadMessages={unreadMessages} diagnosticsTenantName={diagnosticsTenantName}>
        {children}
      </AppShell>
      </WineryTimeZoneProvider>
    </CurrencyProvider>
  );
}
