/**
 * Mark an approved feedback automation run complete. Used by GitHub workflows
 * after an issue/PR is created.
 */
import { FeedbackAutomationKind, FeedbackAutomationSource, FeedbackAutomationStatus, PrismaClient } from "@prisma/client";

async function main() {
  const [runId, url, numberRaw] = process.argv.slice(2);
  if (!runId || !url) {
    console.error("Usage: feedback-automation-mark <automationRunId> <githubUrl> [number]");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const run = await prisma.automationRun.findUniqueOrThrow({ where: { id: runId } });
    const number = numberRaw ? Number(numberRaw) : undefined;
    const status =
      run.kind === FeedbackAutomationKind.PLAN
        ? FeedbackAutomationStatus.PLANNED
        : FeedbackAutomationStatus.PR_OPENED;
    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        status,
        completedAt: new Date(),
        githubUrl: url,
        githubIssueNumber: run.kind === FeedbackAutomationKind.PLAN ? number : undefined,
        githubPrNumber: run.kind === FeedbackAutomationKind.AGENTIC_FIX ? number : undefined,
      },
    });
    if (run.sourceType === FeedbackAutomationSource.ASSISTANT_FEEDBACK) {
      await prisma.assistantFeedback.update({
        where: { id: run.sourceId },
        data:
          run.kind === FeedbackAutomationKind.PLAN
            ? { automationStatus: status, githubIssueUrl: url, status: "TRIAGED" }
            : { automationStatus: status, prUrl: url, status: "TRIAGED" },
      });
    } else {
      await prisma.feedbackTicket.update({
        where: { id: run.sourceId },
        data:
          run.kind === FeedbackAutomationKind.PLAN
            ? { automationStatus: status, githubIssueUrl: url, status: "TRIAGED" }
            : { automationStatus: status, prUrl: url, status: "TRIAGED" },
      });
    }
    console.log(`Marked automation run ${run.id} ${status}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
