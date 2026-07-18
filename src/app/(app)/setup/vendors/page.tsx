import { requireReadyUser, isTenantAdminLike } from "@/lib/dal";
import { listVendors } from "@/lib/vendors/vendors";
import { listVendorImportCandidates } from "@/lib/vendors/vendor-import-core";
import { VendorsClient } from "./VendorsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vendors" };

// Plan 069: the vendor registry. Add/edit is available to any ready user (create/update actions are
// ready-user gated, since vendors are created inline from the non-admin expendables flow); archive/restore
// is admin-only. Includes inactive vendors so they can be restored (history-safe).
// Plan 075: admins also see the QBO vendor-import review queue (pull + accept/reject/merge).
export default async function VendorsPage() {
  const user = await requireReadyUser();
  const tenantId = user.activeOrganizationId;
  if (!tenantId) return <div style={{ padding: 24 }}>Your account isn&apos;t attached to a winery.</div>;
  const isAdmin = isTenantAdminLike(user);
  const vendors = await listVendors({ tenantId });
  // The import queue + pull are admin/developer-only (same gate the actions enforce).
  const importCandidates = isAdmin ? await listVendorImportCandidates({ tenantId }) : [];
  return <VendorsClient vendors={vendors} isAdmin={isAdmin} importCandidates={importCandidates} />;
}
