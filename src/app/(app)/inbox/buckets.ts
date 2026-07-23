import "server-only";
import { FeedbackItemStatus, WorkOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runAsTenant } from "@/lib/tenant/context";
import type { MyTicketRow, MyWorkOrderRow, TicketFilter, WorkOrderFilter } from "@/lib/inbox/types";

// Plan 068 Unit 7 — the Work-Orders and Tickets buckets are LIVE filtered queries over the existing
// tables (never copied inbox rows), scoped to "only mine" at the app layer (assigneeId / actorUserId ==
// me). Mirrors the my-reports.ts "my tickets" reader (amendment 12) with a reporter-safe select.

/** My work orders (assignee == me), default = open (not cancelled/approved), filterable. */
export async function listMyWorkOrders(
  tenantId: string,
  userId: string,
  filter: WorkOrderFilter,
): Promise<MyWorkOrderRow[]> {
  const statusWhere =
    filter === "completed"
      ? { status: { in: [WorkOrderStatus.APPROVED] } }
      : filter === "in-progress"
        ? { status: { in: [WorkOrderStatus.IN_PROGRESS, WorkOrderStatus.PENDING_APPROVAL] } }
        : { status: { notIn: [WorkOrderStatus.CANCELLED, WorkOrderStatus.APPROVED] } };
  return runAsTenant(
    tenantId,
    async () => {
      const rows = await prisma.workOrder.findMany({
        where: { assigneeId: userId, ...statusWhere },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: { id: true, number: true, title: true, status: true, dueAt: true, dueAtHasTime: true, updatedAt: true },
      });
      return rows.map((r) => ({
        id: r.id,
        number: r.number,
        title: r.title,
        status: r.status,
        dueAt: r.dueAt ? r.dueAt.toISOString() : null,
        dueAtHasTime: r.dueAtHasTime,
        updatedAt: r.updatedAt.toISOString(),
      }));
    },
    { userId },
  );
}

/** My feedback tickets (submitter == me), default = open, filterable to closed. Reporter-safe columns
 *  only (mirrors my-reports.ts). */
export async function listMyTickets(tenantId: string, userId: string, filter: TicketFilter): Promise<MyTicketRow[]> {
  const statusWhere =
    filter === "closed"
      ? { status: { in: [FeedbackItemStatus.RESOLVED, FeedbackItemStatus.DISMISSED] } }
      : { status: { in: [FeedbackItemStatus.NEW, FeedbackItemStatus.TRIAGED, FeedbackItemStatus.IN_PROGRESS] } };
  return runAsTenant(
    tenantId,
    async () => {
      const rows = await prisma.feedbackTicket.findMany({
        where: { actorUserId: userId, ...statusWhere },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, kind: true, title: true, status: true, createdAt: true, resolvedAt: true },
      });
      return rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
      }));
    },
    { userId },
  );
}
