import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { prisma } from "@/lib/prisma";
import { pushVendorToQboCore, getQboVendorMatchesCore, runVendorSyncSweep } from "@/lib/vendors/vendor-qbo-sync";
import { getPushVendorsToQbo } from "@/lib/settings/data";

// Plan 077 EXIT PROOF — the eager QBO vendor push state machine, exercised against the Demo sandbox. Proves the
// GOVERNED, deterministic guarantees on the real DB without polluting the QBO sandbox: the link path stamps
// externalVendorId + syncStatus=synced, is idempotent, a second vendor linking the SAME QBO id → conflict (the
// (tenantId, externalVendorId) unique from Slice 1), a pending vendor is left alone by the sweep when the tenant
// hasn't opted in, and the opt-in flag round-trips. The LIVE QBO half (real findOrCreateVendor push + the fuzzy
// pre-check against real QBO vendors) is gated behind VERIFY_VENDOR_SYNC_LIVE=1 so the default run never creates
// throwaway vendors in the QBO sandbox (QBO vendors can't be hard-deleted, only inactivated).
//
//   npx tsx --env-file=.env scripts/verify-vendor-sync.ts                 # deterministic DB-only
//   VERIFY_VENDOR_SYNC_LIVE=1 npx tsx --env-file=.env scripts/verify-vendor-sync.ts   # + live QBO push/pre-check
//
// Demo Winery ONLY. QA-tagged fixtures, torn down in a finally, pass or fail.

const TENANT = "org_demo_winery";
const TAG = `QVS${Date.now().toString(36)}`;
const LIVE = process.env.VERIFY_VENDOR_SYNC_LIVE === "1";

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
}
const syncStatusOf = async (id: string) => (await prisma.vendor.findUnique({ where: { id }, select: { syncStatus: true } }))?.syncStatus;
const extIdOf = async (id: string) => (await prisma.vendor.findUnique({ where: { id }, select: { externalVendorId: true } }))?.externalVendorId;

async function main() {
  await runAsTenant(TENANT, async () => {
    const vendorIds: string[] = [];
    // Preserve + restore the tenant opt-in flag so the verify never leaves Demo mutated.
    const flagBefore = await getPushVendorsToQbo();
    try {
      // ── Link path (no QBO call): stamp externalVendorId + synced ──
      const v1 = await prisma.vendor.create({ data: { name: `${TAG} Link Co`, updatedAt: new Date() }, select: { id: true } });
      vendorIds.push(v1.id);
      const s1 = await pushVendorToQboCore(v1.id, { linkExternalId: `${TAG}-QBO-1` });
      check("link path stamps externalVendorId + syncStatus=synced (no new QBO vendor)",
        s1 === "synced" && (await extIdOf(v1.id)) === `${TAG}-QBO-1` && (await syncStatusOf(v1.id)) === "synced", s1);

      // ── Idempotent: pushing an already-linked vendor is a synced no-op ──
      const s1again = await pushVendorToQboCore(v1.id);
      check("re-push of an already-linked vendor is an idempotent synced no-op",
        s1again === "synced" && (await extIdOf(v1.id)) === `${TAG}-QBO-1`, s1again);

      // ── Conflict: a second vendor linking the SAME QBO id → conflict (not a throw), via the unique ──
      const v2 = await prisma.vendor.create({ data: { name: `${TAG} Dup Link Co`, updatedAt: new Date() }, select: { id: true } });
      vendorIds.push(v2.id);
      const s2 = await pushVendorToQboCore(v2.id, { linkExternalId: `${TAG}-QBO-1` });
      check("second vendor linking the SAME QBO id → conflict (unique guard, not a 500)",
        s2 === "conflict" && (await syncStatusOf(v2.id)) === "conflict" && (await extIdOf(v2.id)) === null, s2);

      // ── Sweep gating: with the tenant NOT opted in, a pending vendor is left alone ──
      await runInTenantTx((tx) => tx.appSettings.upsert({ where: { tenantId: TENANT }, update: { pushVendorsToQbo: false }, create: { pushVendorsToQbo: false } }));
      const v3 = await prisma.vendor.create({ data: { name: `${TAG} Pending Co`, syncStatus: "pending", updatedAt: new Date() }, select: { id: true } });
      vendorIds.push(v3.id);
      const offSummary = await runVendorSyncSweep({ orgIds: [TENANT] });
      check("sweep leaves pending vendors alone when the tenant hasn't opted into push",
        offSummary.opted === 0 && (await syncStatusOf(v3.id)) === "pending", JSON.stringify(offSummary));

      // ── Opt-in flag round-trips ──
      await runInTenantTx((tx) => tx.appSettings.upsert({ where: { tenantId: TENANT }, update: { pushVendorsToQbo: true }, create: { pushVendorsToQbo: true } }));
      check("pushVendorsToQbo opt-in flag round-trips", (await getPushVendorsToQbo()) === true);

      // ── LIVE QBO (gated): the fuzzy pre-check + a real eager push against the Demo QBO sandbox ──
      if (LIVE) {
        const pre = await getQboVendorMatchesCore(`${TAG} No Such Vendor Xyzzy`);
        check("[live] pre-check returns a well-formed (possibly empty) high list against real QBO",
          Array.isArray(pre.high) && pre.high.every((m) => typeof m.externalId === "string" && typeof m.name === "string"), JSON.stringify(pre.high.slice(0, 3)));

        const v4 = await prisma.vendor.create({ data: { name: `${TAG} Eager Push Co`, syncStatus: "pending", updatedAt: new Date() }, select: { id: true } });
        vendorIds.push(v4.id);
        const s4 = await pushVendorToQboCore(v4.id);
        // synced when QBO is connected + reachable; pending if the sandbox connection is down (still not a throw).
        check("[live] eager push against connected QBO stamps synced (or pending if sandbox offline — never a throw)",
          (s4 === "synced" && typeof (await extIdOf(v4.id)) === "string") || (s4 === "pending" && (await extIdOf(v4.id)) === null), s4);
      } else {
        console.log("·  [live] QBO push + pre-check SKIPPED (set VERIFY_VENDOR_SYNC_LIVE=1 to exercise the QBO sandbox)");
      }
    } finally {
      // Restore the opt-in flag to whatever it was, then drop QA fixtures.
      try { await runInTenantTx((tx) => tx.appSettings.upsert({ where: { tenantId: TENANT }, update: { pushVendorsToQbo: flagBefore }, create: { pushVendorsToQbo: flagBefore } })); } catch { /* best-effort */ }
      const tryDel = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* gone */ } };
      if (vendorIds.length) await tryDel(() => prisma.vendor.deleteMany({ where: { id: { in: vendorIds } } }));
      await tryDel(() => prisma.vendor.deleteMany({ where: { name: { startsWith: TAG } } }));
    }
  });
}

main()
  .then(async () => { await prisma.$disconnect(); console.log(failures === 0 ? "\nALL VENDOR-SYNC CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`); process.exit(failures === 0 ? 0 : 1); })
  .catch(async (e) => { console.error("ERR", e); await prisma.$disconnect(); process.exit(1); });
