import { notFound } from "next/navigation";
import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { isInboxEnabled } from "@/lib/inbox/flag";
import { listNotifications } from "@/lib/inbox/notifications";
import { listThreads, getThread, listTenantRecipients } from "@/lib/inbox/direct-messages";
import { listMyWorkOrders, listMyTickets } from "@/app/(app)/inbox/buckets";
import { parseBucket, type InboxBucket } from "@/lib/inbox/routes";
import type { TicketFilter, WorkOrderFilter } from "@/lib/inbox/types";
import { InboxClient } from "@/app/(app)/inbox/InboxClient";

export const dynamic = "force-dynamic"; // per-user reads; never statically cached (K12)

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function InboxPage({ searchParams }: { searchParams: Promise<SP> }) {
  if (!isInboxEnabled()) notFound();
  const user = await requireReadyUser();
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) notFound();
  const isAdmin = isTenantAdminLike(user);
  const isDeveloper = user.role === "developer";

  const sp = await searchParams;
  const bucket: InboxBucket = parseBucket(one(sp.bucket));
  const filter = one(sp.filter);
  const threadId = one(sp.thread);
  // A ticket notification deep-links to `?bucket=tickets&ticket=<id>`; InboxClient preselects it in the
  // reader. Load BOTH filters' tickets when a ticket is targeted so a RESOLVED ticket (which isn't in
  // the default "open" list) is still present to select — otherwise "Open" would land on a blank pane.
  const ticketId = one(sp.ticket);

  const ticketFilters: TicketFilter[] =
    bucket === "tickets"
      ? ticketId
        ? ["open", "closed"]
        : [((filter as TicketFilter) || "open")]
      : [];

  const [notifications, workOrders, tickets, threads, threadDetail, recipients] = await Promise.all([
    bucket === "all" ? listNotifications(tenantId, user.id, { limit: 100 }) : Promise.resolve([]),
    bucket === "wo"
      ? listMyWorkOrders(tenantId, user.id, (filter as WorkOrderFilter) || "open")
      : Promise.resolve([]),
    ticketFilters.length
      ? Promise.all(ticketFilters.map((f) => listMyTickets(tenantId, user.id, f))).then((lists) => {
          // De-dupe when both filters are loaded (they never overlap in practice, but be safe).
          const seen = new Set<string>();
          return lists.flat().filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
        })
      : Promise.resolve([]),
    bucket === "dm" ? listThreads(tenantId, user.id) : Promise.resolve([]),
    bucket === "dm" && threadId ? getThread(tenantId, user.id, threadId) : Promise.resolve(null),
    bucket === "dm" ? listTenantRecipients(tenantId, user.id) : Promise.resolve([]),
  ]);

  return (
    <InboxClient
      me={{ userId: user.id, email: user.email }}
      bucket={bucket}
      filter={filter ?? null}
      selectedThreadId={threadId ?? null}
      selectedTicketId={ticketId ?? null}
      notifications={notifications}
      workOrders={workOrders}
      tickets={tickets}
      threads={threads}
      threadDetail={threadDetail}
      recipients={recipients}
      isAdmin={isAdmin}
      isDeveloper={isDeveloper}
    />
  );
}
