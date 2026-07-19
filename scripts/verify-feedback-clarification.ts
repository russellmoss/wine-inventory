// Plan 079 — end-to-end regression gate for the bug-report clarification loop.
// Runs against an ISOLATED throwaway tenant (never Demo/Bhutan) so it can't collide with other work
// on the shared DB, and blanks the GitHub dispatch token up front (fail-safe) so re-dispatch degrades
// to QUEUED and NO real CI ever fires. Deterministic: exercises the cores directly (no LLM, no CI).
//   npm run verify:feedback-clarification
process.env.GITHUB_DISPATCH_TOKEN = "";
process.env.GITHUB_REPOSITORY = "";
if (process.env.GITHUB_DISPATCH_TOKEN) {
  console.error("refusing to run: GitHub dispatch token is still set (would fire real CI).");
  process.exit(1);
}

import { PrismaClient } from "@prisma/client";
import { requestClarificationCore, advanceClarificationFromReply } from "@/lib/feedback/clarification";
import { runFeedbackAutomationSweep } from "@/lib/feedback/automation-sweep";
import { ensureSupportSenderForTenant, SUPPORT_USER_ID } from "@/lib/feedback/support-sender";

const owner = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNPOOLED } } });
const ORG = "org_qa_clarloop_verify";
const REPORTER = "user_qa_clarloop_reporter";

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean) => results.push([label, ok]);

async function cleanup() {
  const cls = await owner.feedbackClarification.findMany({ where: { tenantId: ORG }, select: { dmThreadId: true } });
  await owner.feedbackClarification.deleteMany({ where: { tenantId: ORG } });
  for (const c of cls) if (c.dmThreadId) {
    await owner.directMessage.deleteMany({ where: { threadId: c.dmThreadId } });
    await owner.inboxNotification.deleteMany({ where: { tenantId: ORG, sourceType: "dm_thread", sourceId: c.dmThreadId } });
    await owner.directMessageThread.deleteMany({ where: { id: c.dmThreadId } });
  }
  await owner.automationRun.deleteMany({ where: { tenantId: ORG } });
  await owner.feedbackTicket.deleteMany({ where: { tenantId: ORG } });
  await owner.auditLog.deleteMany({ where: { tenantId: ORG } }); // DM sends write audit rows (FK to org)
  await owner.member.deleteMany({ where: { organizationId: ORG } });
  await owner.user.deleteMany({ where: { id: REPORTER } });
  await owner.organization.deleteMany({ where: { id: ORG } });
}

async function ticketAndRun(t: string, r: string) {
  await owner.feedbackTicket.create({ data: { tenantId: ORG, id: t, kind: "BUG_REPORT", title: "verify clar", body: "thin report", actorUserId: REPORTER, actorEmail: "qa@x", modeAtSubmission: "AGENTIC_FIX", automationStatus: "QUEUED" } });
  await owner.automationRun.create({ data: { tenantId: ORG, id: r, sourceType: "FEEDBACK_TICKET", sourceId: t, ticketId: t, kind: "AGENTIC_FIX", attempt: 1, status: "QUEUED", idempotencyKey: `verifyclar:${r}` } });
}

async function main() {
  await cleanup();
  await owner.organization.create({ data: { id: ORG, name: "QA Clarloop Verify", slug: ORG } });
  await owner.user.create({ data: { id: REPORTER, name: "QA Reporter", email: "qa-clarloop-reporter@cellarhand.test", emailVerified: true } });
  await owner.member.create({ data: { organizationId: ORG, userId: REPORTER, role: "member" } });
  await ensureSupportSenderForTenant(ORG); // makes Support a member so the DM core accepts it

  // 1) ASK: a thin ticket is parked + a DM goes out as Cellarhand Support with a ref token.
  await ticketAndRun("T1", "R1");
  const ask = await requestClarificationCore({ tenantId: ORG, source: { sourceType: "FEEDBACK_TICKET", sourceId: "T1" }, automationRunId: "R1", round: 1, questions: ["What page?", "Any error?"] });
  const cl1 = await owner.feedbackClarification.findFirst({ where: { tenantId: ORG, sourceId: "T1" }, select: { id: true, ref: true, dmThreadId: true, status: true } });
  const run1 = await owner.automationRun.findUnique({ where: { id: "R1" }, select: { status: true } });
  const dm1 = cl1?.dmThreadId ? await owner.directMessage.findFirst({ where: { threadId: cl1.dmThreadId }, select: { senderUserId: true } }) : null;
  check("ask: clarification OPEN", ask.ok && cl1?.status === "OPEN");
  check("ask: run parked AWAITING_CLARIFICATION", run1?.status === "AWAITING_CLARIFICATION");
  check("ask: DM sent by Cellarhand Support", dm1?.senderUserId === SUPPORT_USER_ID);
  check("ask: second ask is idempotent (ALREADY_OPEN)", (await requestClarificationCore({ tenantId: ORG, source: { sourceType: "FEEDBACK_TICKET", sourceId: "T1" }, automationRunId: "R1", round: 1, questions: ["x"] })).ok === false);

  // 2) REPLY (substantive): ANSWERED + attempt-2 re-dispatched (QUEUED, no CI).
  await advanceClarificationFromReply({ tenantId: ORG, threadId: cl1!.dmThreadId!, senderUserId: REPORTER, body: `It's on the bottling page with a 500 error [Ref: ${cl1!.ref}]` });
  const cl1b = await owner.feedbackClarification.findUnique({ where: { id: cl1!.id }, select: { status: true } });
  const run2 = await owner.automationRun.findFirst({ where: { tenantId: ORG, ticketId: "T1", attempt: 2 }, select: { status: true } });
  check("reply: clarification ANSWERED", cl1b?.status === "ANSWERED");
  check("reply: attempt-2 re-dispatched (QUEUED, no CI)", run2?.status === "QUEUED");

  // 3) REPLY (non-substantive): escalates to human (SKIPPED), no attempt-2.
  await ticketAndRun("T2", "R2");
  const ask2 = await requestClarificationCore({ tenantId: ORG, source: { sourceType: "FEEDBACK_TICKET", sourceId: "T2" }, automationRunId: "R2", round: 1, questions: ["What page?"] });
  const cl2 = await owner.feedbackClarification.findFirst({ where: { tenantId: ORG, sourceId: "T2" }, select: { ref: true, dmThreadId: true } });
  await advanceClarificationFromReply({ tenantId: ORG, threadId: cl2!.dmThreadId!, senderUserId: REPORTER, body: `idk [Ref: ${cl2!.ref}]` });
  const t2 = await owner.feedbackTicket.findUnique({ where: { id: "T2" }, select: { automationStatus: true } });
  const t2run2 = await owner.automationRun.findFirst({ where: { tenantId: ORG, ticketId: "T2", attempt: 2 } });
  check("non-substantive: escalated to human (SKIPPED)", ask2.ok && t2?.automationStatus === "SKIPPED");
  check("non-substantive: no attempt-2 run", !t2run2);

  // 4) TTL SWEEP: an OPEN clarification past its TTL is cancelled + source moved to human triage.
  await ticketAndRun("T3", "R3");
  await owner.feedbackClarification.create({ data: { tenantId: ORG, id: "C3", sourceType: "FEEDBACK_TICKET", sourceId: "T3", ticketId: "T3", automationRunId: "R3", round: 1, ref: "BUG-TTL9", reporterUserId: REPORTER, questions: "q", askedByUserId: SUPPORT_USER_ID, status: "OPEN", askedAt: new Date(Date.now() - 8 * 86_400_000) } });
  await owner.$executeRawUnsafe(`UPDATE automation_run SET status='AWAITING_CLARIFICATION' WHERE id='R3'`);
  const swept = await runFeedbackAutomationSweep({ tenantId: ORG });
  const c3 = await owner.feedbackClarification.findUnique({ where: { id: "C3" }, select: { status: true } });
  const t3 = await owner.feedbackTicket.findUnique({ where: { id: "T3" }, select: { automationStatus: true } });
  check("sweep: TTL clarification CANCELLED", c3?.status === "CANCELLED");
  check("sweep: source moved to human triage (SKIPPED)", t3?.automationStatus === "SKIPPED");
  check("sweep: summary counts one expired", swept.clarificationsExpired >= 1);

  await cleanup();

  let allOk = true;
  for (const [label, ok] of results) { console.log(`${ok ? "✓" : "✗"}  ${label}`); allOk = allOk && ok; }
  console.log(allOk ? "\nALL CLARIFICATION-LOOP CHECKS PASSED ✓" : "\nSOME CHECKS FAILED ✗");
  await owner.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await cleanup().catch(() => {}); await owner.$disconnect(); process.exit(1); });
