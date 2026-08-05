import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { listTemplatesForBuilder } from "@/lib/work-orders/data";
import { TemplatesClient } from "./TemplatesClient";
import { HubSectionNav } from "@/components/nav/HubSectionNav";

export const dynamic = "force-dynamic";

// Plan 034 Unit 6: the work-order template builder list. Nested under Work Orders (design review), with
// an Active|Archived toggle (?view=archived). Authoring is admin-gated; all users can still browse +
// issue work orders from templates.
type TemplatesPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Plan 104 — a SECTION of /work-orders, so it carries the same strip as its hub.
    Without it the strip is a one-way door: you use it once and it disappears. */
export default async function TemplatesPage(props: TemplatesPageProps) {
  return (
    <>
      <HubSectionNav hub="/work-orders" current="/work-orders/templates" />
      <TemplatesPageBody {...props} />
    </>
  );
}

async function TemplatesPageBody({
  searchParams,
}: TemplatesPageProps) {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  const sp = await searchParams;
  const archived = sp.view === "archived";
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const templates = await listTemplatesForBuilder(tenantId, { archived });
  return <TemplatesClient templates={templates} view={archived ? "archived" : "active"} isAdmin={isTenantAdminLike(user)} />;
}
