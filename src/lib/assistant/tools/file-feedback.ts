import "server-only";
import type { AssistantTool } from "../registry";
import type { Committer } from "../commit";
import { signProposal } from "../confirm";
import { FeedbackTicketKind } from "@prisma/client";
import { createFeedbackTicket } from "@/lib/feedback/tickets";

// Assistant feedback tool (plan 055) — file a BUG_REPORT or FEATURE_REQUEST from chat/voice, so the
// assistant is no longer a dead end for "report this as a bug". Wraps createFeedbackTicket (the same
// path the Help-page form and the 👍/👎 loop use), which records the automation gate that feeds the
// feedback-fix workflow. The model composes `title`/`body` from the conversation it already holds —
// ToolContext carries no conversation snapshot, so the content is passed as input args. Confirm-before-
// write like every other write tool: run() returns a proposal token; the committer does the insert.

const MAX_TITLE = 160;
const MAX_BODY = 6000;
const PREVIEW_BODY = 160;

type FileFeedbackRawInput = {
  kind?: unknown;
  title?: unknown;
  body?: unknown;
};

function normalizeKind(kind: unknown): "bug" | "feature" | null {
  if (kind === "bug" || kind === "feature") return kind;
  return null;
}

function ticketKindOf(kind: "bug" | "feature"): FeedbackTicketKind {
  return kind === "feature" ? FeedbackTicketKind.FEATURE_REQUEST : FeedbackTicketKind.BUG_REPORT;
}

function labelOf(kind: "bug" | "feature"): string {
  return kind === "feature" ? "feature request" : "bug report";
}

export const fileFeedbackTool: AssistantTool = {
  name: "file_feedback",
  description:
    "File a bug report or feature request to the product team from the conversation. Use this when the user asks to 'report this as a bug', 'file feedback', 'submit a feature request', or otherwise wants something they hit or want sent to the dev/product team — you CAN do this now, do not tell the user you can't. Compose a concise `title` and a `body` that captures the problem (or the requested capability) plus the relevant context from this conversation: what they were doing, what happened vs. what they expected, and any vessel/lot/work-order/block names involved. Set `kind` to 'bug' for something broken or wrong, 'feature' for a new capability or enhancement. Does NOT submit immediately — returns a preview to confirm.",
  kind: "write",
  inputSchema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["bug", "feature"],
        description: "'bug' for something broken/wrong, 'feature' for a new capability or enhancement request.",
      },
      title: {
        type: "string",
        description: "A short one-line summary of the bug or request (max 160 chars).",
      },
      body: {
        type: "string",
        description:
          "The full report: what the user was doing, what happened vs. expected (for a bug) or the capability wanted and why (for a feature), plus any relevant vessel/lot/work-order/block context from the conversation.",
      },
    },
    required: ["kind", "title", "body"],
  },
  async run(_ctx, rawInput) {
    const input = (rawInput ?? {}) as FileFeedbackRawInput;
    const kind = normalizeKind(input.kind);
    if (!kind) throw new Error('Tell me whether this is a "bug" or a "feature" request.');
    const title = (typeof input.title === "string" ? input.title : "").trim();
    const body = (typeof input.body === "string" ? input.body : "").trim();
    if (!title) throw new Error("Give the report a short title.");
    if (!body) throw new Error("Add a sentence or two describing it.");

    const clippedTitle = title.slice(0, MAX_TITLE);
    const clippedBody = body.slice(0, MAX_BODY);
    const bodySnippet = clippedBody.length > PREVIEW_BODY ? `${clippedBody.slice(0, PREVIEW_BODY)}…` : clippedBody;
    const preview = `File a ${labelOf(kind)}: "${clippedTitle}" — ${bodySnippet}`;

    const token = signProposal("file_feedback", { kind, title: clippedTitle, body: clippedBody });
    return { needsConfirmation: true, preview, token };
  },
};

export const commitFileFeedback: Committer = async (user, args) => {
  const kind = normalizeKind(args.kind) ?? "bug";
  const tenantId = user.supportOrganizationId ?? user.activeOrganizationId;
  if (!tenantId) throw new Error("No active winery in context.");
  const title = String(args.title ?? "");
  const body = String(args.body ?? "");

  try {
    await createFeedbackTicket({
      tenantId,
      kind: ticketKindOf(kind),
      title,
      body,
      actorUserId: user.id,
      actorEmail: user.email,
    });
    return {
      message: `Filed your ${labelOf(kind)} — thanks. The team will see it in the feedback queue.`,
      navigate: { path: "/help/feedback", label: "My reports" },
    };
  } catch (e) {
    // e.g. the createFeedbackTicket guard that a FEATURE_REQUEST can't run under AGENTIC_FIX mode.
    const reason = e instanceof Error ? e.message : "Could not file the report.";
    return { message: `I couldn't file that: ${reason}` };
  }
};
