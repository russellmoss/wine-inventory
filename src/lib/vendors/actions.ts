"use server";

import { revalidatePath } from "next/cache";
import { action, adminAction, safeAdminAction } from "@/lib/actions";
import { ActionError } from "@/lib/action-error";
import {
  createVendorCore,
  updateVendorCore,
  archiveVendorCore,
  mergeVendorsCore,
  removeVendorCore,
  getVendorUsage,
  getVendorNearMatchesCore,
  type VendorInput,
} from "@/lib/vendors/vendors";
import { pullQboVendorsForTenant } from "@/lib/vendors/qbo-vendor-pull";
import { acceptCandidateCore, rejectCandidateCore, mergeCandidateIntoVendorCore } from "@/lib/vendors/vendor-import-core";
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

/** Plan 074: read-only near-duplicate check for a candidate name. Drives the create modal's "did you mean?"
 *  guard. READY-USER gated (like create), returns banded candidates — no write, no revalidate. */
export const checkVendorNearMatchesAction = action(async (_ctx, name: string) => {
  return getVendorNearMatchesCore(name);
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

// Plan 075: QBO vendor-import review-queue actions. Admin/developer-gated + safeAdminAction so CONFLICT messages
// (accept-would-dup, merge-conflict, no-connection) survive prod error redaction. The pull is a manual on-demand
// action here; the optional poll cron (Unit 7) calls the same core.

/** Pull QBO vendors into the review queue on demand. Throws (→ {ok:false,error}) when QBO isn't connected. */
export const pullVendorsFromQboAction = safeAdminAction(async ({ actor }) => {
  const res = await pullQboVendorsForTenant(actor.tenantId);
  if (!res.ok) throw new ActionError("QuickBooks isn't connected — connect it under Accounting first, then pull.");
  revalidateVendors();
  return { pulled: res.pulled, candidates: res.candidates, skippedSynced: res.skippedSynced, skippedRejected: res.skippedRejected };
});

/** Accept a candidate → create a local vendor linked to the QBO id. */
export const acceptVendorImportCandidateAction = safeAdminAction(async ({ actor }, candidateId: string) => {
  const res = await acceptCandidateCore(actor, candidateId);
  revalidateVendors();
  return res;
});

/** Reject a candidate → tombstone it (suppressed on future pulls). */
export const rejectVendorImportCandidateAction = safeAdminAction(async ({ actor }, candidateId: string) => {
  const res = await rejectCandidateCore(actor, candidateId);
  revalidateVendors();
  return res;
});

/** Merge a candidate into an existing vendor → map the QBO id onto it (blocks on a differing existing link). */
export const mergeVendorImportCandidateAction = safeAdminAction(async ({ actor }, candidateId: string, targetVendorId: string) => {
  const res = await mergeCandidateIntoVendorCore(actor, candidateId, targetVendorId);
  revalidateVendors();
  return res;
});
