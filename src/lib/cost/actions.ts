"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import {
  receiveSupplyCore,
  setMaterialActiveCore,
  listMaterialLots,
  type ReceiveSupplyInput,
  type MaterialLotRow,
} from "@/lib/cellar/materials";
import { receiveBulkWineCostCore, type ReceiveBulkWineCostInput } from "@/lib/cost/receive";

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

/** Plan 072 Unit 10 (read side): per-lot history for a material's detail panel (lots + expiry + source docs).
 *  Read-only; the `action` wrapper scopes it to the caller's tenant (RLS). */
export const listMaterialLotsAction = action(
  async (_ctx, materialId: string): Promise<MaterialLotRow[]> => {
    return listMaterialLots(materialId);
  },
);

/** Activate/deactivate a supply in the catalog. */
export const setMaterialActiveAction = action(
  async ({ actor }, materialId: string, isActive: boolean): Promise<void> => {
    await setMaterialActiveCore(actor, materialId, isActive);
    revalidateStockSurfaces();
  },
);

/** Phase 8b (Unit 16, D20): record the purchase cost of a bulk-wine lot (a mid-DAG MATERIAL cost node). */
export const receiveBulkWineCostAction = action(
  async ({ actor }, input: ReceiveBulkWineCostInput): Promise<{ costLineId: string; operationId: number }> => {
    const res = await receiveBulkWineCostCore(actor, input);
    revalidatePath("/lots");
    revalidatePath(`/lots/${input.lotId}`);
    return res;
  },
);
