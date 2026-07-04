import Link from "next/link";
import { requireReadyUser } from "@/lib/dal";
import { getTemplateDetail, getWorkOrderPickers } from "@/lib/work-orders/data";
import { TemplateEditorClient } from "../../TemplateEditorClient";
import type { TemplateTaskSpec } from "@/lib/work-orders/template-vocabulary";

export const dynamic = "force-dynamic";

export default async function EditTemplatePage({ params }: { params: Promise<{ templateId: string }> }) {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  const { templateId } = await params;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;

  const back = (msg: string) => (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: 24 }}>
      <Link href="/work-orders/templates" style={{ fontSize: 13, color: "var(--text-muted)" }}>← Templates</Link>
      <div style={{ marginTop: 12 }}>{msg}</div>
    </div>
  );

  if (user.role !== "admin") return back("Only an admin can create or edit templates.");
  const template = await getTemplateDetail(tenantId, templateId);
  if (!template) return back("That template no longer exists.");
  if (template.isSystem) return back("System templates can't be edited — clone it first, then customize the copy.");

  const pickers = await getWorkOrderPickers(tenantId);
  const spec = (template.spec ?? { tasks: [] }) as { tasks: TemplateTaskSpec[] };
  return (
    <TemplateEditorClient
      mode="edit"
      templateId={template.id}
      initial={{ name: template.name, description: template.description, category: template.category, tasks: spec.tasks }}
      materials={pickers.materials.map((m) => ({ id: m.id, label: m.label, unit: m.unit }))}
    />
  );
}
