/**
 * Mark a feedback row TRIAGED with the PR URL after the workflow opens a PR.
 * Usage: tsx scripts/assistant-feedback-mark.ts <feedbackId> <prUrl>
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const [feedbackId, prUrl] = process.argv.slice(2);
  if (!feedbackId) {
    console.error("Usage: assistant-feedback-mark <feedbackId> <prUrl>");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    await prisma.assistantFeedback.update({
      where: { id: feedbackId },
      data: { status: "TRIAGED", prUrl: prUrl ?? null },
    });
    console.log(`Marked ${feedbackId} TRIAGED${prUrl ? ` (${prUrl})` : ""}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
