import "server-only";

import {
  FeedbackAutomationMode,
  FeedbackAutomationSource,
  FeedbackItemStatus,
  FeedbackTicketKind,
  FeedbackTriageClass,
} from "@prisma/client";
import { ActionError } from "@/lib/action-error";
import { linkFeedbackToLinearCore } from "@/lib/developer/linear-link-actions";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";

const TENANT_ID = "org_demo_winery";
const ACTOR = { id: "developer-linear-link-verify", email: "linear-verify@demowinery.test" };
const createdTicketIds: string[] = [];
const createdAssistantIds: string[] = [];
let failures = 0;

function check(name: string, pass: boolean, detail = "") {
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failures++;
}

function transactionBarrier(parties: number) {
  let arrivals = 0;
  let release!: () => void;
  let reject!: (error: Error) => void;
  let timeout: NodeJS.Timeout | undefined;
  const released = new Promise<void>((resolve, rejectPromise) => {
    release = resolve;
    reject = rejectPromise;
  });
  return {
    wait: async () => {
      arrivals++;
      if (arrivals === 1) {
        timeout = setTimeout(
          () => reject(new Error(`Transaction barrier timed out after ${arrivals}/${parties} arrivals.`)),
          4_000,
        );
      }
      if (arrivals >= parties) {
        if (timeout) clearTimeout(timeout);
        release();
      }
      await released;
    },
    arrivals: () => arrivals,
  };
}

async function settledPair<T>(first: Promise<T>, second: Promise<T>): Promise<[T, T]> {
  const settled = await Promise.allSettled([first, second]);
  if (settled[0].status === "rejected") throw settled[0].reason;
  if (settled[1].status === "rejected") throw settled[1].reason;
  return [settled[0].value, settled[1].value];
}

async function createTicket(label: string) {
  const ticket = await runAsTenant(TENANT_ID, () =>
    prisma.feedbackTicket.create({
      data: {
        kind: FeedbackTicketKind.FEATURE_REQUEST,
        title: `[linear verification] ${label}`,
        body: "Temporary Demo Winery fixture for Linear handoff verification.",
        actorEmail: ACTOR.email,
        modeAtSubmission: FeedbackAutomationMode.REPORT_ONLY,
        status: FeedbackItemStatus.NEW,
        triageClass: FeedbackTriageClass.PRODUCT_GAP,
      },
    }),
  );
  createdTicketIds.push(ticket.id);
  return ticket;
}

async function createAssistantFeedback(label: string) {
  const feedback = await runAsTenant(TENANT_ID, () =>
    prisma.assistantFeedback.create({
      data: {
        rating: "down",
        comment: `[linear verification] ${label}`,
        conversation: [],
        actorEmail: ACTOR.email,
        modeAtSubmission: FeedbackAutomationMode.REPORT_ONLY,
        status: "NEW",
        triageClass: FeedbackTriageClass.DEFECT,
      },
    }),
  );
  createdAssistantIds.push(feedback.id);
  return feedback;
}

function linkInput(input: {
  sourceType: FeedbackAutomationSource;
  id: string;
  key: string;
  replace?: boolean;
  expectedVersion?: number;
  confirmFanIn?: boolean;
  tenantId?: string;
}) {
  return {
    tenantId: input.tenantId ?? TENANT_ID,
    sourceType: input.sourceType,
    id: input.id,
    linearIssueKey: input.key,
    normalizedUrl: `https://linear.app/wine-inventory/issue/${input.key}/verification`,
    replace: input.replace ?? false,
    expectedVersion: input.expectedVersion,
    confirmFanIn: input.confirmFanIn ?? false,
  };
}

async function expectNotFound(name: string, input: ReturnType<typeof linkInput>) {
  try {
    await linkFeedbackToLinearCore(ACTOR, input);
    check(name, false, "unexpectedly succeeded");
  } catch (error) {
    check(
      name,
      error instanceof ActionError && error.message === "Feedback item not found.",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function main() {
  const demo = await prisma.organization.findUnique({
    where: { id: TENANT_ID },
    select: { id: true },
  });
  if (!demo) throw new Error("Demo Winery is missing; run npm run seed:demo-tenant first.");
  // Remove only this verifier's stale fixtures from an interrupted prior run.
  await runAsTenant(TENANT_ID, async () => {
    await prisma.auditLog.deleteMany({
      where: { entityType: "FeedbackLinearLink", actorEmail: ACTOR.email },
    });
    await prisma.feedbackTicket.deleteMany({ where: { actorEmail: ACTOR.email } });
    await prisma.assistantFeedback.deleteMany({ where: { actorEmail: ACTOR.email } });
  });

  const firstTicket = await createTicket("first create and replacement");
  const firstInput = linkInput({
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    id: firstTicket.id,
    key: "WIN-97001",
  });
  await expectNotFound(
    "wrong source discriminator fails closed",
    linkInput({
      sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
      id: firstTicket.id,
      key: "WIN-97991",
    }),
  );
  await expectNotFound(
    "wrong tenant fails closed",
    linkInput({
      sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
      id: firstTicket.id,
      key: "WIN-97992",
      tenantId: "org_linear_verify_not_a_tenant",
    }),
  );

  const created = await linkFeedbackToLinearCore(ACTOR, firstInput);
  check("first create succeeds", created.ok && !created.idempotent && created.link.version === 1);
  const firstState = await runAsTenant(TENANT_ID, async () => ({
    source: await prisma.feedbackTicket.findUniqueOrThrow({ where: { id: firstTicket.id } }),
    audits: await prisma.auditLog.findMany({
      where: { entityType: "FeedbackLinearLink", entityId: created.ok ? created.link.id : "" },
    }),
  }));
  check(
    "first create advances NEW to TRIAGED and prepends history",
    firstState.source.status === FeedbackItemStatus.TRIAGED &&
      firstState.source.developerNotes?.includes("Promoted to Linear WIN-97001") === true,
  );
  check("first create writes one tenant audit", firstState.audits.length === 1);

  const same = await linkFeedbackToLinearCore(ACTOR, firstInput);
  const idempotentState = await runAsTenant(TENANT_ID, async () => ({
    source: await prisma.feedbackTicket.findUniqueOrThrow({ where: { id: firstTicket.id } }),
    auditCount: await prisma.auditLog.count({
      where: { entityType: "FeedbackLinearLink", entityId: created.ok ? created.link.id : "" },
    }),
  }));
  check(
    "same normalized URL is idempotent",
    same.ok && same.idempotent && same.link.version === 1,
  );
  check(
    "idempotent retry creates no duplicate note or audit",
    idempotentState.source.developerNotes === firstState.source.developerNotes &&
      idempotentState.auditCount === 1,
  );

  const different = await linkFeedbackToLinearCore(
    ACTOR,
    linkInput({
      sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
      id: firstTicket.id,
      key: "WIN-97002",
    }),
  );
  check("different URL without replace returns a visible conflict", !different.ok && different.reason === "DIFFERENT_LINK");

  const stale = await linkFeedbackToLinearCore(
    ACTOR,
    linkInput({
      sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
      id: firstTicket.id,
      key: "WIN-97002",
      replace: true,
      expectedVersion: 999,
    }),
  );
  check("stale explicit replacement is rejected", !stale.ok && stale.reason === "STALE_VERSION");

  const replaced = await linkFeedbackToLinearCore(
    ACTOR,
    linkInput({
      sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
      id: firstTicket.id,
      key: "WIN-97002",
      replace: true,
      expectedVersion: 1,
    }),
  );
  check(
    "fresh explicit replacement increments version",
    replaced.ok && replaced.replaced && replaced.link.version === 2,
  );
  const replacementState = await runAsTenant(TENANT_ID, () =>
    prisma.feedbackTicket.findUniqueOrThrow({ where: { id: firstTicket.id } }),
  );
  check(
    "replacement history retains the earlier entry",
    replacementState.developerNotes?.includes("Replaced Linear link WIN-97001 -> WIN-97002") === true &&
      replacementState.developerNotes.includes("Promoted to Linear WIN-97001"),
  );

  const secondTicket = await createTicket("same-key fan-in");
  const fanInInput = linkInput({
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    id: secondTicket.id,
    key: "WIN-97002",
  });
  const warning = await linkFeedbackToLinearCore(ACTOR, fanInInput);
  check(
    "same-key fan-in requires explicit current-tenant confirmation",
    !warning.ok &&
      warning.reason === "FAN_IN_CONFIRMATION_REQUIRED" &&
      warning.tenantLinearKeySourceCount === 1,
  );
  const confirmed = await linkFeedbackToLinearCore(ACTOR, { ...fanInInput, confirmFanIn: true });
  check(
    "confirmed same-key fan-in is allowed and tenant-local count is returned",
    confirmed.ok && confirmed.tenantLinearKeySourceCount === 2,
  );

  const racingFeedback = await createAssistantFeedback("same URL race");
  const raceInput = linkInput({
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
    id: racingFeedback.id,
    key: "WIN-97003",
  });
  const sameUrlBarrier = transactionBarrier(2);
  const [raceA, raceB] = await settledPair(
    linkFeedbackToLinearCore(ACTOR, raceInput, {
      afterExistingLinkRead: sameUrlBarrier.wait,
    }),
    linkFeedbackToLinearCore(ACTOR, raceInput, {
      afterExistingLinkRead: sameUrlBarrier.wait,
    }),
  );
  const raceCount = await runAsTenant(TENANT_ID, () =>
    prisma.feedbackLinearLink.count({ where: { assistantFeedbackId: racingFeedback.id } }),
  );
  check(
    "same URL race converges on one link",
    sameUrlBarrier.arrivals() >= 2 &&
      raceA.ok &&
      raceB.ok &&
      raceA.link.id === raceB.link.id &&
      raceCount === 1,
  );

  const differentRaceFeedback = await createAssistantFeedback("different URL race");
  const differentRaceA = linkInput({
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
    id: differentRaceFeedback.id,
    key: "WIN-97004",
  });
  const differentRaceB = linkInput({
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
    id: differentRaceFeedback.id,
    key: "WIN-97005",
  });
  const differentUrlBarrier = transactionBarrier(2);
  const [differentResultA, differentResultB] = await settledPair(
    linkFeedbackToLinearCore(ACTOR, differentRaceA, {
      afterExistingLinkRead: differentUrlBarrier.wait,
    }),
    linkFeedbackToLinearCore(ACTOR, differentRaceB, {
      afterExistingLinkRead: differentUrlBarrier.wait,
    }),
  );
  const differentRaceState = await runAsTenant(TENANT_ID, async () => ({
    links: await prisma.feedbackLinearLink.findMany({
      where: { assistantFeedbackId: differentRaceFeedback.id },
    }),
    source: await prisma.assistantFeedback.findUniqueOrThrow({
      where: { id: differentRaceFeedback.id },
    }),
  }));
  const differentRaceSuccesses = [differentResultA, differentResultB].filter(
    (result) => result.ok,
  );
  const differentRaceConflicts = [differentResultA, differentResultB].filter(
    (result) => !result.ok && result.reason === "DIFFERENT_LINK",
  );
  const differentRaceAudits = await runAsTenant(TENANT_ID, () =>
    prisma.auditLog.count({
      where: {
        entityType: "FeedbackLinearLink",
        entityId: differentRaceState.links[0]?.id ?? "missing",
      },
    }),
  );
  check(
    "different URL first-create race has one winner and one visible conflict",
    differentUrlBarrier.arrivals() >= 2 &&
      differentRaceSuccesses.length === 1 &&
      differentRaceConflicts.length === 1 &&
      differentRaceState.links.length === 1,
  );
  check(
    "different URL race writes exactly one note and one audit",
    (differentRaceState.source.developerNotes?.match(/Promoted to Linear/g)?.length ?? 0) === 1 &&
      differentRaceAudits === 1,
  );

  const staleEditorTicket = await createTicket("stale editor protection");
  const staleEditorSnapshot = await runAsTenant(TENANT_ID, () =>
    prisma.feedbackTicket.findUniqueOrThrow({ where: { id: staleEditorTicket.id } }),
  );
  await linkFeedbackToLinearCore(
    ACTOR,
    linkInput({
      sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
      id: staleEditorTicket.id,
      key: "WIN-97006",
    }),
  );
  const staleEditorWrite = await runAsTenant(TENANT_ID, () =>
    prisma.feedbackTicket.updateMany({
      where: {
        tenantId: TENANT_ID,
        id: staleEditorTicket.id,
        developerNotesVersion: staleEditorSnapshot.developerNotesVersion,
      },
      data: {
        developerNotes: "stale editor overwrite",
        developerNotesVersion: { increment: 1 },
      },
    }),
  );
  const staleEditorFinal = await runAsTenant(TENANT_ID, () =>
    prisma.feedbackTicket.findUniqueOrThrow({ where: { id: staleEditorTicket.id } }),
  );
  check(
    "stale editor cannot erase Linear handoff history",
    staleEditorWrite.count === 0 &&
      staleEditorFinal.developerNotes?.includes("Promoted to Linear WIN-97006") === true,
  );
}

main()
  .catch((error) => {
    console.error(error);
    failures++;
  })
  .finally(async () => {
    await runAsTenant(TENANT_ID, async () => {
      await prisma.auditLog.deleteMany({
        where: { entityType: "FeedbackLinearLink", actorEmail: ACTOR.email },
      });
      if (createdTicketIds.length) {
        await prisma.feedbackTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
      }
      if (createdAssistantIds.length) {
        await prisma.assistantFeedback.deleteMany({ where: { id: { in: createdAssistantIds } } });
      }
    }).catch((error) => {
      console.error("Linear verification cleanup failed:", error);
      failures++;
    });
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
