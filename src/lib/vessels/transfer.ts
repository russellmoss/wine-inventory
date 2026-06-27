"use server";

import { revalidatePath } from "next/cache";
import { action } from "@/lib/actions";
import {
  rackWineCore,
  revertTransferCore,
  findRevertableTransfer as findRevertableTransferCore,
  type TransferWineInput,
} from "./rack-core";

export type { TransferWineInput, TransferWineResult, RevertTransferResult } from "./rack-core";

const PATHS = ["/bulk", "/vessels"];

/** List the most recent revertable rack (read; re-exported for the assistant tool). */
export async function findRevertableTransfer(opts: { vesselId?: string } = {}) {
  return findRevertableTransferCore(opts);
}

export const transferWine = action(async (ctx, input: TransferWineInput) => {
  const result = await rackWineCore(ctx.actor, input);
  for (const p of PATHS) revalidatePath(p);
  return result;
});

export const revertTransfer = action(async (ctx, input: { transferId: string }) => {
  const result = await revertTransferCore(ctx.actor, input);
  for (const p of PATHS) revalidatePath(p);
  return result;
});
