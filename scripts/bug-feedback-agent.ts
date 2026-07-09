/**
 * Bug feedback agent entrypoint. The actual code-writing path is intentionally
 * fenced in the workflow; --dry-run validates that a run can be loaded without
 * touching the working tree.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { FeedbackAutomationKind, PrismaClient } from "@prisma/client";

function setOutput(key: string, value: string) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) appendFileSync(out, `${key}=${value}\n`);
  console.log(`::output:: ${key}=${value}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const runId = process.env.AUTOMATION_RUN_ID || process.argv.find((a) => a.startsWith("--run="))?.slice(6);
  const prisma = new PrismaClient();
  try {
    const run = runId ? await prisma.automationRun.findUnique({ where: { id: runId } }) : null;
    if (run && run.kind !== FeedbackAutomationKind.AGENTIC_FIX) {
      throw new Error("AutomationRun is not AGENTIC_FIX.");
    }
    writeFileSync(
      ".feedback-bug-body.md",
      [
        `Draft fix from feedback automation ${run?.id ?? "dry-run"}.`,
        "",
        "This PR was opened only after developer approval. Review carefully before merging.",
      ].join("\n"),
      "utf8",
    );
    setOutput("changed", dryRun ? "false" : "false");
    setOutput("branch", `feedback-bug/${(run?.id ?? "dryrun").slice(0, 8)}`);
    setOutput("title", `feedback: bug fix ${run?.id.slice(0, 8) ?? "dry-run"}`);
    console.log(dryRun ? "Dry-run bug agent valid." : "No automatic edits produced by scaffold agent.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
