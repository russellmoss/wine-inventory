import "server-only";
import { randomBytes } from "node:crypto";
import { FeedbackAutomationStatus, FeedbackClarificationStatus, Prisma } from "@prisma/client";
import { runAsTenant } from "@/lib/tenant/context";
import { runInTenantTx } from "@/lib/tenant/tx";
import { sendDirectMessageCore } from "@/lib/inbox/direct-messages";
import { ensureSupportSenderForTenant } from "@/lib/feedback/support-sender";
import { parkRunForClarification, type FeedbackSource } from "@/lib/feedback/automation";

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
