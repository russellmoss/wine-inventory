import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { reconcileQboVendors } from "@/lib/vendors/qbo-vendor-pull-shared";
import { acceptCandidateCore, rejectCandidateCore, mergeCandidateIntoVendorCore } from "@/lib/vendors/vendor-import-core";

// Plan 075 EXIT PROOF — the QBO vendor-import review queue, exercised end-to-end against the Demo sandbox. The
// unit tests (test/qbo-vendor-pull.test.ts) prove the pure reconcile; THIS proves the audited cores on the real
// DB: accept creates a linked Vendor + removes the candidate, reject tombstones, merge links onto a chosen vendor
// and is BLOCKED on a conflicting externalVendorId. Plus a self-contained pure-reconcile sanity.
//
//   npx tsx --env-file=.env scripts/verify-vendor-import.ts
//
// Demo Winery ONLY. QA-tagged fixtures, torn down in a finally, pass or fail.

const TENANT = "org_demo_winery";
const ACTOR = { actorUserId: null as string | null, actorEmail: "verify-vendor-import@demo.test" };
const TAG = `QVI${Date.now().toString(36)}`;

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
}
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const errCode = (e: unknown) => (e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code) : "");

async function main() {
  await runAsTenant(TENANT, async () => {
    const vendorIds: string[] = [];
    try {
      // ── Pure reconcile sanity ──
      const collapse = reconcileQboVendors([{ externalId: "1", name: "Acme", active: true }, { externalId: "2", name: "Acme (EUR)", active: true }], [], new Set());
      check("reconcile collapses currency variants to ONE candidate", collapse.candidates.length === 1 && collapse.candidates[0].currencyVariantIds.length === 2, JSON.stringify(collapse.candidates));
      const synced = reconcileQboVendors([{ externalId: "3", name: "Beta", active: true }], [{ id: "vx", name: "Beta", externalVendorId: "3" }], new Set());
      check("reconcile skips an already-linked (synced) vendor", synced.candidates.length === 0 && synced.skippedSynced === 1);
      const suppressed = reconcileQboVendors([{ externalId: "6", name: "Delta", active: true }], [], new Set(["6"]));
      check("reconcile suppresses a rejected tombstone", suppressed.candidates.length === 0 && suppressed.skippedRejected === 1);

      // ── Cores on the real DB ──
      const target = await prisma.vendor.create({ data: { name: `${TAG} Target`, updatedAt: new Date() }, select: { id: true } });
      vendorIds.push(target.id);

      const c1 = await prisma.vendorImportCandidate.create({ data: { name: `${TAG} Fresh Co`, externalVendorId: `${TAG}-QBO-1`, currencyVariantIds: [`${TAG}-QBO-1`], updatedAt: new Date() }, select: { id: true } });
      const accepted = await acceptCandidateCore(ACTOR, c1.id);
      vendorIds.push(accepted.vendorId);
      const acceptedRow = await prisma.vendor.findUnique({ where: { id: accepted.vendorId }, select: { name: true, externalVendorId: true } });
      check("accept creates a Vendor linked to the QBO id + removes the candidate",
        acceptedRow?.name === `${TAG} Fresh Co` && acceptedRow?.externalVendorId === `${TAG}-QBO-1` && (await prisma.vendorImportCandidate.findUnique({ where: { id: c1.id } })) === null);

      const c2 = await prisma.vendorImportCandidate.create({ data: { name: `${TAG} Reject Co`, externalVendorId: `${TAG}-QBO-2`, currencyVariantIds: [`${TAG}-QBO-2`], updatedAt: new Date() }, select: { id: true } });
      await rejectCandidateCore(ACTOR, c2.id);
      check("reject tombstones the candidate (suppressed on re-pull)", (await prisma.vendorImportCandidate.findUnique({ where: { id: c2.id }, select: { status: true } }))?.status === "REJECTED");

      const c3 = await prisma.vendorImportCandidate.create({ data: { name: `${TAG} Merge Co`, externalVendorId: `${TAG}-QBO-3`, currencyVariantIds: [`${TAG}-QBO-3`], updatedAt: new Date() }, select: { id: true } });
      await mergeCandidateIntoVendorCore(ACTOR, c3.id, target.id);
      check("merge links the QBO id onto the chosen vendor + removes the candidate",
        (await prisma.vendor.findUnique({ where: { id: target.id }, select: { externalVendorId: true } }))?.externalVendorId === `${TAG}-QBO-3` && (await prisma.vendorImportCandidate.findUnique({ where: { id: c3.id } })) === null);

      // Target now maps to QBO-3; merging a DIFFERENT QBO id into it must be blocked.
      const c4 = await prisma.vendorImportCandidate.create({ data: { name: `${TAG} Conflict Co`, externalVendorId: `${TAG}-QBO-4`, currencyVariantIds: [`${TAG}-QBO-4`], updatedAt: new Date() }, select: { id: true } });
      let conflictBlocked = false, conflictMsg = "";
      try { await mergeCandidateIntoVendorCore(ACTOR, c4.id, target.id); } catch (e) { conflictBlocked = errCode(e) === "CONFLICT"; conflictMsg = errMsg(e); }
      check("merge into a vendor already linked to a DIFFERENT QBO vendor is blocked (CONFLICT)", conflictBlocked, conflictMsg);

      // ── The (tenantId, externalVendorId) unique: two local vendors can't link to the SAME QBO id (review fix). ──
      const linked = await prisma.vendor.create({ data: { name: `${TAG} Already Linked`, externalVendorId: `${TAG}-QBO-9`, updatedAt: new Date() }, select: { id: true } });
      vendorIds.push(linked.id);
      const c5 = await prisma.vendorImportCandidate.create({ data: { name: `${TAG} Dup Link Co`, externalVendorId: `${TAG}-QBO-9`, currencyVariantIds: [`${TAG}-QBO-9`], updatedAt: new Date() }, select: { id: true } });
      let acceptDupBlocked = false;
      try { await acceptCandidateCore(ACTOR, c5.id); } catch (e) { acceptDupBlocked = errCode(e) === "CONFLICT"; }
      check("accept is blocked when that QBO id is already linked to another vendor (unique)", acceptDupBlocked);
      const other = await prisma.vendor.create({ data: { name: `${TAG} Other`, updatedAt: new Date() }, select: { id: true } });
      vendorIds.push(other.id);
      let mergeDupBlocked = false;
      try { await mergeCandidateIntoVendorCore(ACTOR, c5.id, other.id); } catch (e) { mergeDupBlocked = errCode(e) === "CONFLICT"; }
      check("merge is blocked when that QBO id is already linked to another vendor (unique)", mergeDupBlocked);
    } finally {
      const tryDel = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* gone */ } };
      await tryDel(() => prisma.vendorImportCandidate.deleteMany({ where: { externalVendorId: { startsWith: `${TAG}-QBO-` } } }));
      if (vendorIds.length) await tryDel(() => prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } }));
      await tryDel(() => prisma.vendor.deleteMany({ where: { name: { startsWith: TAG } } }));
    }
  });
}

main()
  .then(async () => { await prisma.$disconnect(); console.log(failures === 0 ? "\nALL VENDOR-IMPORT CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`); process.exit(failures === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("ERR", e); await prisma.$disconnect(); process.exit(1); });
