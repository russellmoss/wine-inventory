/**
 * Spray Intelligence S3a — verify:spray-record. End-to-end proof of the S3a gate on the Demo
 * tenant (runbook §9), FOURTEEN assertions (plan Unit 12; council C16 grew it from nine):
 *
 *   1  RLS — a second tenant reads zero rows
 *   2  in-place edit refused by the trigger on spray_application, spray_block_line,
 *      planned_harvest_date_event AND spray_drying_override (council C5)
 *   3  header/line round-trip — one pass, TEN blocks, per-block acres/times/rates
 *   4  correction-as-event — new revision; original byte-identical + SUPERSEDED; current view = 1;
 *      a SECOND correction of the same revision is rejected by the unique
 *   5  the void race — two concurrent voids: exactly one commits (council C2); ditto void×amend
 *   6  facts-as-of-then — a header-only correction copies every line's factsAsOf/factsRevision
 *      VERBATIM; changing one line's EPA number re-resolves THAT LINE ONLY (KD-14 / council G1)
 *   7  driedBeforeRain — null/INSUFFICIENT_DATA with no series; an attributed override flips it
 *   8  unknown product ⇒ UNKNOWN, never clear (null resolver — rule §3.6)
 *   9  the knownness CHECK bites — empty array + known=true is refused by the DATABASE (C7)
 *  10  REI never borrows the header time — null block finishedAt ⇒ UNKNOWN (G2/C14)
 *  11  legacy field note surfaces as LOW-confidence and BLOCKS a rotation-OK claim (S11)
 *  12  planned harvest — versions audited; point-in-time read; split-pick labels coexist;
 *      plannedHarvestChangesSince replays once with the right direction (KD-8/C4/G4)
 *  13  commandId retry — same payload returns the original; different payload rejected (C8)
 *  14  non-US path — null EPA number writes cleanly, resolves UNKNOWN (rule §3.9; Bhutan-SHAPED
 *      fixture inside Demo Winery, never the real Bhutan tenant)
 *
 * Run: npm run verify:spray-record   (from a checkout with .env)
 */
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { runInTenantRawTx } from "../src/lib/tenant/tx";
import { prisma } from "../src/lib/prisma";
import { recordSprayApplicationCore } from "../src/lib/spray/record-core";
import { correctSprayApplicationCore, voidSprayApplicationCore } from "../src/lib/spray/correction-core";
import { recordDryingOverrideCore, recomputeDriedBeforeRainCore } from "../src/lib/spray/drying-override-core";
import {
  currentPlannedHarvestDatesCore,
  plannedHarvestChangesSinceCore,
  plannedHarvestDateAsOfCore,
  retractPlannedHarvestDateCore,
  setPlannedHarvestDateCore,
} from "../src/lib/harvest/planned-harvest-core";
import { legacySprayRecords } from "../src/lib/fieldnotes/legacy-spray-core";
import { foldCurrentApplications, reiWindow, rotationContribution } from "../src/lib/spray/read-core";
import { resolveDriedBeforeRain } from "../src/lib/spray/drying-core";
import { parseISODateUTC } from "../src/lib/fieldnotes/week";
import type { ProductFactsResolver } from "../src/lib/spray/product-facts-port";

const DEMO = "org_demo_winery";
const ORG_B = "org_spray_verify_b";
const runId = Date.now();
const actor = { userId: null, email: "qa-spray@demowinery.test" };

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures += 1;
    console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`);
  }
}
async function raises(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A fake REGISTRY resolver stamping a fixed factsRevision — assertion 6's probe. */
const registryResolver = (revision: number): ProductFactsResolver => ({
  async resolveMany(keys) {
    return keys.map(() => ({
      completeness: "KNOWN" as const,
      source: "REGISTRY" as const,
      phiDays: 14,
      reiHours: 24,
      rainfastHours: 2,
      mobilityClass: "TRANSLAMINAR" as const,
      resistanceGroups: ["FRAC:7", "FRAC:11"],
      activeIngredientKeys: ["BOSCALID", "PYRACLOSTROBIN"],
      activeIngredients: [{ name: "Boscalid", percentByWeight: 25.2, casNumber: null }],
      factsRevision: revision,
      factsAsOf: new Date("2026-06-01T00:00:00Z"),
    }));
  },
});

async function main() {
  const vineyardId = `qa-spray-vy-${runId}`;
  const blockIds = Array.from({ length: 10 }, (_, i) => `qa-spray-blk-${runId}-${i + 1}`);
  let fieldNoteId: string | null = null;

  try {
    await runAsTenant(DEMO, async () => {
      // ── fixtures ──
      await prisma.vineyard.create({ data: { id: vineyardId, name: `QA-Spray-Vineyard-${runId}` } });
      for (let i = 0; i < 10; i++) {
        await prisma.vineyardBlock.create({
          data: {
            id: blockIds[i],
            vineyardId,
            blockLabel: `QA-Spray-B${i + 1}`,
            rowSpacingM: 2.7432,
            vineSpacingM: 1.8288,
            vineCount: 807, // ≈ 0.405 ha ≈ 1 acre, derived from spacing
            updatedAt: new Date(),
          },
        });
      }

      const passInput = (over: Partial<RecordInput> = {}): RecordInput => ({
        applicatorName: "QA Applicator",
        applicatorLicense: "QA-LIC-1",
        applicationMethod: "AIRBLAST",
        startedAt: new Date("2026-07-10T06:00:00Z"),
        finishedAt: new Date("2026-07-10T18:00:00Z"),
        sprayVolumePerHaL: 900,
        groundSpeedKph: 6.4,
        materialLines: [
          {
            productName: "QA Pristine",
            epaRegistrationNumber: "7969-199",
            materialRole: "PESTICIDE",
            quantityEntered: 10,
            quantityUnit: "OZ",
            quantityBasis: "PER_AREA",
            perAreaUnit: "ACRE",
            enteredReiHours: 24,
            enteredPhiDays: 14,
          },
          {
            productName: "QA Sticker",
            materialRole: "ADJUVANT",
            adjuvantClass: "STICKER_SPREADER",
            quantityEntered: 8,
            quantityUnit: "FLOZ",
            quantityBasis: "PER_CARRIER_VOLUME",
            perCarrierVolume: { value: 100, unit: "GAL" },
          },
        ],
        mixOrderLines: [
          { sequence: 1, materialDescription: "Water (carrier)" },
          { sequence: 2, materialDescription: "QA Pristine", materialLineNo: 1 },
          { sequence: 3, materialDescription: "QA Sticker", materialLineNo: 2 },
        ],
        blockLines: blockIds.map((blockId, i) => ({
          blockId,
          startedAt: new Date(Date.UTC(2026, 6, 10, 6 + i)),
          // Block 10 (i=9) deliberately has NO finish time — assertion 10.
          finishedAt: i === 9 ? null : new Date(Date.UTC(2026, 6, 10, 7 + i)),
          volumeUsedL: i === 0 ? 380 : null, // block 1 gets a MEASURED rate
        })),
        ...over,
      });

      // ── 3. header/line round trip: one pass, ten blocks ──
      console.log("\n── 3. ten-block round trip ──");
      const pass = await recordSprayApplicationCore(actor, passInput());
      check("pass recorded", !!pass.applicationId);
      check("not cross-site", pass.isCrossSite === false);
      const blockLines = await prisma.sprayBlockLine.findMany({ where: { applicationId: pass.applicationId }, orderBy: { startedAt: "asc" } });
      check("read back as TEN block lines", blockLines.length === 10, blockLines.length);
      check(
        "every line snapshots a derived per-block area (~0.405 ha, DERIVED_FROM_SPACING)",
        blockLines.every((b) => Math.abs(Number(b.treatedAreaHa) - 0.4048) < 0.01 && b.treatedAreaSource === "DERIVED_FROM_SPACING"),
      );
      const b1 = blockLines.find((b) => b.blockId === blockIds[0])!;
      check("block 1 rate is MEASURED (380 L over its own area)", b1.rateBasis === "MEASURED" && Math.abs(Number(b1.computedVolumePerHaL) - 380 / Number(b1.treatedAreaHa)) < 0.01);
      const b2 = blockLines.find((b) => b.blockId === blockIds[1])!;
      check("block 2 rate falls back to HEADER_VOLUME (900 L/ha)", b2.rateBasis === "HEADER_VOLUME" && Number(b2.computedVolumePerHaL) === 900);
      check("per-block times survive", b2.startedAt?.toISOString() === "2026-07-10T07:00:00.000Z");
      const mixLines = await prisma.sprayMixOrderLine.findMany({ where: { applicationId: pass.applicationId }, orderBy: { sequence: "asc" } });
      check("mix order round-trips; water has NO material line, product lines are linked", mixLines.length === 3 && mixLines[0].materialLineId === null && mixLines[1].materialLineId !== null);

      // ── 8. unknown product ⇒ UNKNOWN, never clear ──
      console.log("\n── 8. unknown-never-clear (null resolver) ──");
      const materials = await prisma.sprayMaterialLine.findMany({ where: { applicationId: pass.applicationId }, orderBy: { lineNo: "asc" } });
      check("every material line is factsCompleteness UNKNOWN", materials.every((m) => m.factsCompleteness === "UNKNOWN"));
      check("resistanceGroupsKnown is FALSE everywhere", materials.every((m) => !m.resistanceGroupsKnown));
      const contribution = rotationContribution({
        resistanceGroupsKnown: materials[0].resistanceGroupsKnown,
        snapshotResistanceGroups: materials[0].snapshotResistanceGroups,
        factsCompleteness: materials[0].factsCompleteness,
        productName: materials[0].productName,
      });
      check("rotationContribution is { unknown: true } — NEVER { groups: [] }", "unknown" in contribution && contribution.unknown === true);

      // ── 10. REI never borrows the header time ──
      console.log("\n── 10. null block finishedAt ⇒ REI UNKNOWN ──");
      const materialRows = materials.map((m) => ({ snapshotReiHours: m.snapshotReiHours, enteredReiHours: m.enteredReiHours }));
      const w1 = reiWindow({ finishedAt: b1.finishedAt, blockLabelSnapshot: b1.blockLabelSnapshot }, materialRows);
      const b10 = blockLines.find((b) => b.blockId === blockIds[9])!;
      const w10 = reiWindow({ finishedAt: b10.finishedAt, blockLabelSnapshot: b10.blockLabelSnapshot }, materialRows);
      check("block 1 resolves REI from its OWN finish (07:00 + 24h)", w1.state === "KNOWN" && w1.state === "KNOWN" && (w1 as { reiEndsAt: Date }).reiEndsAt.toISOString() === "2026-07-11T07:00:00.000Z");
      check("block 10 (no finishedAt) is UNKNOWN — never the header's 18:00", w10.state === "UNKNOWN");

      // ── 14. non-US path (Bhutan-SHAPED fixture inside Demo) ──
      console.log("\n── 14. null EPA number ──");
      const bhutan = await recordSprayApplicationCore(actor, passInput({
        commandId: undefined,
        materialLines: [{ productName: "QA Bhutan Botanical", materialRole: "PESTICIDE", quantityEntered: 2, quantityUnit: "L", quantityBasis: "TOTAL_IN_TANK" }],
        blockLines: [{ blockId: blockIds[2] }],
      }));
      const bhutanLine = await prisma.sprayMaterialLine.findFirst({ where: { applicationId: bhutan.applicationId } });
      check("record with NULL EPA number writes cleanly", !!bhutanLine && bhutanLine.epaRegistrationNumber === null);
      check("…and resolves UNKNOWN with identity source UNKNOWN", bhutanLine!.factsCompleteness === "UNKNOWN" && bhutanLine!.productIdentitySource === "UNKNOWN");

      // ── 13. commandId retry semantics ──
      console.log("\n── 13. commandId retry (C8) ──");
      const cmdInput = passInput({ commandId: `QA-cmd-${runId}`, blockLines: [{ blockId: blockIds[3] }] });
      const first = await recordSprayApplicationCore(actor, cmdInput);
      const replay = await recordSprayApplicationCore(actor, cmdInput);
      check("same commandId + same payload returns the ORIGINAL record", replay.applicationId === first.applicationId && replay.idempotentReplay === true);
      const mismatch = await raises(() =>
        recordSprayApplicationCore(actor, { ...cmdInput, groundSpeedKph: 9.9 }),
      );
      check("same commandId + DIFFERENT payload is rejected, not silently accepted", mismatch);

      // ── 6. facts-as-of-then (KD-14) ──
      console.log("\n── 6. correction copies the snapshot verbatim ──");
      const factsPass = await recordSprayApplicationCore(
        actor,
        passInput({ blockLines: [{ blockId: blockIds[4] }] }),
        { factsResolver: registryResolver(42) },
      );
      const factsLines = await prisma.sprayMaterialLine.findMany({ where: { applicationId: factsPass.applicationId }, orderBy: { lineNo: "asc" } });
      check("fixture resolver stamped factsRevision 42", factsLines.every((l) => l.factsRevision === 42));

      // Header-only correction under a NEWER registry (revision 99): snapshot must NOT move.
      const headerOnly = await correctSprayApplicationCore(
        actor,
        factsPass.applicationId,
        { ...passInput({ blockLines: [{ blockId: blockIds[4] }] }), groundSpeedKph: 5.1, correctionReason: "ground-speed typo" },
        { factsResolver: registryResolver(99) },
      );
      const afterHeaderFix = await prisma.sprayMaterialLine.findMany({ where: { applicationId: headerOnly.applicationId }, orderBy: { lineNo: "asc" } });
      check(
        "a ground-speed-only correction leaves every line's factsRevision AND factsAsOf untouched (still 42)",
        afterHeaderFix.every((l, i) => l.factsRevision === 42 && l.factsAsOf?.getTime() === factsLines[i].factsAsOf?.getTime()),
      );

      // Now change line 1's product identity: THAT line re-resolves (99); line 2 stays 42.
      const identityInput = passInput({ blockLines: [{ blockId: blockIds[4] }] });
      identityInput.materialLines = identityInput.materialLines.map((m, i) =>
        i === 0 ? { ...m, epaRegistrationNumber: "7969-999" } : m,
      );
      const identityFix = await correctSprayApplicationCore(
        actor,
        headerOnly.applicationId,
        { ...identityInput, correctionReason: "wrong EPA reg number on line 1" },
        { factsResolver: registryResolver(99) },
      );
      const afterIdentityFix = await prisma.sprayMaterialLine.findMany({ where: { applicationId: identityFix.applicationId }, orderBy: { lineNo: "asc" } });
      check("the changed line re-resolved to revision 99", afterIdentityFix[0].factsRevision === 99);
      check("the untouched line KEPT revision 42 (per-line, not per-document)", afterIdentityFix[1].factsRevision === 42);

      // ── 4. correction-as-event mechanics ──
      console.log("\n── 4. correction-as-event ──");
      const predBefore = await prisma.sprayApplication.findUnique({ where: { id: factsPass.applicationId } });
      const strip = (r: Record<string, unknown>) => {
        const { status: _s, supersededByApplicationId: _p, ...rest } = r;
        return JSON.stringify(rest, (_, v) => (typeof v === "bigint" ? String(v) : v), 0);
      };
      const predAfter = await prisma.sprayApplication.findUnique({ where: { id: factsPass.applicationId } });
      check("original content is byte-identical after correction (only bookkeeping moved)", strip(predBefore as never) === strip(predAfter as never));
      check("original is SUPERSEDED with the successor linked", predAfter!.status === "SUPERSEDED" && predAfter!.supersededByApplicationId === headerOnly.applicationId);
      const chain = await prisma.sprayApplication.findMany({
        where: { OR: [{ id: factsPass.applicationId }, { supersedesApplicationId: { not: null } }], vineyardId },
      });
      const chainRows = chain.filter((r) => [factsPass.applicationId, headerOnly.applicationId, identityFix.applicationId].includes(r.id));
      check("the current view returns exactly ONE row for the chain", foldCurrentApplications(chainRows).length === 1 && foldCurrentApplications(chainRows)[0].id === identityFix.applicationId);
      const secondCorrection = await raises(() =>
        correctSprayApplicationCore(actor, factsPass.applicationId, { ...passInput({ blockLines: [{ blockId: blockIds[4] }] }), correctionReason: "double" }),
      );
      check("a SECOND correction of the same revision is refused", secondCorrection);
      // The DB-level backstop: even a direct insert with the same supersedes pointer dies on the unique.
      const directDouble = await runAsSystem(async (db) =>
        raises(() =>
          db.sprayApplication.create({
            data: {
              tenantId: DEMO,
              vineyardId,
              applicatorName: "X",
              applicationMethod: "AIRBLAST",
              startedAt: new Date(),
              enteredByEmail: "x@x",
              status: "ACTIVE",
              revision: 9,
              supersedesApplicationId: factsPass.applicationId,
              correctionKind: "AMENDMENT",
            },
          }),
        ),
      );
      check("…and at the DATABASE by UNIQUE(tenantId, supersedesApplicationId)", directDouble);

      // ── 5. the void race ──
      console.log("\n── 5. concurrent voids (C2) ──");
      const raceTarget = await recordSprayApplicationCore(actor, passInput({ blockLines: [{ blockId: blockIds[5] }] }));
      const voids = await Promise.allSettled([
        voidSprayApplicationCore(actor, raceTarget.applicationId, "race A"),
        voidSprayApplicationCore(actor, raceTarget.applicationId, "race B"),
      ]);
      check("two concurrent voids: exactly ONE commits", voids.filter((v) => v.status === "fulfilled").length === 1, voids.map((v) => v.status));
      const raceTarget2 = await recordSprayApplicationCore(actor, passInput({ blockLines: [{ blockId: blockIds[6] }] }));
      const mixedRace = await Promise.allSettled([
        voidSprayApplicationCore(actor, raceTarget2.applicationId, "void vs amend"),
        correctSprayApplicationCore(actor, raceTarget2.applicationId, { ...passInput({ blockLines: [{ blockId: blockIds[6] }] }), correctionReason: "amend vs void" }),
      ]);
      check("a void racing an amendment: exactly ONE commits", mixedRace.filter((v) => v.status === "fulfilled").length === 1, mixedRace.map((v) => v.status));
      const voided = await prisma.sprayApplication.findFirst({ where: { supersedesApplicationId: raceTarget.applicationId } });
      check("the void IS a successor row (VOIDED, kind VOID, zero lines)", voided!.status === "VOIDED" && voided!.correctionKind === "VOID");
      const voidChildren = await prisma.sprayMaterialLine.count({ where: { applicationId: voided!.id } });
      check("…with zero line children", voidChildren === 0);

      // ── 7. driedBeforeRain ──
      console.log("\n── 7. driedBeforeRain derived + attributed override ──");
      const recomputed = await recomputeDriedBeforeRainCore(b1.id);
      check("no precipitation series ⇒ null + INSUFFICIENT_DATA (never true)", recomputed.driedBeforeRainDerived === null && recomputed.driedBeforeRainBasis === "INSUFFICIENT_DATA");
      await recordDryingOverrideCore(actor, { blockLineId: b1.id, value: true, reason: "Stood in the block — bone dry by 9am", observedAt: new Date("2026-07-10T16:00:00Z") });
      const overrides = await prisma.sprayDryingOverride.findMany({ where: { blockLineId: b1.id } });
      const resolvedDrying = resolveDriedBeforeRain(
        { driedBeforeRainDerived: recomputed.driedBeforeRainDerived, driedBeforeRainBasis: recomputed.driedBeforeRainBasis },
        overrides.map((o) => ({ ...o })),
      );
      check("the override flips the value and carries its attribution", resolvedDrying.source === "OVERRIDE" && resolvedDrying.value === true && (resolvedDrying as { attribution: { email: string } }).attribution.email === actor.email);

      // ── 9. the knownness CHECK bites at the database (C7) ──
      console.log("\n── 9. empty array + known=true is impossible ──");
      const checkBites = await raises(() =>
        prisma.sprayMaterialLine.create({
          data: {
            applicationId: pass.applicationId,
            lineNo: 99,
            productName: "QA Impossible",
            productIdentitySource: "UNKNOWN",
            materialRole: "PESTICIDE",
            quantityEntered: 1,
            quantityUnit: "L",
            quantityBasis: "TOTAL_IN_TANK",
            quantityCanonical: 1,
            quantityDimension: "VOLUME",
            snapshotResistanceGroups: [],
            resistanceGroupsKnown: true, // ← the lie the DB must refuse
          },
        }),
      );
      check("INSERT with [] + resistanceGroupsKnown=true is REFUSED by the CHECK", checkBites);

      // ── 2. in-place edits refused by the trigger (four tables, C5) ──
      console.log("\n── 2. append-only trigger ──");
      check(
        "raw UPDATE of spray_application content raises",
        await raises(() => runInTenantRawTx((tx) => tx.$executeRaw`UPDATE "spray_application" SET "applicatorName" = 'HACKED' WHERE "id" = ${pass.applicationId}`)),
      );
      check(
        "raw UPDATE of spray_block_line content raises",
        await raises(() => runInTenantRawTx((tx) => tx.$executeRaw`UPDATE "spray_block_line" SET "treatedAreaHa" = 99 WHERE "id" = ${b1.id}`)),
      );
      check(
        "raw UPDATE of spray_drying_override raises (allowlists NOTHING)",
        await raises(() => runInTenantRawTx((tx) => tx.$executeRaw`UPDATE "spray_drying_override" SET "reason" = 'HACKED' WHERE "blockLineId" = ${b1.id}`)),
      );

      // ── 12. planned harvest (KD-8) ──
      console.log("\n── 12. planned harvest event stream ──");
      const v1 = await setPlannedHarvestDateCore(actor, { blockId: blockIds[0], vintageYear: 2026, plannedDate: "2026-10-10" });
      check("first set is version 1 with no previous", v1.version === 1 && v1.previousDate === null);
      await sleep(25);
      const midInstant = new Date();
      await sleep(25);
      const v2 = await setPlannedHarvestDateCore(actor, { blockId: blockIds[0], vintageYear: 2026, plannedDate: "2026-09-30", reason: "weather" });
      check("second set is version 2 and reports the previous date", v2.version === 2 && v2.previousDate === "2026-10-10");
      await sleep(25);
      await setPlannedHarvestDateCore(actor, { blockId: blockIds[0], vintageYear: 2026, plannedDate: "2026-10-05" });
      await sleep(25);
      await setPlannedHarvestDateCore(actor, { blockId: blockIds[0], vintageYear: 2026, harvestPassLabel: "sparkling", plannedDate: "2026-08-25" });
      const current = await currentPlannedHarvestDatesCore(blockIds[0], 2026);
      check("split-pick labels COEXIST (two open rows, earliest first)", current.length === 2 && current[0].plannedDate === "2026-08-25" && current[1].plannedDate === "2026-10-05");
      const asOf = await plannedHarvestDateAsOfCore(blockIds[0], 2026, "main", midInstant);
      check("point-in-time read returns the value CURRENT AT that instant (2026-10-10), not the latest", asOf === "2026-10-10");
      await sleep(25);
      await retractPlannedHarvestDateCore(actor, { blockId: blockIds[0], vintageYear: 2026, harvestPassLabel: "sparkling" });
      const afterRetract = await currentPlannedHarvestDatesCore(blockIds[0], 2026);
      check("retraction closes WITHOUT a successor — no open sparkling row", afterRetract.length === 1 && afterRetract[0].harvestPassLabel === "main");
      // trigger coverage on the harvest table: a CONTENT column update raises (effectiveTo/status are allowlisted)
      const harvestRow = await prisma.plannedHarvestDateEvent.findFirst({ where: { blockId: blockIds[0], version: 1 } });
      check(
        "raw UPDATE of planned_harvest_date_event CONTENT raises (only effectiveTo/status allowlisted)",
        await raises(() => runInTenantRawTx((tx) => tx.$executeRaw`UPDATE "planned_harvest_date_event" SET "plannedDate" = '2026-01-01' WHERE "id" = ${harvestRow!.id}`)),
      );
      // the watermark read
      const all = await plannedHarvestChangesSinceCore(null);
      const mine = all.changes.filter((c) => c.blockId === blockIds[0]);
      check(
        "changesSince(null) derives SET → PULLED_FORWARD → PUSHED_BACK → SET(sparkling) → RETRACTED",
        JSON.stringify(mine.map((c) => c.direction)) === JSON.stringify(["SET", "PULLED_FORWARD", "PUSHED_BACK", "SET", "RETRACTED"]),
        mine.map((c) => c.direction),
      );
      const replayA = await plannedHarvestChangesSinceCore(midInstant);
      const replayB = await plannedHarvestChangesSinceCore(midInstant);
      check(
        "the watermark read is idempotent from the same cursor and replays each change once",
        JSON.stringify(replayA.changes.filter((c) => c.blockId === blockIds[0])) === JSON.stringify(replayB.changes.filter((c) => c.blockId === blockIds[0])) &&
          replayA.changes.filter((c) => c.blockId === blockIds[0]).length === 4,
      );
      const drained = await plannedHarvestChangesSinceCore(replayA.nextCursor);
      check("after advancing the cursor, nothing replays", drained.changes.filter((c) => c.blockId === blockIds[0]).length === 0);

      // ── 11. legacy field-note back-compat ──
      console.log("\n── 11. legacy low-confidence record ──");
      const note = await prisma.fieldNote.create({
        data: {
          vineyardId,
          userEmail: actor.email,
          weekOf: parseISODateUTC("2025-06-13")!,
          weatherData: { rainfallMm: null, maxTempC: null, minTempC: null },
          spraysApplied: [{ name: "QA LEGACY PRISTINE", scope: "BLOCKS", blockIds: [blockIds[0]] }],
          fertilizersApplied: [],
          blockLevelStatuses: {},
        },
      });
      fieldNoteId = note.id;
      const parsed = (note.spraysApplied as InputApp[]) ?? [];
      const legacy = legacySprayRecords([{ weekOf: "2025-06-13", vineyardId, sprays: parsed }], []);
      check("the seeded note surfaces as a LOW-confidence RECORD (not an absence)", legacy.length === 1 && legacy[0].confidence === "LOW");
      check(
        "…and BLOCKS a rotation-OK claim (unknown contribution, rotation unusable)",
        "unknown" in legacy[0].rotationContribution && legacy[0].usableFor.rotation === false && legacy[0].usableFor.residual === false,
      );
    });

    // ── 1. RLS: a second tenant reads zero rows ──
    console.log("\n── 1. cross-tenant invisibility ──");
    await runAsSystem(async (db) => {
      await db.organization.upsert({ where: { id: ORG_B }, update: {}, create: { id: ORG_B, name: "Spray Verify B", slug: ORG_B } });
    });
    const crossCount = await runAsTenant(ORG_B, async () => await prisma.sprayApplication.count({ where: { vineyardId } }));
    check("tenant B sees ZERO of Demo's spray records", crossCount === 0);
    const crossBlockCount = await runAsTenant(ORG_B, async () => await prisma.sprayBlockLine.count({}));
    check("tenant B sees zero block lines at all", crossBlockCount === 0);
  } catch (e) {
    failures += 1;
    console.error("\n✗ verify:spray-record aborted mid-run:", e);
  } finally {
    // ── teardown: the sanctioned purge path (owner + GUC, council C15) ──
    console.log("\n── teardown ──");
    await runAsSystem(async (db) => {
      await db.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.allow_spray_purge', 'on', true)`;
          // One statement for the whole chain (self-FKs are NO ACTION → end-of-statement checks);
          // lines + overrides go via ON DELETE CASCADE, their triggers see the same GUC.
          await tx.sprayApplication.deleteMany({ where: { tenantId: DEMO, vineyardId } });
          await tx.plannedHarvestDateEvent.deleteMany({ where: { tenantId: DEMO, blockId: { in: blockIds } } });
          if (fieldNoteId) await tx.fieldNote.deleteMany({ where: { tenantId: DEMO, id: fieldNoteId } });
          await tx.vineyardBlock.deleteMany({ where: { tenantId: DEMO, id: { in: blockIds } } });
          await tx.vineyard.deleteMany({ where: { tenantId: DEMO, id: vineyardId } });
          await tx.organization.deleteMany({ where: { id: ORG_B } });
        },
        { timeout: 120_000, maxWait: 120_000 },
      );
    });
    console.log("  fixtures cleaned");
  }

  console.log(failures === 0 ? "\nALL 14 SPRAY-RECORD ASSERTION GROUPS PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

// Local structural types so the script compiles standalone (mirrors src/lib/spray/types).
type RecordInput = import("../src/lib/spray/types").RecordSprayInput;
type InputApp = import("../src/lib/fieldnotes/types").InputApplication;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
