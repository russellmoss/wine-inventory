import Link from "next/link";
import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { getTemplateDetail } from "@/lib/work-orders/data";
import { TemplateDetailClient } from "./TemplateDetailClient";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  const { templateId } = await params;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const template = await getTemplateDetail(tenantId, templateId);
  if (!template) {
    return (
      <div style={{ maxWidth: 820, margin: "0 auto", padding: 24 }}>
        <Link href="/work-orders/templates" style={{ fontSize: 13, color: "var(--text-muted)" }}>← Templates</Link>
        <div style={{ marginTop: 12 }}>That template no longer exists.</div>
      </div>
    );
  }
  return <TemplateDetailClient template={template} isAdmin={isTenantAdminLike(user)} />;
}
