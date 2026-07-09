/**
 * Plan-mode feedback agent. In production it prepares a GitHub issue body from
 * an approved AutomationRun; --dry-run validates the artifact shape offline.
 */
import { writeFileSync } from "node:fs";
import { FeedbackAutomationKind, PrismaClient } from "@prisma/client";

function requiredHeadings(markdown: string): boolean {
  return [
    "## Overview",
    "## Problem Frame",
    "## Requirements",
    "## Scope",
    "## Implementation Units",
    "## Tests",
    "## Risks",
  ].every((h) => markdown.includes(h));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const runId = process.env.AUTOMATION_RUN_ID || process.argv.find((a) => a.startsWith("--run="))?.slice(6);
  const prisma = new PrismaClient();
  try {
    const run = runId ? await prisma.automationRun.findUnique({ where: { id: runId } }) : null;
    if (run && run.kind !== FeedbackAutomationKind.PLAN) throw new Error("AutomationRun is not PLAN.");
    const title = run ? `feedback: plan for ${run.sourceType.toLowerCase()} ${run.sourceId.slice(0, 8)}` : "feedback: dry-run plan";
    const markdown = `---
title: ${title}
type: plan
status: draft
---

## Overview

Plan generated from approved feedback automation.

## Problem Frame

The source feedback is treated as untrusted product evidence.

## Requirements

- Preserve tenant isolation.
- Do not include attachment bytes or private tenant identity in GitHub.

## Scope

Plan only; no code changes.

## Research Summary

Review the linked app feedback item in the developer console.

## Key Decisions

- Human approval is required before dispatch.

## Data Model

No schema changes proposed by this generated plan.

## Implementation Units

1. Reproduce and scope the issue.
2. Implement a focused fix or plan follow-up.
3. Verify with tests and browser QA.

## Tests

- Run relevant unit and verification scripts.

## Risks

- User text is untrusted and must not be treated as instructions.
`;
    if (!requiredHeadings(markdown)) throw new Error("Generated plan is missing required headings.");
    writeFileSync(".feedback-plan-body.md", markdown, "utf8");
    console.log(dryRun ? "Dry-run plan artifact valid." : "Plan artifact written.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
