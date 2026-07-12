"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import { createEquipmentCore, updateEquipmentCore, archiveEquipmentCore, type EquipmentInput } from "@/lib/equipment/equipment";

// Plan 053 B10: equipment registry CRUD — admin/owner only (like template authoring). The advisory
// task↔equipment link is created as part of work-order creation (createWorkOrderFromBuildsAction), not here.

function revalidateEquipment() {
  revalidatePath("/setup/equipment");
  revalidatePath("/work-orders/new"); // the builder's equipment picker reads the registry
}

export const createEquipmentAction = adminAction(async ({ actor }, input: EquipmentInput) => {
  const res = await createEquipmentCore(actor, input);
  revalidateEquipment();
  return res;
});

export const updateEquipmentAction = adminAction(async ({ actor }, input: { id: string } & Partial<EquipmentInput>) => {
  const res = await updateEquipmentCore(actor, input);
  revalidateEquipment();
  return res;
});

export const archiveEquipmentAction = adminAction(async ({ actor }, input: { id: string; active: boolean }) => {
  const res = await archiveEquipmentCore(actor, input);
  revalidateEquipment();
  return res;
});
