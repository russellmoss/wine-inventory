import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import {
  mergeVendorsCore,
  removeVendorCore,
  getVendorUsage,
  ensureUnknownVendor,
} from "@/lib/vendors/vendors";

// Plan 072 EXIT PROOF — vendor merge + removal, exercised end-to-end against the Demo Winery sandbox
// through the REAL app path (runAsTenant + the cores). The browser proves the UI; THIS proves the DB:
// that a merge re-points every reference (materials, supply lots, A/P bills, contacts) onto the survivor
// and deletes the loser, that a removal is blocked while referenced and cascades contacts when clean, and
// that the seeded "Unknown / Unspecified" fallback is protected. Governed money: the A/P export event is
// the posted-bill reference, so its pointer MUST move on merge (never orphan).
//
//   npx tsx --env-file=.env scripts/verify-vendor-merge.ts
//
// Demo Winery ONLY. All fixtures are QA-tagged and torn down in a finally, pass or fail.

const TENANT = "org_demo_winery";
const ACTOR = { actorUserId: null as string | null, actorEmail: "verify-vendor-merge@demo.test" };
const TAG = `QA-VMERGE-${Date.now()}`;

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
}

function errCode(e: unknown): string {
  return (e && typeof e === "object" && "code" in e ? String((e as { code?: unknown }).code) : "") || "";
}
function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

type FixtureIds = { loserId?: string; survivorId?: string; matId?: string; lotId?: string; apId?: string; contactId?: string };

async function cleanup(ids: FixtureIds) {
  // Children before vendors (the vendor FKs are RESTRICT); best-effort, ignore already-gone rows.
  const tryDel = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* already gone */ } };
  if (ids.apId) await tryDel(() => prisma.apExportEvent.deleteMany({ where: { id: ids.apId } }));
  if (ids.lotId) await tryDel(() => prisma.supplyLot.deleteMany({ where: { id: ids.lotId } }));
  if (ids.matId) await tryDel(() => prisma.cellarMaterial.deleteMany({ where: { id: ids.matId } }));
  if (ids.contactId) await tryDel(() => prisma.vendorContact.deleteMany({ where: { id: ids.contactId } }));
  // Any surviving QA-tagged vendors from this run.
  await tryDel(() => prisma.vendorContact.deleteMany({ where: { name: { startsWith: TAG } } }));
  await tryDel(() => prisma.vendor.deleteMany({ where: { name: { startsWith: TAG } } }));
}

async function main() {
  await runAsTenant(TENANT, async () => {
    const ids: FixtureIds = {};
    try {
      // ── Seed: a LOSER vendor referenced by one of every kind, plus a SURVIVOR to merge into. ──
      const loser = await prisma.vendor.create({ data: { name: `${TAG}-Loser`, url: "https://loser.example" }, select: { id: true } });
      const survivor = await prisma.vendor.create({ data: { name: `${TAG}-Survivor`, url: "https://survivor.example" }, select: { id: true } });
      ids.loserId = loser.id; ids.survivorId = survivor.id;

      const mat = await prisma.cellarMaterial.create({
        data: { name: `${TAG}-Mat`, normalizedKey: `${TAG.replace(/[^A-Za-z0-9]/g, "")}MAT`, kind: "OTHER", vendor: `${TAG}-Loser`, vendorUrl: "https://loser.example", vendorId: loser.id },
        select: { id: true },
      });
      ids.matId = mat.id;
      const lot = await prisma.supplyLot.create({
        data: { materialId: mat.id, qtyReceived: 1, qtyRemaining: 1, stockUnit: "unit", vendorId: loser.id },
        select: { id: true },
      });
      ids.lotId = lot.id;
      const ap = await prisma.apExportEvent.create({
        data: { postingKey: `${TAG}:ap`, amount: 12.5, receivedAt: new Date(), vendorId: loser.id },
        select: { id: true },
      });
      ids.apId = ap.id;
      const contact = await prisma.vendorContact.create({ data: { vendorId: loser.id, name: `${TAG}-Contact` }, select: { id: true } });
      ids.contactId = contact.id;

      const before = await getVendorUsage(loser.id);
      check("usage counts every reference on the loser", before.materials === 1 && before.lots === 1 && before.apEvents === 1 && before.contacts === 1, JSON.stringify(before));

      // ── MERGE loser → survivor. ──
      const res = await mergeVendorsCore(ACTOR, { loserId: loser.id, survivorId: survivor.id });
      check("merge reports the moved counts", res.moved.materials === 1 && res.moved.lots === 1 && res.moved.apEvents === 1 && res.moved.contacts === 1, JSON.stringify(res.moved));

      check("loser vendor is hard-deleted", (await prisma.vendor.findUnique({ where: { id: loser.id } })) === null);

      const matAfter = await prisma.cellarMaterial.findUnique({ where: { id: mat.id }, select: { vendorId: true, vendor: true, vendorUrl: true } });
      check("material re-pointed to survivor", matAfter?.vendorId === survivor.id, `vendorId=${matAfter?.vendorId}`);
      check("material legacy vendor/vendorUrl mirror re-derived to survivor", matAfter?.vendor === `${TAG}-Survivor` && matAfter?.vendorUrl === "https://survivor.example", `${matAfter?.vendor} / ${matAfter?.vendorUrl}`);
      check("supply lot re-pointed to survivor", (await prisma.supplyLot.findUnique({ where: { id: lot.id }, select: { vendorId: true } }))?.vendorId === survivor.id);
      check("A/P bill (ap_export_event) re-pointed to survivor — governed money", (await prisma.apExportEvent.findUnique({ where: { id: ap.id }, select: { vendorId: true } }))?.vendorId === survivor.id);
      check("contact re-pointed to survivor", (await prisma.vendorContact.findUnique({ where: { id: contact.id }, select: { vendorId: true } }))?.vendorId === survivor.id);

      // ── REMOVE guard: survivor is now referenced → blocked. ──
      let removeBlocked = false, removeMsg = "";
      try { await removeVendorCore(ACTOR, survivor.id); } catch (e) { removeBlocked = errCode(e) === "CONFLICT"; removeMsg = errMsg(e); }
      check("removing a referenced vendor is blocked (archive/merge instead)", removeBlocked, removeMsg);

      // ── Unknown fallback is protected from both remove and being a merge loser. ──
      const unk = await ensureUnknownVendor();
      let unkRemoveBlocked = false;
      try { await removeVendorCore(ACTOR, unk.id); } catch (e) { unkRemoveBlocked = /Unknown/i.test(errMsg(e)); }
      check("the Unknown fallback vendor can't be removed", unkRemoveBlocked);
      let unkMergeBlocked = false;
      try { await mergeVendorsCore(ACTOR, { loserId: unk.id, survivorId: survivor.id }); } catch (e) { unkMergeBlocked = /Unknown/i.test(errMsg(e)); }
      check("the Unknown fallback vendor can't be a merge loser", unkMergeBlocked);

      // ── REMOVE success: clear the survivor's references, then it hard-deletes and cascades contacts. ──
      await prisma.apExportEvent.delete({ where: { id: ap.id } });
      await prisma.supplyLot.delete({ where: { id: lot.id } });
      await prisma.cellarMaterial.delete({ where: { id: mat.id } });
      ids.apId = ids.lotId = ids.matId = undefined; // consumed
      await removeVendorCore(ACTOR, survivor.id);
      check("removing an unreferenced vendor hard-deletes it", (await prisma.vendor.findUnique({ where: { id: survivor.id } })) === null);
      check("the removed vendor's contacts cascade away", (await prisma.vendorContact.findUnique({ where: { id: contact.id } })) === null);
      ids.survivorId = ids.contactId = undefined; // gone
    } finally {
      await cleanup(ids);
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nALL VENDOR-MERGE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error("ERR", e);
    await prisma.$disconnect();
    process.exit(1);
  });
