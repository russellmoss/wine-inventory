// Phase 9.1: pure filter/param helpers for the work-order list — used by BOTH the OPEN dashboard and the
// finalized ARCHIVE. No prisma import (unit-tested directly). Open + archive share the same filters
// (status/date/assignee/template/vessel/search); they differ only in the base status set and which date
// column the range applies to (open → dueAt, archive → updatedAt when it was finalized).

export const ARCHIVE_STATUSES = ["APPROVED", "CANCELLED"] as const;
export const OPEN_STATUSES = ["ISSUED", "IN_PROGRESS", "PENDING_APPROVAL"] as const;

export type WorkOrderFilters = {
  status?: string; // narrows within the view's base status set
  from?: string; // ISO date (>= start-of-day)
  to?: string; // ISO date (<= end-of-day)
  assigneeEmail?: string;
  templateId?: string;
  vesselIds?: string[]; // match tasks touching ANY of these vessels (source or dest)
  q?: string; // matches title (contains) or exact WO number
};
/** Back-compat alias (the archive was here first). */
export type ArchiveFilters = WorkOrderFilters;

export const ARCHIVE_PAGE_SIZE = 25;

/** Parse a URLSearchParams-like map into typed filters; the status is validated against `allowed`. */
export function parseWorkOrderFilters(params: Record<string, string | string[] | undefined>, allowed: readonly string[]): WorkOrderFilters {
  const one = (v: string | string[] | undefined): string | undefined => {
    const s = Array.isArray(v) ? v[0] : v;
    return s && s.trim() ? s.trim() : undefined;
  };
  const status = one(params.status);
  // vesselId may arrive as a comma-joined string (our serialization) or a repeated param. Both → string[].
  const raw = params.vesselId ?? params.vesselIds;
  const vesselList = (Array.isArray(raw) ? raw : raw ? raw.split(",") : []).map((s) => s.trim()).filter(Boolean);
  return {
    status: status && allowed.includes(status) ? status : undefined,
    from: one(params.from),
    to: one(params.to),
    assigneeEmail: one(params.assigneeEmail),
    templateId: one(params.templateId),
    vesselIds: vesselList.length ? vesselList : undefined,
    q: one(params.q),
  };
}

export const parseArchiveFilters = (params: Record<string, string | string[] | undefined>) => parseWorkOrderFilters(params, ARCHIVE_STATUSES);
export const parseOpenFilters = (params: Record<string, string | string[] | undefined>) => parseWorkOrderFilters(params, OPEN_STATUSES);

/** Serialize filters back to a querystring (stable key order; blanks omitted). */
export function serializeWorkOrderFilters(f: WorkOrderFilters): string {
  const sp = new URLSearchParams();
  for (const key of ["status", "from", "to", "assigneeEmail", "templateId", "q"] as const) {
    const v = f[key];
    if (v) sp.set(key, v);
  }
  if (f.vesselIds?.length) sp.set("vesselId", f.vesselIds.join(","));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
export const serializeArchiveFilters = serializeWorkOrderFilters;

// A permissive shape for the where object — the DB layer passes it straight to Prisma. Kept as `unknown`
// values so this file needs no @prisma/client import (stays pure + fast to unit test).
export type ArchiveWhere = Record<string, unknown>;

/** Shared clause builder: assignee (case-insensitive contains), template, vessel (any of), title/number search. */
function applyCommonFilters(where: ArchiveWhere, f: WorkOrderFilters): void {
  if (f.assigneeEmail) where.assigneeEmail = { contains: f.assigneeEmail, mode: "insensitive" };
  if (f.templateId) where.templateVersion = { templateId: f.templateId };
  if (f.vesselIds?.length) where.tasks = { some: { OR: [{ destVesselId: { in: f.vesselIds } }, { sourceVesselId: { in: f.vesselIds } }] } };
  if (f.q) {
    const num = Number(f.q);
    const or: ArchiveWhere[] = [{ title: { contains: f.q, mode: "insensitive" } }];
    // WorkOrder.number is a Postgres int4 — cap at 2^31-1 so a huge numeric search doesn't overflow and 500.
    if (Number.isInteger(num) && num > 0 && num <= 2147483647) or.push({ number: num });
    where.OR = or;
  }
}

/** Inclusive date range on `col` (end-of-day for `to`). */
function applyDateRange(where: ArchiveWhere, f: WorkOrderFilters, col: string): void {
  const range: Record<string, Date> = {};
  if (f.from) { const d = new Date(f.from); if (!Number.isNaN(d.getTime())) range.gte = d; }
  if (f.to) { const d = new Date(f.to); if (!Number.isNaN(d.getTime())) { d.setHours(23, 59, 59, 999); range.lte = d; } }
  if (Object.keys(range).length) where[col] = range;
}

/**
 * Build the Prisma `where` for the FINALIZED archive (status ∈ {APPROVED, CANCELLED}; a status filter
 * narrows to one). Date range applies to `updatedAt` (when it was finalized).
 */
export function buildArchiveWhere(f: WorkOrderFilters): ArchiveWhere {
  const where: ArchiveWhere = {};
  where.status = f.status ? f.status : { in: [...ARCHIVE_STATUSES] };
  applyDateRange(where, f, "updatedAt");
  applyCommonFilters(where, f);
  return where;
}

/**
 * Build the Prisma `where` for the OPEN dashboard (status ∈ {ISSUED, IN_PROGRESS, PENDING_APPROVAL}; a
 * status filter narrows to one). Date range applies to `dueAt` (open work is planned by due date).
 */
export function buildOpenWhere(f: WorkOrderFilters): ArchiveWhere {
  const where: ArchiveWhere = {};
  where.status = f.status ? f.status : { in: [...OPEN_STATUSES] };
  applyDateRange(where, f, "dueAt");
  applyCommonFilters(where, f);
  return where;
}
