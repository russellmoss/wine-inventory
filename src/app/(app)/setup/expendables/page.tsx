import { listMaterials } from "@/lib/cellar/materials";
import { ExpendablesClient } from "./ExpendablesClient";

export const metadata = { title: "Expendables" };

// Phase 8 (Unit 12): the supply catalog + stock management surface. Includes inactive materials so they
// can be reactivated (history-safe). On-hand is summed over open SupplyLots (listMaterials).
export default async function ExpendablesPage() {
  const materials = await listMaterials({ includeInactive: true });
  return <ExpendablesClient materials={materials} />;
}
