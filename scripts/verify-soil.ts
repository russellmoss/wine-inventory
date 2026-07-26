/**
 * verify:soil — the P4 end-to-end proof. Runs on the Demo Winery sandbox and drives the REAL
 * pullBlockSoil orchestrator with an INJECTED recorded SDA client (no live NRCS), then reads snapshot
 * rows BACK from the DB. Proves: composition + classification (Water is non-soil), coverage states,
 * cache-by-fingerprint, the geometry-version CAS (an older in-flight response must not supersede a newer
 * version — council C1), supersede-not-delete, timeout keeps the last good snapshot (C7), unreadable
 * snapshot degrades on read, out-of-region gate, no-coverage, and the injection guard.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/verify-soil.ts
 *
 * QA-prefixed fixtures in Demo Winery ONLY; cleaned up at the end. Never touches Bhutan. Cross-tenant RLS
 * is proven separately by verify:tenant-isolation (block_soil_snapshot A/B fixtures).
 */
import { runAsTenant } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { pullBlockSoil } from "@/lib/soil/pull-core";
import { getCurrentSoilSnapshot } from "@/lib/soil/read";
import { computeFingerprint } from "@/lib/soil/wkt-core";
import { buildPropertyQuery } from "@/lib/soil/sda-query";
import { isAllowedSdaUrl, SDA_URL } from "@/lib/soil/sda-config";
import type { SdaClient, SdaFault } from "@/lib/soil/sda-client";
import type { SdaTable } from "@/lib/soil/parse-sda-core";
import type { VineyardPolygon } from "@/lib/gis/geometry";

const TENANT = "org_demo_winery";
const V = "qa_soil_vy";
const DET = "qa_soil_det";
const BLK = "qa_soil_blk";

// A real Finger Lakes block polygon (US, in SSURGO territory).
const POLY: VineyardPolygon = {
  type: "Polygon",
  coordinates: [[[-77.05, 42.55], [-77.04, 42.55], [-77.04, 42.56], [-77.05, 42.56], [-77.05, 42.55]]],
};

// Recorded SDA tables (shape + values mirror the live spike): 2 soils + a Water sliver.
const COMP: SdaTable = {
  cols: ["mukey", "musym", "muname", "mukind", "drclassdcd", "aws025wta", "areasymbol", "saverest", "isect_sqdeg", "block_sqdeg"],
  rows: [
    ["1407835", "MdB", "Mardin channery silt loam", "Consociation", "Moderately well drained", "4.62", "NY123", "9/2/2025", "6.0E-05", "1.0E-04"],
    ["1407898", "VoB", "Volusia channery silt loam", "Consociation", "Somewhat poorly drained", "3.00", "NY123", "9/2/2025", "3.97E-05", "1.0E-04"],
    ["3250410", "W", "Water", "Consociation", null, null, "NY123", "9/2/2025", "3.0E-07", "1.0E-04"],
  ],
};
const PROP: SdaTable = {
  cols: ["mukey", "cokey", "compname", "comppct_r", "majcompflag", "taxclname", "ph_top", "resdept"],
  rows: [
    ["1407835", "c1", "Mardin", "85", "Yes", "Coarse-loamy, mixed, active, mesic Typic Fragiudepts", "6.6", "51"],
    ["1407835", "c2", "Volusia", "10", "No", "Fine-loamy Aeric Fragiaquepts", "6.0", "43"],
    ["1407898", "c3", "Volusia", "85", "Yes", "Fine-loamy Aeric Fragiaquepts", "6.0", "43"],
    ["3250410", "c4", "Water", "100", "Yes", null, null, null],
  ],
};
const EMPTY: SdaTable = { cols: COMP.cols, rows: [] };
const GEOM: SdaTable = {
  cols: ["mukey", "wkt"],
  rows: [
    ["1407835", "POLYGON ((-77.05 42.55, -77.045 42.55, -77.045 42.56, -77.05 42.56, -77.05 42.55))"],
    ["1407898", "POLYGON ((-77.045 42.55, -77.04 42.55, -77.04 42.56, -77.045 42.56, -77.045 42.55))"],
    ["3250410", "POLYGON EMPTY"],
  ],
};

let failures = 0;
const check = (label: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "✓" : "✗"}  ${label}${extra ? `  — ${extra}` : ""}`);
  if (!ok) failures++;
};

/** A recorded client. `onCompositionPost` lets a test mutate state mid-fetch (the CAS race). */
function recordedClient(opts?: { fault?: SdaFault; comp?: SdaTable; onCompositionPost?: () => Promise<void> }): SdaClient {
  return {
    async post(query: string) {
      if (opts?.fault) return { ok: false, fault: opts.fault };
      if (query.includes("STAsText")) return { ok: true, table: GEOM }; // the display-geometry query
      if (query.includes("mupolygon")) {
        if (opts?.onCompositionPost) await opts.onCompositionPost();
        return { ok: true, table: opts?.comp ?? COMP };
      }
      return { ok: true, table: PROP };
    },
  };
}

async function main() {
  await runAsTenant(TENANT, async () => {
    await cleanup();
    const member = await prisma.member.findFirst({ where: { organizationId: TENANT }, select: { userId: true } });
    if (!member) throw new Error("Demo Winery has no member user to act as");
    const actor = { actorUserId: member.userId, actorEmail: "qa-soil@demo.test", tenantId: TENANT };

    const fp = computeFingerprint(POLY);
    await prisma.vineyard.create({ data: { id: V, name: "QA Soil Vineyard" } });
    await prisma.vineyardDetail.create({ data: { id: DET, vineyardId: V, gpsLat: "42.555000", gpsLng: "-77.045000" } });
    await prisma.vineyardBlock.create({ data: { id: BLK, vineyardId: V, blockLabel: "QA Soil Block", polygon: POLY as unknown as object, geometryVersion: 1, geometryFingerprint: fp } });

    // ── A) first pull: covered, per-map-unit, Water classified non-soil ──────────────────────────
    const a = await pullBlockSoil(actor, BLK, { sdaClient: recordedClient() });
    check("first pull → ok", a.state === "ok", a.state);
    const v1 = await getCurrentSoilSnapshot(BLK);
    check("snapshot persisted + readable", !!v1 && v1.components != null);
    if (v1 && v1.components) {
      check("coverage state = covered", v1.coverageState === "covered", `${v1.coveredPct}`);
      const mardin = v1.components.find((c) => c.mukey === "1407835");
      const water = v1.components.find((c) => c.mukey === "3250410");
      check("Mardin is soil with cited pH 6.6 (topmost mineral horizon)", mardin?.class === "soil" && mardin?.ph === 6.6 && mardin?.phBasis === "topmost mineral horizon");
      check("map-unit symbol (musym) stored for the map label", mardin?.musym === "MdB", `${mardin?.musym}`);
      check("Mardin drainage cited as map-unit dominant condition", mardin?.drainageClass === "Moderately well drained" && mardin?.drainageBasis === "map-unit dominant condition");
      check("Water classified non-soil (class=water), no soil properties invented", water?.class === "water" && water?.ph === null && water?.drainageClass === null);
      check("Water sliver marked belowFloor but retained in the JSON (C8)", water?.belowFloor === true);
      check("survey area version recorded (reproducibility)", v1.surveyAreaVersion === "9/2/2025" && v1.surveyAreaSymbol === "NY123");
      check("blockAreaSqM is a local geodesic area > 0 (C3)", v1.blockAreaSqM > 5e5 && v1.blockAreaSqM < 1.1e6, `${Math.round(v1.blockAreaSqM)}`);
      check("no blended block property exists (each soil keeps its own pH)", v1.components.filter((c) => c.class === "soil").every((c) => c.ph !== null));
    }
    // Display geometry stored for the overlay (EMPTY clip dropped; Water sliver had POLYGON EMPTY → 2 feats).
    const geomRow = await prisma.blockSoilSnapshot.findFirst({ where: { blockId: BLK, supersededAt: null }, select: { displayGeometry: true } });
    const fc = geomRow?.displayGeometry as { features?: Array<{ properties: { mukey: string } }> } | null;
    check("display geometry stored for the map overlay (unparseable EMPTY dropped)", !!fc && Array.isArray(fc.features) && fc.features.length === 2, `feats=${fc?.features?.length}`);

    // ── B) cache: unchanged polygon does not hit SDA ─────────────────────────────────────────────
    const b = await pullBlockSoil(actor, BLK, { sdaClient: recordedClient({ fault: "unreachable" }) });
    check("second pull on unchanged polygon → cached (no SDA call)", b.state === "cached", b.state);

    // ── C) geometry-version CAS: an older in-flight response must NOT supersede a newer version (C1) ─
    const c = await pullBlockSoil(actor, BLK, {
      forceRefresh: true,
      sdaClient: recordedClient({ onCompositionPost: async () => { await prisma.vineyardBlock.update({ where: { id: BLK }, data: { geometryVersion: 99 } }); } }),
    });
    check("boundary changed mid-fetch → response discarded (stale-during-fetch)", c.state === "stale-during-fetch", c.state);
    const afterC = await getCurrentSoilSnapshot(BLK);
    check("the older (v1) snapshot was NOT superseded by the stale response", afterC?.stale === true, `stale=${afterC?.stale}`);
    const countAfterC = await prisma.blockSoilSnapshot.count({ where: { blockId: BLK, supersededAt: null } });
    check("still exactly one current snapshot after the discarded race", countAfterC === 1, `current=${countAfterC}`);

    // ── D) supersede-not-delete: a clean re-pull at the new version supersedes, retains history ─────
    const d = await pullBlockSoil(actor, BLK, { forceRefresh: true, sdaClient: recordedClient() });
    check("re-pull at the new version → ok", d.state === "ok", d.state);
    const currents = await prisma.blockSoilSnapshot.count({ where: { blockId: BLK, supersededAt: null } });
    const superseded = await prisma.blockSoilSnapshot.count({ where: { blockId: BLK, supersededAt: { not: null } } });
    check("exactly one current + the prior retained (supersede-not-delete)", currents === 1 && superseded >= 1, `current=${currents} superseded=${superseded}`);

    // ── E) timeout keeps the last good snapshot (C7) ─────────────────────────────────────────────
    const e = await pullBlockSoil(actor, BLK, { forceRefresh: true, sdaClient: recordedClient({ fault: "timeout" }) });
    check("SDA timeout → sda-unavailable (fault surfaced)", e.state === "sda-unavailable" && e.fault === "timeout", `${e.state}/${e.fault}`);
    const afterE = await getCurrentSoilSnapshot(BLK);
    check("last good snapshot preserved through the timeout", !!afterE && afterE.components != null);

    // ── F) unreadable snapshot degrades on read (never 500) ──────────────────────────────────────
    const cur = await prisma.blockSoilSnapshot.findFirst({ where: { blockId: BLK, supersededAt: null }, select: { id: true } });
    await prisma.blockSoilSnapshot.update({ where: { id: cur!.id }, data: { components: { totally: "not the schema" } as unknown as object } });
    const bad = await getCurrentSoilSnapshot(BLK);
    check("unreadable components degrade to null (badge + re-pull), no throw", !!bad && bad.components === null);

    // ── G) out-of-region gate (non-US) — no network call ─────────────────────────────────────────
    await prisma.vineyardDetail.update({ where: { id: DET }, data: { gpsLat: "27.500000", gpsLng: "90.400000" } }); // Bhutan
    const g = await pullBlockSoil(actor, BLK, {
      forceRefresh: true,
      sdaClient: { post: async () => { throw new Error("SDA must not be called out of region"); } },
    });
    check("non-US block → out-of-region, no SDA call", g.state === "out-of-region", g.state);
    await prisma.vineyardDetail.update({ where: { id: DET }, data: { gpsLat: "42.555000", gpsLng: "-77.045000" } });

    // ── H) in-region but empty survey → no-coverage ──────────────────────────────────────────────
    const h = await pullBlockSoil(actor, BLK, { forceRefresh: true, sdaClient: recordedClient({ comp: EMPTY }) });
    check("in-region, empty SDA result → no-coverage", h.state === "no-coverage", h.state);

    // ── I) injection + allowlist guards ──────────────────────────────────────────────────────────
    let injThrew = false;
    try { buildPropertyQuery(["1'; DROP TABLE mapunit;--"]); } catch { injThrew = true; }
    check("SDA property query refuses a non-numeric mukey (injection)", injThrew);
    check("outbound allowlist accepts only the SDA host", isAllowedSdaUrl(SDA_URL) && !isAllowedSdaUrl("https://evil.example.com/x"));

    await cleanup();
  });

  console.log(failures === 0 ? "\nVERIFY:SOIL PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

async function cleanup() {
  await prisma.blockSoilSnapshot.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyardBlock.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyardDetail.deleteMany({ where: { vineyardId: V } });
  await prisma.vineyard.deleteMany({ where: { id: V } });
}

main().catch((e) => {
  console.error("FAILED:", (e as Error)?.name, (e as Error)?.message, (e as Error)?.stack);
  process.exit(1);
});
