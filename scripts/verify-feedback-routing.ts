import {
  FeedbackAutomationKind,
  FeedbackAutomationMode,
  FeedbackAutomationSource,
  FeedbackAutomationStatus,
  FeedbackTicketKind,
  FeedbackTriageClass,
} from "@prisma/client";
import {
  approveAutomationRun,
  automationIdempotencyKey,
  dispatchApprovedRun,
  ensurePlanAutomationRun,
  markAutomationRunFailed,
} from "../src/lib/feedback/automation";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";

const DEMO_TENANT_ID = "org_demo_winery";
const createdTicketIds: string[] = [];
const createdAssistantFeedbackIds: string[] = [];
let failures = 0;

function check(name: string, pass: boolean) {
  console.log(`${pass ? "✓" : "✗ FAIL"} ${name}`);
  if (!pass) failures++;
}

async function createProductGap(label: string, automationStatus: FeedbackAutomationStatus) {
  const ticket = await runAsTenant(DEMO_TENANT_ID, async () =>
    await prisma.feedbackTicket.create({
      data: {
        kind: FeedbackTicketKind.FEATURE_REQUEST,
        title: `[routing verification] ${label}`,
        body: "Temporary Demo Winery fixture for PLAN versus AGENTIC_FIX routing verification.",
        actorEmail: "routing-verification@demowinery.test",
        modeAtSubmission: FeedbackAutomationMode.REPORT_ONLY,
        automationStatus,
        triageClass: FeedbackTriageClass.PRODUCT_GAP,
      },
    }),
  );
  createdTicketIds.push(ticket.id);
  return ticket;
}

async function createAssistantProductGap(label: string, automationStatus: FeedbackAutomationStatus) {
  const feedback = await runAsTenant(DEMO_TENANT_ID, async () =>
    await prisma.assistantFeedback.create({
      data: {
        rating: "down",
        comment: `[routing verification] ${label}`,
        conversation: [],
        actorEmail: "routing-verification@demowinery.test",
        modeAtSubmission: FeedbackAutomationMode.REPORT_ONLY,
        automationStatus,
        triageClass: FeedbackTriageClass.PRODUCT_GAP,
      },
    }),
  );
  createdAssistantFeedbackIds.push(feedback.id);
  return feedback;
}

async function createRun(input: {
  sourceType?: FeedbackAutomationSource;
  sourceId: string;
  kind: FeedbackAutomationKind;
  status: FeedbackAutomationStatus;
  attempt?: number;
  error?: string;
}) {
  const sourceType = input.sourceType ?? FeedbackAutomationSource.FEEDBACK_TICKET;
  const attempt = input.attempt ?? 1;
  return runAsTenant(DEMO_TENANT_ID, async () =>
    await prisma.automationRun.create({
      data: {
        sourceType,
        sourceId: input.sourceId,
        ticketId: sourceType === FeedbackAutomationSource.FEEDBACK_TICKET ? input.sourceId : null,
        assistantFeedbackId:
          sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK ? input.sourceId : null,
        kind: input.kind,
        attempt,
        status: input.status,
        error: input.error,
        idempotencyKey: automationIdempotencyKey({
          tenantId: DEMO_TENANT_ID,
          sourceType,
          sourceId: input.sourceId,
          kind: input.kind,
          attempt,
        }),
      },
    }),
  );
}

async function verifyAwaitingFixBecomesOnePlan() {
  const ticket = await createProductGap("awaiting fix superseded", FeedbackAutomationStatus.AWAITING_APPROVAL);
  const fix = await createRun({
    sourceId: ticket.id,
    kind: FeedbackAutomationKind.AGENTIC_FIX,
    status: FeedbackAutomationStatus.AWAITING_APPROVAL,
  });

  const first = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    sourceId: ticket.id,
  });
  const second = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    sourceId: ticket.id,
  });
  const state = await runAsTenant(DEMO_TENANT_ID, async () => ({
    fix: await prisma.automationRun.findUniqueOrThrow({ where: { id: fix.id } }),
    plans: await prisma.automationRun.findMany({
      where: {
        sourceId: ticket.id,
        kind: FeedbackAutomationKind.PLAN,
      },
    }),
    source: await prisma.feedbackTicket.findUniqueOrThrow({ where: { id: ticket.id } }),
  }));

  check("PRODUCT_GAP creates a PLAN run", first.ok && first.run.kind === FeedbackAutomationKind.PLAN);
  check("repeated PLAN routing returns the same run", first.ok && second.ok && first.run.id === second.run.id);
  check("only one PLAN run exists", state.plans.length === 1);
  check(
    "awaiting AGENTIC_FIX is skipped with structured reason",
    state.fix.status === FeedbackAutomationStatus.SKIPPED &&
      state.fix.completedAt !== null &&
      state.fix.error?.includes("SUPERSEDED_BY_PRODUCT_GAP_PLAN") === true,
  );
  check("source follows the PLAN awaiting state", state.source.automationStatus === FeedbackAutomationStatus.AWAITING_APPROVAL);
}

async function verifyRunningFixRefusesPlan() {
  const ticket = await createProductGap("running fix conflict", FeedbackAutomationStatus.RUNNING);
  const fix = await createRun({
    sourceId: ticket.id,
    kind: FeedbackAutomationKind.AGENTIC_FIX,
    status: FeedbackAutomationStatus.RUNNING,
  });

  const first = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    sourceId: ticket.id,
  });
  const afterFirst = await runAsTenant(DEMO_TENANT_ID, async () =>
    await prisma.feedbackTicket.findUniqueOrThrow({ where: { id: ticket.id } }),
  );
  const second = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    sourceId: ticket.id,
  });
  const state = await runAsTenant(DEMO_TENANT_ID, async () => ({
    fix: await prisma.automationRun.findUniqueOrThrow({ where: { id: fix.id } }),
    planCount: await prisma.automationRun.count({
      where: { sourceId: ticket.id, kind: FeedbackAutomationKind.PLAN },
    }),
    source: await prisma.feedbackTicket.findUniqueOrThrow({ where: { id: ticket.id } }),
  }));

  check("running AGENTIC_FIX blocks PLAN creation", !first.ok && first.reason === "ACTIVE_FIX_CONFLICT");
  check("repeated conflict routing remains refused", !second.ok && second.reason === "ACTIVE_FIX_CONFLICT");
  check("conflict creates no PLAN run", state.planCount === 0);
  check("running fix status remains truthful", state.fix.status === FeedbackAutomationStatus.RUNNING);
  check(
    "PRODUCT_GAP disposition and source automation status remain truthful",
    state.source.triageClass === FeedbackTriageClass.PRODUCT_GAP &&
      state.source.automationStatus === FeedbackAutomationStatus.RUNNING,
  );
  check(
    "conflict note is persisted once",
    afterFirst.developerNotes?.includes(`[automation-conflict:${fix.id}]`) === true &&
      state.source.developerNotes === afterFirst.developerNotes,
  );
}

async function verifyConcurrentPlanCreationConverges() {
  const ticket = await createProductGap("concurrent plan routing", FeedbackAutomationStatus.NOT_REQUESTED);
  const [first, second] = await Promise.all([
    ensurePlanAutomationRun({
      tenantId: DEMO_TENANT_ID,
      sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
      sourceId: ticket.id,
    }),
    ensurePlanAutomationRun({
      tenantId: DEMO_TENANT_ID,
      sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
      sourceId: ticket.id,
    }),
  ]);
  const planCount = await runAsTenant(DEMO_TENANT_ID, async () =>
    await prisma.automationRun.count({
      where: { sourceId: ticket.id, kind: FeedbackAutomationKind.PLAN },
    }),
  );
  check(
    "concurrent PLAN routing converges on one run",
    first.ok && second.ok && first.run.id === second.run.id && planCount === 1,
  );
}

async function verifyPlannedRunIsNeverRedispatched() {
  const ticket = await createProductGap("planned run reused", FeedbackAutomationStatus.PLANNED);
  const plan = await createRun({
    sourceId: ticket.id,
    kind: FeedbackAutomationKind.PLAN,
    status: FeedbackAutomationStatus.PLANNED,
  });
  const result = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    sourceId: ticket.id,
  });
  const planCount = await runAsTenant(DEMO_TENANT_ID, async () =>
    await prisma.automationRun.count({
      where: { sourceId: ticket.id, kind: FeedbackAutomationKind.PLAN },
    }),
  );
  check("PLANNED run is returned idempotently", result.ok && result.run.id === plan.id);
  check("PLANNED run is not duplicated", planCount === 1);
}

async function verifyReusablePlanSurvivesTerminalRetry() {
  const ticket = await createProductGap("reusable plan beats failed retry", FeedbackAutomationStatus.PLANNED);
  const planned = await createRun({
    sourceId: ticket.id,
    kind: FeedbackAutomationKind.PLAN,
    status: FeedbackAutomationStatus.PLANNED,
    attempt: 1,
  });
  await createRun({
    sourceId: ticket.id,
    kind: FeedbackAutomationKind.PLAN,
    status: FeedbackAutomationStatus.FAILED,
    attempt: 2,
  });
  const result = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    sourceId: ticket.id,
  });
  check(
    "a newer failed PLAN attempt does not mask reusable planned work",
    result.ok && result.run.id === planned.id,
  );
}

async function verifyAssistantFeedbackRoutingBranches() {
  const awaiting = await createAssistantProductGap(
    "assistant awaiting fix superseded",
    FeedbackAutomationStatus.AWAITING_APPROVAL,
  );
  const awaitingFix = await createRun({
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
    sourceId: awaiting.id,
    kind: FeedbackAutomationKind.AGENTIC_FIX,
    status: FeedbackAutomationStatus.AWAITING_APPROVAL,
  });
  const planned = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
    sourceId: awaiting.id,
  });
  const awaitingState = await runAsTenant(DEMO_TENANT_ID, async () => ({
    fix: await prisma.automationRun.findUniqueOrThrow({ where: { id: awaitingFix.id } }),
    source: await prisma.assistantFeedback.findUniqueOrThrow({ where: { id: awaiting.id } }),
  }));
  check(
    "assistant PRODUCT_GAP creates a PLAN and skips its awaiting fix",
    planned.ok &&
      planned.run.kind === FeedbackAutomationKind.PLAN &&
      awaitingState.fix.status === FeedbackAutomationStatus.SKIPPED &&
      awaitingState.source.automationStatus === FeedbackAutomationStatus.AWAITING_APPROVAL,
  );

  const running = await createAssistantProductGap(
    "assistant running fix conflict",
    FeedbackAutomationStatus.RUNNING,
  );
  const runningFix = await createRun({
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
    sourceId: running.id,
    kind: FeedbackAutomationKind.AGENTIC_FIX,
    status: FeedbackAutomationStatus.RUNNING,
  });
  const conflict = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.ASSISTANT_FEEDBACK,
    sourceId: running.id,
  });
  const runningState = await runAsTenant(DEMO_TENANT_ID, async () =>
    await prisma.assistantFeedback.findUniqueOrThrow({ where: { id: running.id } }),
  );
  check(
    "assistant running fix blocks PLAN and records the conflict",
    !conflict.ok &&
      conflict.reason === "ACTIVE_FIX_CONFLICT" &&
      runningState.automationStatus === FeedbackAutomationStatus.RUNNING &&
      runningState.developerNotes?.includes(`[automation-conflict:${runningFix.id}]`) === true,
  );
}

async function verifyExpectedKindApprovalFence() {
  const ticket = await createProductGap("expected-kind approval fence", FeedbackAutomationStatus.NOT_REQUESTED);
  const ensured = await ensurePlanAutomationRun({
    tenantId: DEMO_TENANT_ID,
    sourceType: FeedbackAutomationSource.FEEDBACK_TICKET,
    sourceId: ticket.id,
  });
  if (!ensured.ok) {
    check("expected-kind approval fixture creates a PLAN", false);
    return;
  }

  const rejected = await approveAutomationRun({
    tenantId: DEMO_TENANT_ID,
    runId: ensured.run.id,
    approverUserId: "routing-verification",
    expectedKind: FeedbackAutomationKind.AGENTIC_FIX,
  });
  const afterReject = await runAsTenant(DEMO_TENANT_ID, async () =>
    await prisma.automationRun.findUniqueOrThrow({ where: { id: ensured.run.id } }),
  );
  check(
    "AGENTIC_FIX approval cannot claim an awaiting PLAN",
    rejected === null && afterReject.status === FeedbackAutomationStatus.AWAITING_APPROVAL,
  );

  const approved = await approveAutomationRun({
    tenantId: DEMO_TENANT_ID,
    runId: ensured.run.id,
    approverUserId: "routing-verification",
    expectedKind: FeedbackAutomationKind.PLAN,
  });
  check(
    "matching PLAN approval advances to QUEUED",
    approved?.status === FeedbackAutomationStatus.QUEUED,
  );
}

async function verifyDispatchFailureRecovery() {
  const originalFetch = globalThis.fetch;
  const originalRepository = process.env.GITHUB_REPOSITORY;
  const originalToken = process.env.GITHUB_DISPATCH_TOKEN;
  process.env.GITHUB_REPOSITORY = "demo/wine-inventory";
  process.env.GITHUB_DISPATCH_TOKEN = "routing-verification-token";

  try {
    const retryTicket = await createProductGap("queued dispatch retry", FeedbackAutomationStatus.QUEUED);
    const retryRun = await createRun({
      sourceId: retryTicket.id,
      kind: FeedbackAutomationKind.PLAN,
      status: FeedbackAutomationStatus.QUEUED,
      error: "GitHub dispatch is not configured.",
    });
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    const retried = await dispatchApprovedRun(retryRun.id, DEMO_TENANT_ID);
    const retriedState = await runAsTenant(DEMO_TENANT_ID, async () =>
      await prisma.automationRun.findUniqueOrThrow({ where: { id: retryRun.id } }),
    );
    check(
      "successful queued dispatch retry clears the stale error",
      retried &&
        retriedState.status === FeedbackAutomationStatus.RUNNING &&
        retriedState.error === null,
    );
    const finalized = await markAutomationRunFailed({
      tenantId: DEMO_TENANT_ID,
      runId: retryRun.id,
      error: "GitHub Actions workflow failed: https://github.com/demo/wine-inventory/actions/runs/1",
    });
    const finalizedState = await runAsTenant(DEMO_TENANT_ID, async () =>
      await prisma.automationRun.findUniqueOrThrow({ where: { id: retryRun.id } }),
    );
    check(
      "accepted dispatch followed by workflow failure is written back",
      finalized &&
        finalizedState.status === FeedbackAutomationStatus.FAILED &&
        finalizedState.completedAt !== null &&
        finalizedState.error?.includes("actions/runs/1") === true,
    );

    const failureTicket = await createProductGap("transport failure", FeedbackAutomationStatus.QUEUED);
    const failureRun = await createRun({
      sourceId: failureTicket.id,
      kind: FeedbackAutomationKind.PLAN,
      status: FeedbackAutomationStatus.QUEUED,
    });
    globalThis.fetch = (async () => {
      throw new Error("simulated connection reset");
    }) as typeof fetch;
    const dispatched = await dispatchApprovedRun(failureRun.id, DEMO_TENANT_ID);
    const failedState = await runAsTenant(DEMO_TENANT_ID, async () => ({
      run: await prisma.automationRun.findUniqueOrThrow({ where: { id: failureRun.id } }),
      source: await prisma.feedbackTicket.findUniqueOrThrow({ where: { id: failureTicket.id } }),
    }));
    check(
      "transport failure becomes a terminal reconciliation-required state",
      !dispatched &&
        failedState.run.status === FeedbackAutomationStatus.FAILED &&
        failedState.run.completedAt !== null &&
        failedState.run.error?.includes("outcome is unknown") === true &&
        failedState.source.automationStatus === FeedbackAutomationStatus.FAILED,
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRepository === undefined) delete process.env.GITHUB_REPOSITORY;
    else process.env.GITHUB_REPOSITORY = originalRepository;
    if (originalToken === undefined) delete process.env.GITHUB_DISPATCH_TOKEN;
    else process.env.GITHUB_DISPATCH_TOKEN = originalToken;
  }
}

async function main() {
  const demo = await prisma.organization.findUnique({ where: { id: DEMO_TENANT_ID }, select: { id: true } });
  if (!demo) throw new Error("Demo Winery is missing; run npm run seed:demo-tenant before this verification.");
  await verifyAwaitingFixBecomesOnePlan();
  await verifyRunningFixRefusesPlan();
  await verifyConcurrentPlanCreationConverges();
  await verifyPlannedRunIsNeverRedispatched();
  await verifyReusablePlanSurvivesTerminalRetry();
  await verifyAssistantFeedbackRoutingBranches();
  await verifyExpectedKindApprovalFence();
  await verifyDispatchFailureRecovery();
}

main()
  .catch((error) => {
    console.error(error);
    failures++;
  })
  .finally(async () => {
    if (createdTicketIds.length > 0) {
      await runAsTenant(DEMO_TENANT_ID, async () =>
        await prisma.feedbackTicket.deleteMany({ where: { id: { in: createdTicketIds } } }),
      );
    }
    if (createdAssistantFeedbackIds.length > 0) {
      await runAsTenant(DEMO_TENANT_ID, async () =>
        await prisma.assistantFeedback.deleteMany({
          where: { id: { in: createdAssistantFeedbackIds } },
        }),
      );
    }
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  });
