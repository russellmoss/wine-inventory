import { requireReadyUser } from "@/lib/dal";
import { listTemplatesForBuilder } from "@/lib/work-orders/data";
import { TemplatesClient } from "./TemplatesClient";

export const dynamic = "force-dynamic";

// Plan 034 Unit 6: the work-order template builder list. Nested under Work Orders (design review), with
// an Active|Archived toggle (?view=archived). Authoring is admin-gated; all users can still browse +
// issue work orders from templates.
export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  const sp = await searchParams;
  const archived = sp.view === "archived";
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const templates = await listTemplatesForBuilder(tenantId, { archived });
  return <TemplatesClient templates={templates} view={archived ? "archived" : "active"} isAdmin={user.role === "admin"} />;
}
