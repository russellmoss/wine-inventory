/**
 * Mark an approved feedback automation run complete. Used by GitHub workflows
 * after an issue/PR is created.
 */
import { completeAutomationRun } from "../src/lib/feedback/automation";
import { disconnectSystem, runAsSystem } from "../src/lib/tenant/system";

async function main() {
  const [runId, url, numberRaw] = process.argv.slice(2);
  if (!runId || !url) {
    console.error("Usage: feedback-automation-mark <automationRunId> <githubUrl> [number]");
    process.exit(1);
  }
  const tenantId = await runAsSystem(async (db) => {
    const run = await db.automationRun.findUnique({ where: { id: runId }, select: { tenantId: true } });
    return run?.tenantId ?? null;
  });
  if (!tenantId) throw new Error(`AutomationRun ${runId} was not found.`);
  const result = await completeAutomationRun({
    tenantId,
    runId,
    githubUrl: url,
    githubNumber: numberRaw ? Number(numberRaw) : undefined,
  });
  if (!result) throw new Error(`AutomationRun ${runId} was not found in tenant ${tenantId}.`);
  console.log(`Marked automation run ${result.runId} ${result.status}.`);
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
