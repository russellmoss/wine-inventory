import "server-only";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/dal";

/**
 * Reporter-facing read: the CURRENT user's OWN submitted feedback + its lifecycle status, so
 * they can see that what they reported was seen and worked (the read side of what /bug-triage
 * writes via triage:resolve).
 *
 * Scope + safety:
 *   - Session-tenant-scoped: this runs in an RSC read, so the Prisma extension resolves the
 *     tenant from the verified session (src/lib/tenant/resolve.ts) — NOT the developer
 *     cross-tenant reader (getDeveloperFeedbackData). RLS enforces isolation.
 *   - Own-only: filtered to actorUserId === the signed-in user.
 *   - Reporter-safe: returns a NARROW whitelisted shape only. NEVER expose developerNotes,
 *     prUrl, githubIssueUrl, severity, automationStatus, or debugContext to a customer.
 */

export type MyReport = {
  sourceType: "FEEDBACK_TICKET" | "ASSISTANT_FEEDBACK";
  id: string;
  kind: string; // "BUG_REPORT" | "FEATURE_REQUEST" | "Assistant"
  title: string;
  status: string; // NEW | TRIAGED | IN_PROGRESS | RESOLVED | DISMISSED
  createdAt: string; // ISO
  resolvedAt: string | null; // ISO, when the item was resolved
};

export async function getMyReports(): Promise<MyReport[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const [tickets, assistant] = await Promise.all([
    prisma.feedbackTicket.findMany({
      where: { actorUserId: user.id },
      orderBy: { createdAt: "desc" },
      // Whitelist: only reporter-safe columns leave the DB.
      select: { id: true, kind: true, title: true, status: true, createdAt: true, resolvedAt: true },
    }),
    prisma.assistantFeedback.findMany({
      where: { actorUserId: user.id, rating: "down" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true, resolvedAt: true },
    }),
  ]);

  const ticketReports: MyReport[] = tickets.map((t) => ({
    sourceType: "FEEDBACK_TICKET",
    id: t.id,
    kind: t.kind,
    title: t.title,
    status: t.status,
    createdAt: t.createdAt.toISOString(),
    resolvedAt: t.resolvedAt ? t.resolvedAt.toISOString() : null,
  }));

  const assistantReports: MyReport[] = assistant.map((a) => ({
    sourceType: "ASSISTANT_FEEDBACK",
    id: a.id,
    kind: "Assistant",
    title: "Assistant feedback",
    status: a.status,
    createdAt: a.createdAt.toISOString(),
    resolvedAt: a.resolvedAt ? a.resolvedAt.toISOString() : null,
  }));

  return [...ticketReports, ...assistantReports].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}
