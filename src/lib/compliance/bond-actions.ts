"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import {
  createBondCore,
  updateBondCore,
  setPrimaryBondCore,
  listBonds,
  type BondInput,
  type BondRow,
} from "@/lib/compliance/bond";

// Admin-gated Bond CRUD (Phase 2, BOND-1 / ux-principle 9). Bonds are tenant-editable self-serve —
// NOT a support ticket. High-risk bond config gets the coarse admin gate (Owner-Based Permissions are
// Phase 23). The derivation + read helpers live in bond.ts (script-safe); these are the UI seams.

function revalidate() {
  revalidatePath("/settings");
  revalidatePath("/compliance");
}

export const listBondsAction = adminAction(async (): Promise<BondRow[]> => {
  return listBonds();
});

export const createBondAction = adminAction(async (_ctx, input: BondInput): Promise<BondRow> => {
  const bond = await createBondCore(input);
  revalidate();
  return bond;
});

export const updateBondAction = adminAction(async (_ctx, bondId: string, input: BondInput): Promise<BondRow> => {
  const bond = await updateBondCore(bondId, input);
  revalidate();
  return bond;
});

export const setPrimaryBondAction = adminAction(async (_ctx, bondId: string): Promise<{ ok: true }> => {
  await setPrimaryBondCore(bondId);
  revalidate();
  return { ok: true };
});
