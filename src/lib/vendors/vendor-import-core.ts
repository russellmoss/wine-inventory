import { runInTenantTx } from "@/lib/tenant/tx";
import { requireTenantId } from "@/lib/tenant/context";
import { ActionError } from "@/lib/action-error";
import { writeAudit } from "@/lib/audit";
import { ensureUnknownVendor } from "@/lib/vendors/vendors";
import type { LedgerActor } from "@/lib/vessels/rack-core";

// Plan 075 (QBO vendor sync, Slice 1) — the audited state transitions OFF the vendor_import_candidate review
// queue. accept = create a local Vendor linked to the QBO id; reject = tombstone (suppresses future pulls);
// merge = map the QBO id onto a chosen existing Vendor (with a conflict guard). All in one runInTenantTx, audited.
// `Vendor.externalVendorId` is the single source of truth for "already synced" — these are the only audited writers.

/** Accept a candidate: create a local Vendor with the QBO id linked, remove the candidate. */
export async function acceptCandidateCore(actor: LedgerActor, candidateId: string): Promise<{ vendorId: string }> {
  return runInTenantTx(async (tx) => {
    const tenantId = requireTenantId();
    const cand = await tx.vendorImportCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true, externalVendorId: true, name: true, status: true },
    });
    if (!cand) throw new ActionError("That import candidate no longer exists.");
    if (cand.status !== "PENDING") throw new ActionError("That candidate has already been resolved.");

    let vendor: { id: string };
    try {
      vendor = await tx.vendor.create({
        data: { tenantId, name: cand.name, externalVendorId: cand.externalVendorId },
        select: { id: true },
      });
    } catch (e) {
      if (e && typeof e === "object" && (e as { code?: string }).code === "P2002") {
        throw new ActionError(`A vendor named "${cand.name}" already exists — use "Merge into existing" instead.`, "CONFLICT");
      }
      throw e;
    }
    await tx.vendorImportCandidate.delete({ where: { id: candidateId } });
    await writeAudit(tx, { ...actor, action: "CREATE", entityType: "Vendor", entityId: vendor.id, summary: `Imported vendor "${cand.name}" from QuickBooks` });
    return { vendorId: vendor.id };
  });
}

/** Reject a candidate: mark it a REJECTED tombstone so future pulls suppress it. Clears any stale suggestion. */
export async function rejectCandidateCore(actor: LedgerActor, candidateId: string): Promise<{ id: string }> {
  return runInTenantTx(async (tx) => {
    const cand = await tx.vendorImportCandidate.findUnique({ where: { id: candidateId }, select: { id: true, name: true, status: true } });
    if (!cand) throw new ActionError("That import candidate no longer exists.");
    await tx.vendorImportCandidate.update({ where: { id: candidateId }, data: { status: "REJECTED", suggestedVendorId: null } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "VendorImportCandidate", entityId: candidateId, summary: `Marked QuickBooks vendor "${cand.name}" as not cellar-relevant` });
    return { id: candidateId };
  });
}

/** Merge a candidate INTO an existing vendor: map the QBO id onto that vendor, remove the candidate. Blocks when
 *  the target already maps to a DIFFERENT QBO vendor (conflict — never silently remap a posted-bill vendor), and
 *  refuses the seeded "Unknown / Unspecified" fallback as a target. */
export async function mergeCandidateIntoVendorCore(
  actor: LedgerActor,
  candidateId: string,
  targetVendorId: string,
): Promise<{ vendorId: string }> {
  return runInTenantTx(async (tx) => {
    const cand = await tx.vendorImportCandidate.findUnique({
      where: { id: candidateId },
      select: { id: true, externalVendorId: true, name: true, status: true },
    });
    if (!cand) throw new ActionError("That import candidate no longer exists.");
    if (cand.status !== "PENDING") throw new ActionError("That candidate has already been resolved.");

    const target = await tx.vendor.findUnique({ where: { id: targetVendorId }, select: { id: true, name: true, externalVendorId: true } });
    if (!target) throw new ActionError("That vendor no longer exists.");

    const unknown = await ensureUnknownVendor(tx);
    if (target.id === unknown.id) throw new ActionError("You can't map a QuickBooks vendor onto the “Unknown / Unspecified” vendor.");

    if (target.externalVendorId && target.externalVendorId !== cand.externalVendorId) {
      throw new ActionError(`"${target.name}" is already linked to a different QuickBooks vendor — resolve that conflict first.`, "CONFLICT");
    }
    await tx.vendor.update({ where: { id: targetVendorId }, data: { externalVendorId: cand.externalVendorId } });
    await tx.vendorImportCandidate.delete({ where: { id: candidateId } });
    await writeAudit(tx, { ...actor, action: "UPDATE", entityType: "Vendor", entityId: targetVendorId, summary: `Linked "${target.name}" to QuickBooks vendor "${cand.name}"` });
    return { vendorId: targetVendorId };
  });
}
