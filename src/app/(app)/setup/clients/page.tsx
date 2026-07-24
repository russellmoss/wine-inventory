import { notFound, redirect } from "next/navigation";
import { requireReadyUser, requireActiveTenant, isTenantAdminLike } from "@/lib/dal";
import { isCustomCrushEnabled } from "@/lib/settings/data";
import { listOwnersCore } from "@/lib/owner/data";
import { ClientsAdmin } from "./ClientsAdmin";

// Plan 093 follow-on: Setup → Clients. The reference-data screen for custom-crush Owners. Admin-only and
// gated on the custom-crush program (the nav hides it when off; a direct visit redirects to Settings).

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const user = await requireReadyUser();
  await requireActiveTenant();
  if (!isTenantAdminLike(user)) notFound();
  if (!(await isCustomCrushEnabled())) redirect("/settings");

  const owners = await listOwnersCore();
  return <ClientsAdmin owners={owners.map((o) => ({ id: o.id, name: o.name, kind: o.kind, isActive: o.isActive }))} />;
}
