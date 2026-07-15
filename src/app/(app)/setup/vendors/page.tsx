import { requireReadyUser } from "@/lib/dal";
import { listVendors } from "@/lib/vendors/vendors";
import { VendorsClient } from "./VendorsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendors" };

// Plan 069: the vendor registry. Add/edit is available to any ready user (create/update actions are
// ready-user gated, since vendors are created inline from the non-admin expendables flow); archive/restore
// is admin-only. Includes inactive vendors so they can be restored (history-safe).
export default async function VendorsPage() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const vendors = await listVendors({ tenantId });
  return <VendorsClient vendors={vendors} isAdmin={user.role === "admin" || user.role === "owner"} />;
}
