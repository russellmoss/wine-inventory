"use server";

import { revalidatePath } from "next/cache";
import { action, adminAction, safeAdminAction } from "@/lib/actions";
import {
  createVendorCore,
  updateVendorCore,
  archiveVendorCore,
  mergeVendorsCore,
  removeVendorCore,
  getVendorUsage,
  type VendorInput,
} from "@/lib/vendors/vendors";
import type { VendorUsage } from "@/lib/vendors/vendors-shared";

// Plan 069: vendor CRUD server actions. create/update are READY-USER gated (`action`) because they run from
// the non-admin expendables intake flow (inline "+ create new vendor"). Archive is admin-only (`adminAction`),
// like other destructive setup ops. Cores live in vendors.ts; scripts/assistant call the cores directly.
// Plan 072: merge/remove are admin-only AND use `safeAdminAction` (return {ok:false,error} instead of throw)
// because their user-facing CONFLICT messages (referenced-vendor block, QBO-mapping conflict) must survive
// Next's production error redaction — the client unwraps them.

function revalidateVendors() {
  revalidatePath("/setup/vendors");
  revalidatePath("/setup/expendables"); // the expendables vendor picker reads the list
}

export const createVendorAction = action(async ({ actor }, input: VendorInput) => {
  const res = await createVendorCore(actor, input);
  revalidateVendors();
  return res;
});

export const updateVendorAction = action(async ({ actor }, id: string, input: VendorInput) => {
  const res = await updateVendorCore(actor, id, input);
  revalidateVendors();
  return res;
});

export const archiveVendorAction = adminAction(async ({ actor }, input: { id: string; active: boolean }) => {
  const res = await archiveVendorCore(actor, input.id, input.active);
  revalidateVendors();
  return res;
});

/** Admin-only read: how many materials/lots/bills/contacts point at a vendor (drives the merge preview). */
export const getVendorUsageAction = adminAction(async (_ctx, id: string): Promise<VendorUsage> => {
  return getVendorUsage(id);
});

/** Merge the loser vendor into the survivor (re-points every reference, retires the loser). */
export const mergeVendorsAction = safeAdminAction(
  async ({ actor }, input: { loserId: string; survivorId: string; acknowledgeQboConflict?: boolean }) => {
    const res = await mergeVendorsCore(actor, input);
    revalidateVendors();
    return res;
  },
);

/** Remove an unreferenced vendor (blocks with guidance when it's still in use). */
export const removeVendorAction = safeAdminAction(async ({ actor }, id: string) => {
  const res = await removeVendorCore(actor, id);
  revalidateVendors();
  return res;
});
