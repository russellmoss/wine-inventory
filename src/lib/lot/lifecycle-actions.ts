"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import { runInTenantTx } from "@/lib/tenant/tx";
import { archiveLotTx, unarchiveLotTx, type LotStatus } from "@/lib/lot/lifecycle";

export const archiveLotAction = adminAction(
  async ({ actor }, input: { lotId: string; reason?: string | null }): Promise<{ lotId: string; status: LotStatus }> => {
    const result = await runInTenantTx((tx) => archiveLotTx(tx, actor, input));
    revalidatePath(`/lots/${input.lotId}`);
    revalidatePath("/lots");
    return result;
  },
);

export const unarchiveLotAction = adminAction(
  async ({ actor }, input: { lotId: string }): Promise<{ lotId: string; status: LotStatus }> => {
    const result = await runInTenantTx((tx) => unarchiveLotTx(tx, actor, input));
    revalidatePath(`/lots/${input.lotId}`);
    revalidatePath("/lots");
    return result;
  },
);
