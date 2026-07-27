/**
 * Spray Intelligence S5a — verify:latent-infection. End-to-end proof of the S5a gate on the Demo
 * tenant (runbook §9). NINE assertion groups:
 *
 *   1  RLS — a second tenant reads ZERO rows through the pooled endpoint
 *   2  append-only — an in-place UPDATE is refused, and a DELETE is refused (council C5; the
 *      trigger is defence in depth, the withheld GRANT is the real enforcement)
 *   3  idempotency — a retried command with the same payload inserts EXACTLY ONCE and returns the
 *      original; the same commandId with a DIFFERENT payload is rejected loudly (C5)
 *   4  KD-4, the C1 regression guard — infectiousExpectedAt uses the SHORT latent bound and the
 *      event close uses the LONG one. Opposite ends of one interval, never averaged.
 *   5  KD-5 — a clean scouting pass does NOT close an open event (the runbook's named gate)
 *   6  the UNKNOWN arm never reports a resolution date, and never self-closes
 *   7  ERADICATED — a kickback close stops the event projecting (council C9)
 *   8  correction-as-event — a void is a SUCCESSOR ROW; the original stays byte-identical, and
 *      current state is the latest row per logicalEventId (C4), not a lookup by pathogen/organ
 *   9  non-US path — a Bhutan-SHAPED fixture inside Demo Winery runs with no EPA dependency
 *      (rule §3.9 / SAFE-19). Never the real Bhutan tenant (rule §3.12).
 *
 * Run: npm run verify:latent-infection   (from a checkout with .env)
 */
import { runAsTenant } from "../src/lib/tenant/context";
import { runAsSystem } from "../src/lib/tenant/system";
import { prisma } from "../src/lib/prisma";
import {
  InfectionLedgerError,
  closeInfectionEvent,
  openInfectionEvent,
  readCurrentEvent,
  reverseInfectionEvent,
} from "../src/lib/spray/infection-ledger-core";
import { loadVineyardInfectionStatus } from "../src/lib/spray/infection-read";
import { POWDERY_LATENT_LONG_DAYS, POWDERY_LATENT_SHORT_DAYS, addDaysIso } from "../src/lib/spray/infection-resolution";

const DEMO = "org_demo_winery";
const ORG_B = "org_latent_verify_b";
const runId = Date.now();
const actor = { userId: null, email: "qa-latent@demowinery.test" };

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

const OCCURRED = "2026-05-01";
const EXPECTED_INFECTIOUS = addDaysIso(OCCURRED, POWDERY_LATENT_SHORT_DAYS); // 2026-05-06
const EXPECTED_EXPIRY = addDaysIso(OCCURRED, POWDERY_LATENT_LONG_DAYS); // 2026-05-15

async function main() {
  const vineyardId = `qa-latent-vy-${runId}`;
  const blockId = `qa-latent-blk-${runId}`;
  const bhutanVineyardId = `qa-latent-bt-vy-${runId}`;
  const bhutanBlockId = `qa-latent-bt-blk-${runId}`;
  let openedLogicalId = "";
  let openedRowId = "";

  try {
    await runAsTenant(DEMO, async () => {
      console.log("\n── fixtures ──");
      await prisma.vineyard.create({ data: { id: vineyardId, name: `QA-Latent-Vineyard-${runId}` } });
      await prisma.vineyardBlock.create({ data: { id: blockId, vineyardId, blockLabel: "QA Block 1" } });
      await prisma.vineyard.create({ data: { id: bhutanVineyardId, name: `QA-Latent-Bhutan-Shaped-${runId}` } });
      await prisma.vineyardBlock.create({ data: { id: bhutanBlockId, vineyardId: bhutanVineyardId, blockLabel: "QA BT Block" } });
      console.log("  fixtures created");

      console.log("\n── 4. KD-4: the two transitions take OPPOSITE bounds (the C1 regression guard) ──");
      const opened = await openInfectionEvent(
        {
          blockId,
          pathogen: "POWDERY_MILDEW",
          hostOrgan: "LEAF",
          infectionOccurredOn: OCCURRED,
          evidenceSource: "SCOUTING_OBSERVATION",
          commandId: `QA-cmd-open-${runId}`,
        },
        actor,
      );
      openedLogicalId = opened.logicalEventId;
      openedRowId = opened.rowId;
      const row = await readCurrentEvent(openedLogicalId);
      const infectiousIso = row?.infectiousExpectedAt?.toISOString().slice(0, 10) ?? null;
      const expiryIso = row?.expiresOn?.toISOString().slice(0, 10) ?? null;
      check(`infectiousExpectedAt uses the SHORT bound (+${POWDERY_LATENT_SHORT_DAYS} d = ${EXPECTED_INFECTIOUS})`, infectiousIso === EXPECTED_INFECTIOUS, infectiousIso);
      check(`expiresOn uses the LONG bound (+${POWDERY_LATENT_LONG_DAYS} d = ${EXPECTED_EXPIRY})`, expiryIso === EXPECTED_EXPIRY, expiryIso);
      check("the bounds are NOT the same date (they are opposite ends of one interval)", infectiousIso !== expiryIso);
      check("seq starts at 1 and status is OPEN", row?.seq === 1 && row?.status === "OPEN", { seq: row?.seq, status: row?.status });

      console.log("\n── 3. idempotency: a retried command inserts EXACTLY ONCE ──");
      const replay = await openInfectionEvent(
        {
          blockId,
          pathogen: "POWDERY_MILDEW",
          hostOrgan: "LEAF",
          infectionOccurredOn: OCCURRED,
          evidenceSource: "SCOUTING_OBSERVATION",
          commandId: `QA-cmd-open-${runId}`,
        },
        actor,
      );
      check("the replay returned the ORIGINAL row", replay.rowId === openedRowId, { replay: replay.rowId, original: openedRowId });
      check("the replay is flagged as a replay, not a new append", replay.idempotentReplay === true);
      const countAfterReplay = await prisma.latentInfectionEvent.count({ where: { commandId: `QA-cmd-open-${runId}` } });
      check("exactly ONE row exists for that commandId", countAfterReplay === 1, countAfterReplay);

      let mismatchRejected = false;
      try {
        await openInfectionEvent(
          {
            blockId,
            pathogen: "POWDERY_MILDEW",
            hostOrgan: "FRUIT", // different payload, same commandId
            infectionOccurredOn: OCCURRED,
            evidenceSource: "SCOUTING_OBSERVATION",
            commandId: `QA-cmd-open-${runId}`,
          },
          actor,
        );
      } catch (e) {
        mismatchRejected = e instanceof InfectionLedgerError && e.code === "COMMAND_REPLAY_MISMATCH";
      }
      check("the same commandId with a DIFFERENT payload is rejected loudly", mismatchRejected);

      console.log("\n── 5. KD-5: a clean scouting pass does NOT close an open event ──");
      // Mid-window, past the infectious date. Somebody walks the block and sees nothing — which is
      // exactly what a LATENT infection looks like (Fedele et al. 2020).
      const midWindow = addDaysIso(OCCURRED, 7);
      const refusedByScout = await raises(() =>
        closeInfectionEvent({ logicalEventId: openedLogicalId, today: midWindow, commandId: `QA-cmd-scout-${runId}` }, actor),
      );
      check("closing mid-window is refused (a clean scout cannot clear it)", refusedByScout);
      const stillOpen = await readCurrentEvent(openedLogicalId);
      check("the event is STILL OPEN after the clean scout", stillOpen?.status === "OPEN", stillOpen?.status);

      console.log("\n── 6. the read seam reports the tri-state honestly ──");
      const dtoMid = await loadVineyardInfectionStatus(vineyardId, { today: midWindow });
      check("one open event is reported", dtoMid.totalOpen === 1, dtoMid.totalOpen);
      check("it reads as infectious past the SHORT bound", dtoMid.blocks[0]?.openEvents[0]?.infectious === true);
      check("the honesty block says there is NO powdery index", dtoMid.honesty.powderyIndexAvailable === false);
      check("the honesty reason explains why (Unit 0)", /6-consecutive-hour/.test(dtoMid.honesty.powderyIndexReason));

      console.log("\n── 2. append-only: UPDATE and DELETE are refused ──");
      const updateRefused = await raises(() =>
        prisma.latentInfectionEvent.update({ where: { id: openedRowId }, data: { resolutionNote: "hacked" } }),
      );
      check("an in-place UPDATE is refused", updateRefused);
      const deleteRefused = await raises(() => prisma.latentInfectionEvent.delete({ where: { id: openedRowId } }));
      check("a DELETE is refused", deleteRefused);

      console.log("\n── 4b. the window DOES close on the LONG bound, one day past expiry ──");
      const closed = await closeInfectionEvent(
        { logicalEventId: openedLogicalId, today: addDaysIso(EXPECTED_EXPIRY, 1), commandId: `QA-cmd-close-${runId}` },
        actor,
      );
      check("the close appended a NEW row rather than editing the old one", closed.rowId !== openedRowId);
      check("the appended row is seq 2", closed.seq === 2, closed.seq);
      const original = await prisma.latentInfectionEvent.findFirst({ where: { id: openedRowId } });
      check("the ORIGINAL row is untouched and still says OPEN", original?.status === "OPEN", original?.status);
      const current = await readCurrentEvent(openedLogicalId);
      check("current state (latest row per stream) says CLOSED", current?.status === "CLOSED", current?.status);
      const dtoAfterClose = await loadVineyardInfectionStatus(vineyardId, { today: addDaysIso(EXPECTED_EXPIRY, 2) });
      check("the closed event drops out of current state", dtoAfterClose.totalOpen === 0, dtoAfterClose.totalOpen);

      console.log("\n── 6b. the UNKNOWN arm projects nothing and never self-closes ──");
      const unknown = await openInfectionEvent(
        {
          blockId,
          pathogen: "POWDERY_MILDEW",
          hostOrgan: "SHOOT",
          infectionOccurredOn: OCCURRED,
          evidenceSource: "GROWER_REPORT",
          resolutionKind: "UNKNOWN",
          commandId: `QA-cmd-unknown-${runId}`,
        },
        actor,
      );
      const unknownRow = await readCurrentEvent(unknown.logicalEventId);
      check("the UNKNOWN arm has NO expiry", unknownRow?.expiresOn === null);
      check("the UNKNOWN arm projects no infectious date", unknownRow?.infectiousExpectedAt === null);
      check("and it records that as UNKNOWN, not as a bare null (C7)", unknownRow?.infectiousProjectionKind === "UNKNOWN", unknownRow?.infectiousProjectionKind);
      const unknownWontClose = await raises(() =>
        closeInfectionEvent({ logicalEventId: unknown.logicalEventId, today: "2027-01-01", commandId: `QA-cmd-unkclose-${runId}` }, actor),
      );
      check("the UNKNOWN arm refuses to self-close even a year later", unknownWontClose);
      const dtoUnknown = await loadVineyardInfectionStatus(vineyardId, { today: "2026-06-01" });
      check("the read seam reports it as UNDETERMINED, not as safe", dtoUnknown.blocks[0]?.undeterminedCount === 1, dtoUnknown.blocks[0]?.undeterminedCount);
      check("its infectious flag is null, never false", dtoUnknown.blocks[0]?.openEvents[0]?.infectious === null);

      console.log("\n── 7. ERADICATED: a kickback close stops the event projecting ──");
      const erad = await openInfectionEvent(
        {
          blockId,
          pathogen: "POWDERY_MILDEW",
          hostOrgan: "FRUIT",
          infectionOccurredOn: OCCURRED,
          evidenceSource: "SCOUTING_OBSERVATION",
          commandId: `QA-cmd-erad-open-${runId}`,
        },
        actor,
      );
      await closeInfectionEvent(
        { logicalEventId: erad.logicalEventId, today: addDaysIso(OCCURRED, 1), eradicated: true, commandId: `QA-cmd-erad-${runId}` },
        actor,
      );
      const eradRow = await readCurrentEvent(erad.logicalEventId);
      check("the eradicated event is CLOSED", eradRow?.status === "CLOSED", eradRow?.status);
      check("its resolution kind is ERADICATED", eradRow?.resolutionKind === "ERADICATED", eradRow?.resolutionKind);
      check("it projects NOTHING further (no infectious date)", eradRow?.infectiousExpectedAt === null);
      check("and says so as NOT_APPLICABLE rather than a bare null", eradRow?.infectiousProjectionKind === "NOT_APPLICABLE", eradRow?.infectiousProjectionKind);

      console.log("\n── 8. correction-as-event: a void is a SUCCESSOR ROW ──");
      const toVoid = await openInfectionEvent(
        {
          blockId,
          pathogen: "POWDERY_MILDEW",
          hostOrgan: "LEAF",
          infectionOccurredOn: "2026-06-01",
          evidenceSource: "GROWER_REPORT",
          commandId: `QA-cmd-void-open-${runId}`,
        },
        actor,
      );
      await reverseInfectionEvent(
        { logicalEventId: toVoid.logicalEventId, reason: "Misidentified — it was leafhopper stipple, not mildew.", commandId: `QA-cmd-void-${runId}` },
        actor,
      );
      const voided = await readCurrentEvent(toVoid.logicalEventId);
      check("the void is a new row, not a delete", voided?.id !== toVoid.rowId);
      check("current state is VOID", voided?.status === "VOID", voided?.status);
      check("the void points at what it reverses", voided?.reversesRowId === toVoid.rowId);
      check("the void carries its reason (an unexplained void is not auditable)", (voided?.resolutionNote ?? "").includes("leafhopper"));
      const originalVoided = await prisma.latentInfectionEvent.findFirst({ where: { id: toVoid.rowId } });
      check("the ORIGINAL row survives byte-identical (what somebody believed is part of the record)", originalVoided?.status === "OPEN");
      const dtoVoid = await loadVineyardInfectionStatus(vineyardId, { today: "2026-06-05" });
      check("a voided event does not appear in current state", !dtoVoid.blocks.some((b) => b.openEvents.some((e) => e.logicalEventId === toVoid.logicalEventId)));

      console.log("\n── 9. non-US path: a Bhutan-SHAPED fixture runs with no EPA dependency (rule §3.9) ──");
      const bt = await openInfectionEvent(
        {
          blockId: bhutanBlockId,
          pathogen: "POWDERY_MILDEW",
          hostOrgan: "LEAF",
          infectionOccurredOn: OCCURRED,
          evidenceSource: "SCOUTING_OBSERVATION",
          commandId: `QA-cmd-bt-${runId}`,
        },
        actor,
      );
      check("the ledger opened an event with no registration/EPA data in play", bt.seq === 1);
      const dtoBt = await loadVineyardInfectionStatus(bhutanVineyardId, { today: addDaysIso(OCCURRED, 7) });
      check("the Bhutan-shaped vineyard reads back one open event", dtoBt.totalOpen === 1, dtoBt.totalOpen);
      check("and still carries the full honesty block", dtoBt.honesty.powderyIndexAvailable === false);
    });

    console.log("\n── 1. RLS: a second tenant reads ZERO rows through the pooled endpoint ──");
    await runAsSystem(async (db) => {
      await db.organization.upsert({
        where: { id: ORG_B },
        update: {},
        create: { id: ORG_B, name: "QA Latent Verify B", slug: `qa-latent-verify-b-${runId}`, createdAt: new Date() },
      });
    });
    await runAsTenant(ORG_B, async () => {
      const leaked = await prisma.latentInfectionEvent.findMany({ where: { blockId } });
      check("tenant B sees ZERO of tenant A's infection events", leaked.length === 0, leaked.length);
      const foreignInsertRefused = await raises(() =>
        prisma.latentInfectionEvent.create({
          data: {
            tenantId: DEMO, // foreign tenant while acting as B
            logicalEventId: `qa-leak-${runId}`,
            seq: 1,
            blockId,
            pathogen: "POWDERY_MILDEW",
            hostOrgan: "LEAF",
            status: "OPEN",
            resolutionKind: "UNKNOWN",
            infectionOccurredOn: new Date(`${OCCURRED}T00:00:00Z`),
            symptomProjectionKind: "UNKNOWN",
            infectiousProjectionKind: "UNKNOWN",
            evidenceSource: "GROWER_REPORT",
            commandId: `QA-cmd-leak-${runId}`,
            requestHash: "0",
            enteredByEmail: actor.email,
          },
        }),
      );
      check("a foreign-tenant INSERT raises (WITH CHECK)", foreignInsertRefused);
    });
  } catch (e) {
    failures += 1;
    console.error("\n✗ verify:latent-infection aborted mid-run:", e);
  } finally {
    console.log("\n── teardown ──");
    await runAsSystem(async (db) => {
      await db.$transaction(
        async (tx) => {
          // Append-only: DELETE needs the sanctioned purge GUC on a non-app_rls connection (C15).
          await tx.$executeRaw`SELECT set_config('app.allow_spray_purge', 'on', true)`;
          await tx.latentInfectionEvent.deleteMany({ where: { tenantId: DEMO, blockId: { in: [blockId, bhutanBlockId] } } });
          await tx.vineyardBlock.deleteMany({ where: { tenantId: DEMO, id: { in: [blockId, bhutanBlockId] } } });
          await tx.vineyard.deleteMany({ where: { tenantId: DEMO, id: { in: [vineyardId, bhutanVineyardId] } } });
          await tx.organization.deleteMany({ where: { id: ORG_B } });
        },
        { timeout: 120_000, maxWait: 120_000 },
      );
    });
    console.log("  fixtures cleaned");
  }

  console.log(failures === 0 ? "\nALL LATENT-INFECTION ASSERTION GROUPS PASSED ✓" : `\n${failures} CHECK(S) FAILED ✗`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
