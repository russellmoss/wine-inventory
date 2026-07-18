import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { findOrCreateVendorCore, getVendorNearMatchesCore, ensureUnknownVendor } from "@/lib/vendors/vendors";
import { nearDuplicateLevel } from "@/lib/vendors/vendors-shared";

// Plan 074 EXIT PROOF — the near-duplicate vendor guard, exercised end-to-end against the Demo Winery
// sandbox through the REAL app paths. The unit tests (test/vendors-shared.test.ts) prove the pure matcher;
// the assistant create_vendor CHOICE is proven in test/assistant-create-vendor-dedup.test.ts. THIS proves
// the DB-integrated behavior: getVendorNearMatchesCore round-trips + tenant-scopes, the currency-suffix and
// Unknown-fallback exclusions hold on real rows, and — deliberately — the AUTOMATED find-or-create path does
// NOT dedup near-matches (it can't prompt mid-bill-post; the detective sweep is a later slice).
//
//   npx tsx --conditions=react-server --env-file=.env scripts/verify-vendor-dedupe.ts
//
// Demo Winery ONLY. All fixtures carry a unique tag SUFFIX (a tag prefix would skew the prefix-ratio
// matcher) and are torn down in a finally, pass or fail.

const TENANT = "org_demo_winery";
const TAG = `QVD${Date.now().toString(36)}`;
const nm = (base: string) => `${base} ${TAG}`;

let failures = 0;
function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✓" : "✗ FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!pass) failures++;
}

async function main() {
  await runAsTenant(TENANT, async () => {
    const createdIds: string[] = [];
    try {
      // ── Pure-engine sanity (redundant with the unit suite, but a self-contained exit proof). ──
      check("engine: Scott Labs ↔ Scott Laboratories is HIGH", nearDuplicateLevel("Scott Labs", "Scott Laboratories") === "high");
      check("engine: Crush2Cellar ↔ Crush to Cellar is HIGH", nearDuplicateLevel("Crush2Cellar", "Crush to Cellar") === "high");
      check("engine: currency-suffix variant is NOT flagged", nearDuplicateLevel("Acme", "Acme (EUR)") === null);

      // ── Seed distinctive vendors (suffix-tagged so they don't collide with real Demo rows). ──
      const zephyr = await prisma.vendor.create({ data: { name: nm("Zephyr Labs") }, select: { id: true } });
      const nimbus = await prisma.vendor.create({ data: { name: nm("Nimbus Wine") }, select: { id: true } });
      createdIds.push(zephyr.id, nimbus.id);

      // ── getVendorNearMatchesCore: near-variant found, unrelated not, currency + Unknown excluded. ──
      const near = await getVendorNearMatchesCore(nm("Zephyr Laboratories"));
      check("near-variant name surfaces the seeded vendor in HIGH", near.high.some((v) => v.id === zephyr.id), JSON.stringify(near.high.map((v) => v.name)));

      const unrelated = await getVendorNearMatchesCore(nm("Quokka Vineyard Supply"));
      check("an unrelated name does NOT surface the seeded vendors in HIGH", !unrelated.high.some((v) => v.id === zephyr.id || v.id === nimbus.id));

      const currency = await getVendorNearMatchesCore(`${nm("Nimbus Wine")} (EUR)`);
      check("a currency-suffixed variant does NOT flag its base (Plan 073)", !currency.high.some((v) => v.id === nimbus.id));

      const unk = await ensureUnknownVendor();
      const unkProbe = await getVendorNearMatchesCore("Unknown / Unspecified");
      check("the Unknown fallback vendor is never a near-match candidate", !unkProbe.high.some((v) => v.id === unk.id) && !unkProbe.medium.some((v) => v.id === unk.id));

      // ── Automated find-or-create path is INTENTIONALLY ungated: it creates a near-dup exact-name row. ──
      const auto = await findOrCreateVendorCore({ name: nm("Zephyr Laboratories") });
      const autoDistinct = !!auto && auto.id !== zephyr.id;
      if (auto) createdIds.push(auto.id);
      check("automated find-or-create creates a NEW row despite the near-dup (documented gap)", autoDistinct, `auto=${auto?.id} seed=${zephyr.id}`);
    } finally {
      // Clean up by tracked ids first, then a tag-contains backstop.
      const tryDel = async (fn: () => Promise<unknown>) => { try { await fn(); } catch { /* already gone */ } };
      if (createdIds.length) await tryDel(() => prisma.vendor.deleteMany({ where: { id: { in: createdIds } } }));
      await tryDel(() => prisma.vendor.deleteMany({ where: { name: { contains: TAG } } }));
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log(failures === 0 ? "\nALL VENDOR-DEDUPE CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error("ERR", e);
    await prisma.$disconnect();
    process.exit(1);
  });
