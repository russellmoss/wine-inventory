import { requireReadyUser } from "@/lib/dal";
import { getWorkOrderPickers, listOrgMembers, listDependableWorkOrders, listLocations, getTemplateWithCurrentSpec } from "@/lib/work-orders/data";
import { listEquipment } from "@/lib/equipment/equipment";
import { resolveTaskVocabulary } from "@/lib/work-orders/vocabulary-resolver";
import { templateSpecToSeedTasks } from "@/lib/work-orders/template-to-builder";
import { WorkOrderBuilderClient, type TemplateSeed } from "./WorkOrderBuilderClient";

export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string | string[] }>;
}) {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const sp = await searchParams;
  const templateId = Array.isArray(sp.template) ? sp.template[0] : sp.template;
  const [pickers, members, dependableWorkOrders, locations, equipment, vocab] = await Promise.all([
    getWorkOrderPickers(tenantId),
    listOrgMembers(tenantId),
    listDependableWorkOrders(tenantId),
    listLocations(tenantId),
    listEquipment(tenantId, { activeOnly: true }),
    resolveTaskVocabulary(),
  ]);

  // "Create a work order from this" on a template links here with ?template=<id>. Seed the builder from
  // that template's current spec so the tasks are already laid out. A missing/deleted/other-tenant id
  // (the read is tenant-scoped) just falls through to a blank builder — a stale link shouldn't 404.
  let seed: TemplateSeed | undefined;
  if (templateId) {
    const template = await getTemplateWithCurrentSpec(tenantId, templateId);
    const tasks = template ? templateSpecToSeedTasks(template.spec, vocab) : [];
    if (tasks.length > 0) seed = { title: template!.name, tasks };
  }

  return (
    <WorkOrderBuilderClient
      pickers={pickers}
      members={members}
      dependableWorkOrders={dependableWorkOrders}
      locations={locations}
      equipment={equipment.map((e) => ({ id: e.id, name: e.name, kind: e.kind }))}
      vocab={vocab}
      seed={seed}
    />
  );
}
