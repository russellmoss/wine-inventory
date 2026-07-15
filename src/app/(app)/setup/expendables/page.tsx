import { listMaterials } from "@/lib/cellar/materials";
import { listVendors } from "@/lib/vendors/vendors";
import { ExpendablesClient } from "./ExpendablesClient";

export const metadata = { title: "Expendables" };

// Phase 8 (Unit 12): the supply catalog + stock management surface. Includes inactive materials so they
// can be reactivated (history-safe). On-hand is summed over open SupplyLots (listMaterials). Plan 069:
// also loads active vendors for the mandatory vendor picker in the add/edit modal.
export default async function ExpendablesPage() {
  const [materials, vendors] = await Promise.all([
    listMaterials({ includeInactive: true }),
    listVendors({ activeOnly: true }),
  ]);
  return <ExpendablesClient materials={materials} vendors={vendors} />;
}
