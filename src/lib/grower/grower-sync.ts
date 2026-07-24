import "server-only";
import { runAsTenant } from "@/lib/tenant/context";
import { getPushVendorsToQbo } from "@/lib/settings/data";
import { pushVendorToQboCore } from "@/lib/vendors/vendor-qbo-sync";
import {
  createGrowerCore,
  updateGrowerCore,
  type CreateGrowerInput,
  type UpdateGrowerInput,
  type CreateGrowerResult,
} from "@/lib/grower/grower-core";

// Plan 095: create/update a grower AND (best-effort, post-commit) push its linked vendor to QBO — so a
// third-party grower is "set up as a vendor in QuickBooks" as the ticket asks. Estate growers have no linked
// vendor, so nothing pushes. Shared by the Setup admin action and the assistant's create_grower committer so
// both sync identically. The push NEVER fails the write: offline/error → the vendor stays syncStatus=pending
// and the existing vendor retry sweep (runVendorSyncSweep) catches it. pushVendorToQboCore is idempotent
// (already-linked → 'synced'), so re-pushing an already-linked vendor on an update is a safe no-op.

/** The actor shape both `action` and `safeAdminAction` provide (a superset of LedgerActor with the tenant). */
export type GrowerActor = { actorUserId: string; actorEmail: string; tenantId: string };

async function pushLinkedVendorToQbo(vendorId: string | null, tenantId: string): Promise<void> {
  if (!vendorId) return;
  try {
    await runAsTenant(tenantId, async () => {
      if (await getPushVendorsToQbo()) await pushVendorToQboCore(vendorId);
    });
  } catch {
    /* the grower + vendor are persisted regardless; a stuck push stays pending for the sweep */
  }
}

export async function createGrowerWithSync(actor: GrowerActor, input: CreateGrowerInput): Promise<CreateGrowerResult> {
  const res = await createGrowerCore(actor, input);
  if (res.ok) await pushLinkedVendorToQbo(res.grower.vendorId, actor.tenantId);
  return res;
}

export async function updateGrowerWithSync(actor: GrowerActor, input: UpdateGrowerInput): Promise<CreateGrowerResult> {
  const res = await updateGrowerCore(actor, input);
  if (res.ok) await pushLinkedVendorToQbo(res.grower.vendorId, actor.tenantId);
  return res;
}
