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

/** List the most recent revertable rack (read; re-exported for the assistant tool). Wrapped in
 *  action() like its siblings so a banned / must-change-password session is rejected before any DB
 *  access and the read runs inside the tenant (RLS) scope — a top-level `"use server"` export is an
 *  independently-callable RPC target, so it must not bypass the auth chokepoint. */
export const findRevertableTransfer = action(async (_ctx, opts: { vesselId?: string } = {}) =>
  findRevertableTransferCore(opts),
);

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
