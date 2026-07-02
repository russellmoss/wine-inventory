"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import {
  receiveSupplyCore,
  setMaterialActiveCore,
  type ReceiveSupplyInput,
} from "@/lib/cellar/materials";

// Phase 8 (Unit 12): server actions for the expendables / supply-inventory surface. Receive-with-cost
// writes a costed SupplyLot; the active toggle is history-safe (never a hard delete). Both revalidate
// the surfaces that read on-hand so the picker + management page reflect the change immediately.

function revalidateStockSurfaces() {
  revalidatePath("/setup/expendables");
  revalidatePath("/bulk");
  revalidatePath("/ferment/process");
  revalidatePath("/inventory");
}

/** Receive a costed supply lot against an existing material (restock). */
export const receiveSupplyAction = action(
  async ({ actor }, input: ReceiveSupplyInput): Promise<{ supplyLotId: string }> => {
    const res = await receiveSupplyCore(actor, input);
    revalidateStockSurfaces();
    return res;
  },
);

/** Activate/deactivate a supply in the catalog. */
export const setMaterialActiveAction = action(
  async ({ actor }, materialId: string, isActive: boolean): Promise<void> => {
    await setMaterialActiveCore(actor, materialId, isActive);
    revalidateStockSurfaces();
  },
);
