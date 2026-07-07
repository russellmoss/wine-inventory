"use server";

import { revalidatePath } from "next/cache";
import { adminAction } from "@/lib/actions";
import { transferInBondCore, type TransferInBondInput, type TransferInBondResult } from "@/lib/compliance/transfer-in-bond-core";
import { returnToBondCore, type ReturnToBondInput, type ReturnToBondResult } from "@/lib/compliance/return-to-bond-core";
import { changeTaxClassCore, type ChangeTaxClassInput, type ChangeTaxClassResult } from "@/lib/compliance/tax-class-event-core";

// Phase 2 — admin-gated wrappers over the bond/tax-class op cores for the UI + assistant committers.
// High-risk compliance events (a transfer, a refund re-admission, a tax-class determination) all get
// the coarse admin gate (Owner-Based Permissions are Phase 23). The refusal/plain-language copy lives
// in the cores + the ledger error surface (e.g. the REMOVE_TAXPAID terminal message routes the user to
// Return-to-Bond; the cross-bond-blend block routes them to Transfer-in-Bond).

function revalidate() {
  revalidatePath("/compliance");
  revalidatePath("/bulk");
}

export const transferInBondAction = adminAction(async ({ actor }, input: TransferInBondInput): Promise<TransferInBondResult> => {
  const res = await transferInBondCore(actor, input);
  revalidate();
  return res;
});

export const returnToBondAction = adminAction(async ({ actor }, input: ReturnToBondInput): Promise<ReturnToBondResult> => {
  const res = await returnToBondCore(actor, input);
  revalidate();
  return res;
});

export const changeTaxClassAction = adminAction(async ({ actor }, input: ChangeTaxClassInput): Promise<ChangeTaxClassResult> => {
  const res = await changeTaxClassCore(actor, input);
  revalidate();
  return res;
});
