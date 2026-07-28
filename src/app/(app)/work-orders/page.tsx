import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { getWorkOrderDashboard, getWorkOrderArchive, getWorkOrderPickers, listTemplatesWithSpec, listLocations } from "@/lib/work-orders/data";
import { parseArchiveFilters, parseOpenFilters } from "@/lib/work-orders/archive-filters";
import { WorkOrdersClient } from "./WorkOrdersClient";
import { ArchiveClient } from "./ArchiveClient";
import { HubSectionNav } from "@/components/nav/HubSectionNav";

export const dynamic = "force-dynamic";

type WorkOrdersPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Plan 104 Unit 5 — Review, Templates and Task types are reached from here.
 *
 * The strip is hoisted above the body rather than repeated inside it because the
 * body has four return paths (archive / archive-without-tenant / open /
 * open-without-tenant) and the sub-nav has to be on all four. Wrapping is also what
 * keeps it off `/work-orders/[id]/execute` — a layout.tsx would put section tabs on
 * the wet-hands capture screen (D1).
 */
export default async function WorkOrdersPage(props: WorkOrdersPageProps) {
  return (
    <>
      <HubSectionNav hub="/work-orders" />
      <WorkOrdersHubBody {...props} />
    </>
  );
}

async function WorkOrdersHubBody({ searchParams }: WorkOrdersPageProps) {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  const sp = await searchParams;

  // D1: the archive is the same route with ?view=archive (a toggle, not a separate nav item).
  if (sp.view === "archive") {
    if (!tenantId) {
      return <ArchiveClient rows={[]} total={0} page={1} pageSize={25} filters={{}} vessels={[]} templates={[]} locations={[]} />;
    }
    const filters = parseArchiveFilters(sp);
    const page = Math.max(1, Number(Array.isArray(sp.page) ? sp.page[0] : sp.page) || 1);
    const [archive, pickers, templates, locations] = await Promise.all([
      getWorkOrderArchive(tenantId, filters, page),
      getWorkOrderPickers(tenantId),
      listTemplatesWithSpec(tenantId),
      listLocations(tenantId),
    ]);
    return (
      <ArchiveClient
        rows={archive.rows}
        total={archive.total}
        page={archive.page}
        pageSize={archive.pageSize}
        filters={filters}
        vessels={pickers.vessels}
        templates={templates.map((t) => ({ id: t.id, name: t.name }))}
        locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      />
    );
  }

  if (!tenantId) return <WorkOrdersClient dashboard={{ buckets: { overdue: [], today: [], upcoming: [], unscheduled: [] }, pendingApproval: [], counts: {} }} isAdmin={false} />;
  // Open view — same filters as the archive (status/date/assignee/template/vessel/search).
  const openFilters = parseOpenFilters(sp);
  const [dashboard, pickers, templates, locations] = await Promise.all([
    getWorkOrderDashboard(tenantId, new Date(), openFilters),
    getWorkOrderPickers(tenantId),
    listTemplatesWithSpec(tenantId),
    listLocations(tenantId),
  ]);
  return (
    <WorkOrdersClient
      dashboard={dashboard}
      isAdmin={isTenantAdminLike(user)}
      filters={openFilters}
      vessels={pickers.vessels}
      templates={templates.map((t) => ({ id: t.id, name: t.name }))}
      locations={locations.map((l) => ({ id: l.id, name: l.name }))}
      currentUserEmail={user.email ?? null}
    />
  );
}
