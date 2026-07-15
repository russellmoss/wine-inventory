"use server";

import { revalidatePath } from "next/cache";
import { action, adminAction } from "@/lib/actions";
import { createVendorCore, updateVendorCore, archiveVendorCore, type VendorInput } from "@/lib/vendors/vendors";

// Plan 069: vendor CRUD server actions. create/update are READY-USER gated (`action`) because they run from
// the non-admin expendables intake flow (inline "+ create new vendor"). Archive is admin-only (`adminAction`),
// like other destructive setup ops. Cores live in vendors.ts; scripts/assistant call the cores directly.

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
