import "server-only";
/**
 * Vineyard Intelligence P4 — the one-click soil pull orchestrator. Reads the block polygon, gates non-US
 * before any network call, pulls SDA (two queries — spatial clip + tabular properties, never joined,
 * council C2), runs the pure composition core, and persists a superseded-not-deleted snapshot under a
 * geometry-version CAS.
 *
 * COUNCIL-HARDENED:
 *  - C1: capture the block's geometryVersion BEFORE the network call; inside the write tx, row-lock the
 *    block (FOR UPDATE) and NO-OP unless the version still matches — an older in-flight SDA response must
 *    never supersede a newer snapshot. The unique-violation (concurrent insert) is caught → degrade, not 500.
 *  - C10: the write runs in `runInTenantTx`, which sets `app.tenant_id` as the tx's first statement, so the
 *    raw FOR UPDATE lock is RLS-scoped (a raw write without tenant context would silently violate RLS).
 *  - C3: `areaSqM` comes from a LOCAL geodesic block area (wkt-core), never a cos(lat)-scaled SDA value.
 *  - C7: SDA faults come back typed from the client → keep the last snapshot, surface a refresh failure.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runInTenantTx } from "@/lib/tenant/tx";
import { ActionError } from "@/lib/action-error";
import { writeAudit, summarize, diff } from "@/lib/audit";
import { validateVineyardPolygon } from "@/lib/gis/geometry";
import { toWkt, blockAreaSqM, computeFingerprint } from "./wkt-core";
import { buildCompositionQuery, buildGeometryQuery, buildPropertyQuery, isValidMukey, SOIL_QUERY_VERSION } from "./sda-query";
import { parseCompositionRows, parseGeometryRows, parsePropertyRows } from "./parse-sda-core";
import { soilDisplayFromRows, type SoilDisplayGeometry } from "./wkt-parse";
import { computeSoilComposition } from "./composition-core";
import { createSdaClient, type SdaClient, type SdaFault } from "./sda-client";
import { isLikelyUsLocation, polygonCentroid } from "./us-region";

export const NRCS_ATTRIBUTION =
  "Soil Survey Staff, Natural Resources Conservation Service, USDA — Web Soil Survey / Soil Data Access (public domain).";

export type SoilPullState =
  | "ok" // a fresh snapshot was stored
  | "cached" // the polygon is unchanged; the current snapshot was reused (no SDA call)
  | "no-polygon" // the block has no boundary yet
  | "invalid-polygon" // the stored boundary failed validation
  | "out-of-region" // outside SSURGO territory (non-US) — no network call was made
  | "no-coverage" // in-region but SDA returned no soil (a genuine survey gap) — recorded
  | "sda-unavailable" // SDA timed out / errored — the last snapshot is preserved
  | "stale-during-fetch"; // the boundary changed mid-fetch — the response was discarded (council C1)

export type SoilPullResult = { state: SoilPullState; fault?: SdaFault; message?: string; coveredPct?: number };

export type SoilPullActor = { actorUserId: string; actorEmail: string; tenantId: string };

/** Pull soil for one block. `deps.sdaClient` is injected by verify:soil (recorded fixtures, no live NRCS). */
export async function pullBlockSoil(
  actor: SoilPullActor,
  blockId: string,
  deps?: { sdaClient?: SdaClient; forceRefresh?: boolean },
): Promise<SoilPullResult> {
  const block = await prisma.vineyardBlock.findFirst({
    where: { id: blockId },
    select: {
      id: true,
      blockLabel: true,
      vineyardId: true,
      polygon: true,
      geometryVersion: true,
      geometryFingerprint: true,
      vineyard: { select: { name: true, detail: { select: { gpsLat: true, gpsLng: true } } } },
    },
  });
  if (!block) throw new ActionError("That block no longer exists.", "CONFLICT");
  if (block.polygon == null) return { state: "no-polygon" };

  const validated = validateVineyardPolygon(block.polygon);
  if (!validated.ok) return { state: "invalid-polygon", message: validated.message };
  const poly = validated.value;

  // US-region gate BEFORE any network call: vineyard GPS if present, else the polygon centroid.
  const detail = block.vineyard?.detail;
  const gpsLat = detail?.gpsLat == null ? null : Number(detail.gpsLat);
  const gpsLng = detail?.gpsLng == null ? null : Number(detail.gpsLng);
  const [lng, lat] = gpsLat != null && gpsLng != null ? [gpsLng, gpsLat] : polygonCentroid(poly);
  if (!isLikelyUsLocation(lat, lng)) return { state: "out-of-region" };

  const wkt = toWkt(poly);
  const areaSqM = blockAreaSqM(poly);
  const fingerprint = block.geometryFingerprint ?? computeFingerprint(poly);
  const expectedGeometryVersion = block.geometryVersion;

  // Cache by fingerprint: an unchanged polygon does not hit SDA (design §Operational).
  if (!deps?.forceRefresh) {
    const current = await prisma.blockSoilSnapshot.findFirst({
      where: { blockId, supersededAt: null },
      select: { polygonFingerprint: true, coveredPct: true },
    });
    if (current && current.polygonFingerprint === fingerprint) {
      return { state: "cached", coveredPct: Number(current.coveredPct) };
    }
  }

  const client = deps?.sdaClient ?? createSdaClient();

  // SDA call 1: spatial composition + coverage (one row per mukey).
  const compRes = await client.post(buildCompositionQuery(wkt));
  if (!compRes.ok) return { state: "sda-unavailable", fault: compRes.fault };
  const composition = parseCompositionRows(compRes.table);

  // SDA call 2: tabular properties for the returned mukeys. A property fault degrades gracefully
  // (drainage/AWC still come from the composition query; pH/depth are left null) — it never blocks the pull.
  const mukeys = composition.map((r) => r.mukey).filter(isValidMukey);
  let properties: ReturnType<typeof parsePropertyRows> = [];
  if (mukeys.length > 0) {
    const propRes = await client.post(buildPropertyQuery(mukeys));
    if (propRes.ok) properties = parsePropertyRows(propRes.table);
  }

  const result = computeSoilComposition({ composition, properties, blockAreaSqM: areaSqM });

  // SDA call 3 (best-effort): block-clipped display geometry for the optional map overlay (design §13.6).
  // A fault here NEVER blocks the pull — the composition snapshot is authoritative and stands on its own.
  let displayGeometry: SoilDisplayGeometry | null = null;
  if (mukeys.length > 0 && result.coverageState !== "none") {
    const geomRes = await client.post(buildGeometryQuery(wkt));
    if (geomRes.ok) displayGeometry = soilDisplayFromRows(parseGeometryRows(geomRes.table));
  }

  // Persist under a geometry-version CAS (council C1) inside a tenant-scoped Serializable tx (council C10).
  let staleDuringFetch = false;
  try {
    await runInTenantTx(
      async (tx) => {
        const locked = await tx.$queryRaw<{ geometryVersion: number }[]>(
          Prisma.sql`SELECT "geometryVersion" FROM "vineyard_block" WHERE "id" = ${blockId} AND "tenantId" = ${actor.tenantId} FOR UPDATE`,
        );
        if (locked.length === 0) throw new ActionError("That block no longer exists.", "CONFLICT");
        if (Number(locked[0].geometryVersion) !== expectedGeometryVersion) {
          staleDuringFetch = true; // an older in-flight response — discard, do NOT supersede a newer snapshot
          return;
        }
        await tx.$executeRaw(
          Prisma.sql`UPDATE "block_soil_snapshot" SET "supersededAt" = now() WHERE "blockId" = ${blockId} AND "tenantId" = ${actor.tenantId} AND "supersededAt" IS NULL`,
        );
        const created = await tx.blockSoilSnapshot.create({
          data: {
            blockId,
            vineyardId: block.vineyardId,
            polygonFingerprint: fingerprint,
            geometryVersion: expectedGeometryVersion,
            coveredPct: result.coveredPct.toFixed(6),
            coverageState: result.coverageState,
            blockAreaSqM: areaSqM.toFixed(2),
            components: result.components as unknown as Prisma.InputJsonValue,
            displayGeometry: displayGeometry ? (displayGeometry as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
            processingVersion: SOIL_QUERY_VERSION,
            surveyAreaSymbol: result.surveyAreaSymbol,
            surveyAreaVersion: result.surveyAreaVersion,
            attribution: NRCS_ATTRIBUTION,
            createdBy: actor.actorUserId,
          },
        });
        await writeAudit(tx, {
          actorUserId: actor.actorUserId,
          actorEmail: actor.actorEmail,
          tenantId: actor.tenantId,
          action: "CREATE",
          entityType: "BlockSoilSnapshot",
          entityId: created.id,
          changes: diff(null, {
            blockId,
            coverageState: result.coverageState,
            coveredPct: result.coveredPct,
            mapUnits: result.components.filter((c) => c.class !== "uncovered").length,
          }),
          summary: summarize("CREATE", "BlockSoilSnapshot", {
            label: `${block.blockLabel ?? block.vineyard?.name ?? "block"} — NRCS soil`,
          }),
        });
      },
      { isolationLevel: "Serializable" },
    );
  } catch (e) {
    // A concurrent insert that beat us to the partial-unique current-row index → another pull won; the
    // block still has exactly one current snapshot, so degrade rather than 500 (council C1).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { state: "cached", coveredPct: result.coveredPct };
    }
    throw e;
  }

  if (staleDuringFetch) return { state: "stale-during-fetch" };
  return {
    state: result.coverageState === "none" ? "no-coverage" : "ok",
    coveredPct: result.coveredPct,
  };
}
