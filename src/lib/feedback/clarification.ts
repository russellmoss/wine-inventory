import "server-only";
import { randomBytes } from "node:crypto";
import { FeedbackAutomationStatus, FeedbackClarificationStatus, Prisma } from "@prisma/client";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { sendDirectMessageCore } from "@/lib/inbox/direct-messages";
import { ensureSupportSenderForTenant } from "@/lib/feedback/support-sender";
import {
  parkRunForClarification,
  recordAutomationGate,
  approveAutomationRun,
  dispatchApprovedRun,
  type FeedbackSource,
} from "@/lib/feedback/automation";

// Plan 079, Unit 6: ask a bug reporter for missing details.
//
// Ordering (council C-3.1, lost-reply race): persist the OPEN FeedbackClarification row and park
// run+source in ONE committed tx BEFORE sending the DM, then patch the DM ids after send. A fast
// reply can never arrive before the row exists (the reply requires the DM, which we send last).
// Uniqueness (council C-3.2): the DB arbitrates "one OPEN per source" via a partial unique — we
// insert-first and treat 23505 as "already open" instead of pre-checking. round is the clarification
// round (council C-3.3), distinct from the automation attempt.

const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Crockford-ish, no ambiguous chars
const MAX_QUESTIONS = 4;
const MAX_ANSWER_CHARS = 6000;

/** Loop guard: after this many rounds, escalate to a human instead of re-asking (council). */
export const MAX_CLARIFICATION_ROUNDS = 2;

export type RequestClarificationInput = {
  tenantId: string;
  source: FeedbackSource;
  automationRunId: string;
  round: number;
  questions: string[];
};

export type RequestClarificationResult =
  | { ok: true; clarificationId: string; ref: string; threadId: string }
  | { ok: false; reason: "ALREADY_OPEN" | "NO_REPORTER" | "SOURCE_NOT_FOUND" };

/** Short human-facing reply token embedded in the DM, e.g. "BUG-7Q2F". */
export function makeClarificationRef(): string {
  const bytes = randomBytes(4);
  let out = "";
  for (let i = 0; i < 4; i++) out += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
  return `BUG-${out}`;
}

/** The clarification DM copy (design D-2): honest that it's automated + carries the ref token. */
export function buildClarificationDmBody(input: { title: string; ref: string; questions: string[] }): string {
  const qs = input.questions
    .slice(0, MAX_QUESTIONS)
    .map((q) => `• ${q.trim()}`)
    .join("\n");
  return [
    `**Cellarhand Support** (automated triage)`,
    ``,
    `Thanks for reporting "${input.title}". I'm Cellarhand's automated triage — reply right here with the details and I'll pass them straight to engineering, no need to wait for a person.`,
    ``,
    `To fix this well I need:`,
    qs,
    ``,
    `_(Ref: ${input.ref} — please keep this in your reply.)_`,
  ].join("\n");
}

function isUniqueViolation(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return true;
  const code = (e as { code?: unknown })?.code;
  const msg = String((e as { message?: string })?.message ?? "");
  return code === "23505" || msg.includes("23505");
}

/**
 * Ask the reporter of `source` for more detail. Idempotent per source (≤1 OPEN, DB-enforced).
 * Returns ALREADY_OPEN if one is already open, NO_REPORTER if the reporter is gone (caller should
 * escalate to human triage), or ok with the created clarification.
 */
export async function requestClarificationCore(
  input: RequestClarificationInput,
): Promise<RequestClarificationResult> {
  const { tenantId, source, automationRunId, round, questions } = input;

  // 1) Read the reporter + a title for the DM (tenant-scoped read).
  const reporter = await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      if (source.sourceType === "FEEDBACK_TICKET") {
        const t = await tx.feedbackTicket.findUnique({
          where: { id: source.sourceId },
          select: { actorUserId: true, title: true },
        });
        return t ? { actorUserId: t.actorUserId, title: t.title } : null;
      }
      const f = await tx.assistantFeedback.findUnique({
        where: { id: source.sourceId },
        select: { actorUserId: true },
      });
      return f ? { actorUserId: f.actorUserId, title: "the assistant reply you flagged" } : null;
    }),
  );
  if (!reporter) return { ok: false, reason: "SOURCE_NOT_FOUND" };
  if (!reporter.actorUserId) return { ok: false, reason: "NO_REPORTER" };
  const reporterUserId = reporter.actorUserId;

  // 2) Ensure the Cellarhand Support sender (owner-side; idempotent).
  const support = await ensureSupportSenderForTenant(tenantId);
  if (support.userId === reporterUserId) return { ok: false, reason: "NO_REPORTER" };

  // 3) Persist the OPEN row + park run/source in ONE committed tx, BEFORE sending the DM (C-3.1).
  //    A pre-check inside the tx gives the clean "already open" answer (one OPEN per source, and one
  //    clarification per run for workflow-retry idempotency); the DB partial-unique is the hard
  //    backstop, so a concurrent race throws P2002 → we retry, and the retry's pre-check returns
  //    ALREADY_OPEN. (Postgres aborts a tx on a caught constraint error, so we never catch inside it.)
  let ref = makeClarificationRef();
  let created: { clarificationId: string } | { alreadyOpen: true } | undefined;
  for (let attempt = 0; attempt < 4 && !created; attempt++) {
    try {
      created = await runAsTenant(tenantId, () =>
        runInTenantTx(async (tx) => {
          const existing = await tx.feedbackClarification.findFirst({
            where: {
              OR: [
                { sourceType: source.sourceType, sourceId: source.sourceId, status: FeedbackClarificationStatus.OPEN },
                { automationRunId },
              ],
            },
            select: { id: true },
          });
          if (existing) return { alreadyOpen: true as const };
          const row = await tx.feedbackClarification.create({
            data: {
              sourceType: source.sourceType,
              sourceId: source.sourceId,
              ticketId: source.sourceType === "FEEDBACK_TICKET" ? source.sourceId : null,
              assistantFeedbackId: source.sourceType === "ASSISTANT_FEEDBACK" ? source.sourceId : null,
              automationRunId,
              round,
              ref,
              reporterUserId,
              questions: questions.map((q) => q.trim()).filter(Boolean).join("\n"),
              askedByUserId: support.userId,
              status: FeedbackClarificationStatus.OPEN,
            },
            select: { id: true },
          });
          await parkRunForClarification(tx, { source, runId: automationRunId });
          return { clarificationId: row.id };
        }),
      );
    } catch (e) {
      if (isUniqueViolation(e)) {
        ref = makeClarificationRef(); // ref collision or lost race → retry (pre-check catches a race)
        continue;
      }
      throw e;
    }
  }
  if (!created) throw new Error("requestClarificationCore: could not persist clarification");
  if ("alreadyOpen" in created) return { ok: false, reason: "ALREADY_OPEN" };

  // 4) Send the DM as Cellarhand Support (row already committed, so a reply can't be lost).
  const body = buildClarificationDmBody({ title: reporter.title, ref, questions });
  const dm = await runAsTenant(
    tenantId,
    () => sendDirectMessageCore({ actorUserId: support.userId, actorEmail: support.email }, { recipientUserId: reporterUserId, body }),
    { userId: support.userId },
  );

  // 5) Patch the DM ids onto the clarification (for reply-hook thread matching, C-3.8).
  await runAsTenant(tenantId, () =>
    runInTenantTx((tx) =>
      tx.feedbackClarification.update({
        where: { id: created.clarificationId },
        data: { dmThreadId: dm.threadId, dmMessageId: dm.messageId },
      }),
    ),
  );

  return { ok: true, clarificationId: created.clarificationId, ref, threadId: dm.threadId };
}

// ── Unit 9: the reporter's reply closes the loop and re-dispatches ──────────────

/** Parse the [Ref: BUG-XXXX] token out of a reply body (case-insensitive), or null. */
export function parseRefToken(body: string): string | null {
  const m = body.match(/BUG-[A-HJ-NP-Z2-9]{4}/i);
  return m ? m[0].toUpperCase() : null;
}

const TRIVIAL_ANSWER = /^(idk|dunno|no|nope|not sure|n\/?a|yes|ok|k|maybe|\?+)\.?$/i;

/**
 * Is the reply substantive enough to spend a CI run on? Cheap deterministic intent check
 * (council C-2): trivial one-word / "idk" answers route to a human instead of re-dispatching.
 */
export function isSubstantiveAnswer(body: string): boolean {
  const t = body.trim();
  if (t.length < 12) return false;
  if (TRIVIAL_ANSWER.test(t)) return false;
  return true;
}

async function escalateClarificationToHuman(
  tenantId: string,
  source: FeedbackSource,
  runId: string | null,
  reason: string,
): Promise<void> {
  await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      if (runId) {
        await tx.automationRun.updateMany({
          where: { id: runId },
          data: { status: FeedbackAutomationStatus.SKIPPED, completedAt: new Date(), error: reason.slice(0, 1000) },
        });
      }
      const data = { automationStatus: FeedbackAutomationStatus.SKIPPED };
      if (source.sourceType === "FEEDBACK_TICKET") {
        await tx.feedbackTicket.update({ where: { id: source.sourceId }, data });
      } else {
        await tx.assistantFeedback.update({ where: { id: source.sourceId }, data });
      }
    }),
  );
}

async function redispatchAfterClarification(
  tenantId: string,
  source: FeedbackSource,
  prevRunId: string | null,
): Promise<void> {
  // Read the source's mode + kind and the previous attempt so the re-run is attempt+1.
  const ctx = await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      const prev = prevRunId
        ? await tx.automationRun.findUnique({ where: { id: prevRunId }, select: { attempt: true } })
        : null;
      if (source.sourceType === "FEEDBACK_TICKET") {
        const t = await tx.feedbackTicket.findUnique({
          where: { id: source.sourceId },
          select: { modeAtSubmission: true, kind: true },
        });
        return { attempt: prev?.attempt ?? 1, mode: t?.modeAtSubmission ?? null, ticketKind: t?.kind };
      }
      const f = await tx.assistantFeedback.findUnique({
        where: { id: source.sourceId },
        select: { modeAtSubmission: true },
      });
      return { attempt: prev?.attempt ?? 1, mode: f?.modeAtSubmission ?? null, ticketKind: undefined };
    }),
  );
  if (!ctx.mode) return;

  const nextAttempt = ctx.attempt + 1;
  const support = await ensureSupportSenderForTenant(tenantId);

  // New run at AWAITING_APPROVAL (attempt+1 mints a fresh idempotency key).
  const newRun = await runAsTenant(tenantId, () =>
    runInTenantTx((tx) =>
      recordAutomationGate(tx, {
        tenantId,
        sourceType: source.sourceType,
        sourceId: source.sourceId,
        ...(source.sourceType === "FEEDBACK_TICKET" ? { ticketKind: ctx.ticketKind } : {}),
        mode: ctx.mode!,
        attempt: nextAttempt,
      }),
    ),
  );
  if (!newRun) return; // REPORT_ONLY / feature-request → nothing to dispatch

  // Auto-approve the re-run (user decision after council) + point the source at it.
  await approveAutomationRun({ tenantId, runId: newRun.id, approverUserId: support.userId });
  await runAsTenant(tenantId, () =>
    runInTenantTx(async (tx) => {
      const data = { currentAutomationRunId: newRun.id };
      if (source.sourceType === "FEEDBACK_TICKET") await tx.feedbackTicket.update({ where: { id: source.sourceId }, data });
      else await tx.assistantFeedback.update({ where: { id: source.sourceId }, data });
    }),
  );
  await dispatchApprovedRun(newRun.id, tenantId); // no GitHub token → degrades to QUEUED
}

/**
 * Post-send hook (from the DM action). If the sender is a reporter answering an OPEN clarification
 * on this thread, mark it ANSWERED (atomic, double-reply safe) and either re-dispatch attempt+1 or
 * escalate to a human (non-substantive reply / round cap). Best-effort: never throws to the caller,
 * so a feedback hiccup can't break sending a normal DM. Explicit tenantId (council C-3.8).
 */
export async function advanceClarificationFromReply(input: {
  tenantId: string;
  threadId: string;
  senderUserId: string;
  body: string;
}): Promise<void> {
  try {
    const open = await runAsTenant(input.tenantId, () =>
      runInTenantTx((tx) =>
        tx.feedbackClarification.findMany({
          where: { reporterUserId: input.senderUserId, dmThreadId: input.threadId, status: FeedbackClarificationStatus.OPEN },
          select: { id: true, ref: true, round: true, sourceType: true, sourceId: true, automationRunId: true },
          orderBy: { askedAt: "desc" },
        }),
      ),
    );
    if (!open.length) return; // ordinary DM, not a clarification reply

    // Route the reply: prefer the [Ref] token; else if exactly one is open, use it; else ask for the ref.
    const token = parseRefToken(input.body);
    const target = token ? open.find((c) => c.ref === token) : open.length === 1 ? open[0] : undefined;
    if (!target) {
      if (!token && open.length > 1) {
        const support = await ensureSupportSenderForTenant(input.tenantId);
        const refs = open.map((c) => c.ref).join(", ");
        await runAsTenant(
          input.tenantId,
          () =>
            sendDirectMessageCore(
              { actorUserId: support.userId, actorEmail: support.email },
              { recipientUserId: input.senderUserId, body: `Thanks! You have a few open questions (${refs}). Please include the code in [brackets] so I route your answer to the right bug.` },
            ),
          { userId: support.userId },
        );
      }
      return;
    }

    const source: FeedbackSource =
      target.sourceType === "FEEDBACK_TICKET"
        ? { sourceType: "FEEDBACK_TICKET", sourceId: target.sourceId }
        : { sourceType: "ASSISTANT_FEEDBACK", sourceId: target.sourceId };

    // Atomic answer (double-reply race, council C-3.6): only the winner of the OPEN→ANSWERED flip proceeds.
    const answered = await runAsTenant(input.tenantId, () =>
      runInTenantTx((tx) =>
        tx.feedbackClarification.updateMany({
          where: { id: target.id, status: FeedbackClarificationStatus.OPEN },
          data: {
            status: FeedbackClarificationStatus.ANSWERED,
            answerBody: input.body.slice(0, MAX_ANSWER_CHARS),
            answeredAt: new Date(),
            answeredByUserId: input.senderUserId,
          },
        }),
      ),
    );
    if (answered.count !== 1) return; // someone/something else already answered

    // Intent check on the answer TEXT only — strip the routing token so "idk [Ref: BUG-X]" reads as "idk".
    const answerText = input.body.replace(/\[?\s*ref:\s*BUG-[A-HJ-NP-Z2-9]{4}\s*\]?/i, "").trim();
    if (!isSubstantiveAnswer(answerText)) {
      await escalateClarificationToHuman(input.tenantId, source, target.automationRunId, "non-substantive reply");
      return;
    }
    if (target.round >= MAX_CLARIFICATION_ROUNDS) {
      await escalateClarificationToHuman(input.tenantId, source, target.automationRunId, "max clarification rounds reached");
      return;
    }

    await redispatchAfterClarification(input.tenantId, source, target.automationRunId);
  } catch (e) {
    // Never break sending a DM because a feedback side-effect failed.
    console.error("advanceClarificationFromReply failed (non-fatal):", e);
  }
}
