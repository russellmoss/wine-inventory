import { requireReadyUser } from "@/lib/dal";
import { listTemplatesWithSpec, getWorkOrderPickers } from "@/lib/work-orders/data";
import { NewWorkOrderClient } from "./NewWorkOrderClient";

export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const sp = await searchParams;
  const initialTemplateId = typeof sp.template === "string" ? sp.template : undefined;
  const [templates, pickers] = await Promise.all([listTemplatesWithSpec(tenantId), getWorkOrderPickers(tenantId)]);
  return <NewWorkOrderClient templates={templates} pickers={pickers} initialTemplateId={initialTemplateId} />;
}
