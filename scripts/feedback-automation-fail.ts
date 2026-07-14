/**
 * Mark a RUNNING feedback automation as FAILED when its GitHub Actions workflow
 * exits unsuccessfully. Successful/terminal runs are left unchanged.
 */
import { markAutomationRunFailed } from "../src/lib/feedback/automation";
import { disconnectSystem, runAsSystem } from "../src/lib/tenant/system";

async function main() {
  const [runId, workflowUrl] = process.argv.slice(2);
  if (!runId) {
    console.error("Usage: feedback-automation-fail <automationRunId> [workflowUrl]");
    process.exit(2);
  }

  const tenantId = await runAsSystem(async (db) => {
    const run = await db.automationRun.findUnique({
      where: { id: runId },
      select: { tenantId: true },
    });
    return run?.tenantId ?? null;
  });
  if (!tenantId) {
    console.error(`AutomationRun ${runId} was not found.`);
    process.exit(1);
  }

  const marked = await markAutomationRunFailed({
    tenantId,
    runId,
    error: workflowUrl
      ? `GitHub Actions workflow failed: ${workflowUrl}`
      : "GitHub Actions workflow failed; inspect the workflow run before retrying.",
  });
  console.log(JSON.stringify({ ok: true, runId, marked }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectSystem();
    process.exit(process.exitCode ?? 0);
  });
