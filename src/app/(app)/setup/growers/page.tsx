import { notFound } from "next/navigation";
import { requireReadyUser, requireActiveTenant, isTenantAdminLike } from "@/lib/dal";
import { listGrowersCore } from "@/lib/grower/data";
import { GrowersAdmin } from "./GrowersAdmin";

// Plan 093 follow-on: Setup → Growers. The reference-data screen for the party that farmed the fruit.
// Admin-only, always available (not gated on custom crush — estate vineyards have growers too).

export const dynamic = "force-dynamic";

export default async function GrowersPage() {
  const user = await requireReadyUser();
  await requireActiveTenant();
  if (!isTenantAdminLike(user)) notFound();

  const growers = await listGrowersCore();
  return <GrowersAdmin growers={growers.map((g) => ({ id: g.id, name: g.name, company: g.company, contact: g.contact, isEstate: g.isEstate, isActive: g.isActive }))} />;
}
